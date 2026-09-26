"""Shared, credential-safe transport for explicit local infrastructure checks.

Importing this module does not contact Docker. Probe images must already exist;
verification never pulls images, provisions accounts or edits business records.
"""

from contextlib import contextmanager
import json
from pathlib import Path
import queue
import re
import subprocess
import threading
import time
import uuid
from process_runtime import run_command

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "python:3.13-alpine"
SERVICES = ("identity", "travel", "payments")


class VerificationError(RuntimeError):
    pass


def docker(*arguments, timeout=60, payload=None):
    result = run_command(
        ["docker", *arguments], cwd=ROOT, input=payload, capture_output=True,
        text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    if result.returncode:
        # Docker output can contain configuration or responses; do not echo it.
        raise VerificationError("Docker command failed: " + " ".join(arguments[:2]))
    return result.stdout + result.stderr if arguments[0] == "logs" else result.stdout


def validate_project(project):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", project):
        raise VerificationError("Use a valid Compose project name")
    return project


def running_replicas(project, service):
    return docker(
        "ps", "--filter", "label=com.docker.compose.project=" + project,
        "--filter", "label=com.docker.compose.service=" + service,
        "--format", "{{.ID}}",
    ).split()


def wait_healthy(container, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = json.loads(docker("inspect", "--format", "{{json .State}}", container))
        if state.get("Running") and state.get("Health", {}).get("Status") == "healthy":
            return
        time.sleep(2)
    raise VerificationError("Replica did not become healthy: " + container)


@contextmanager
def temporarily_stop(container, restore_timeout=180, restoration=None):
    """Even failed/interrupting stops enter the restoration path."""
    try:
        docker("stop", "--time", "20", container, timeout=45)
        yield
    finally:
        try:
            docker("start", container)
            wait_healthy(container, restore_timeout)
            if restoration is not None:
                restoration["restored"] = True
        except Exception as error:
            raise VerificationError(
                "RESTORATION NEEDS ATTENTION. Run docker start " + container
                + " and check its health. No volumes were removed."
            ) from error


WORKER = r'''
import http.cookiejar, json, ssl, sys, time, urllib.error, urllib.parse, urllib.request, uuid
ctx = ssl.create_default_context(cafile='/certs/ca.crt')
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx), urllib.request.HTTPCookieProcessor(jar))
csrf = None
def request(path, request_id, body=None):
    headers = {'Host': 'localhost:8443', 'Origin': 'https://localhost:8443', 'X-Request-ID': request_id}
    if body is not None:
        headers['Content-Type'] = 'application/json'
        if csrf: headers['X-CSRF-Token'] = csrf
    req = urllib.request.Request('https://dashboard:8443' + path, headers=headers, data=None if body is None else json.dumps(body).encode())
    started = time.monotonic()
    with opener.open(req, timeout=8) as response:
        content = response.read()
        return response.status, json.loads(content) if content else {}, response.headers.get('X-Request-ID'), round((time.monotonic()-started)*1000, 2)
for line in sys.stdin:
    try:
        payload = json.loads(line)
        action = payload['action']
        if action == 'login':
            status, user, request_id, elapsed = request('/api/auth/login', payload['request_id'], {'email':payload['email'], 'password':payload['password']})
            csrf = user['csrf']
            result = {'ok':status == 200, 'status':status}
        elif action == 'read':
            path = payload['path']
            if path not in ['/api/auth/me', '/api/travels', '/api/payments']: raise ValueError('Read path is not allowlisted')
            status, body, request_id, elapsed = request(path, payload['request_id'])
            shape = isinstance(body, list) if path != '/api/auth/me' else isinstance(body, dict) and bool(body.get('id'))
            result = {'ok':status == 200 and shape and request_id == payload['request_id'], 'status':status, 'request_id':request_id, 'elapsed_ms':elapsed}
        elif action == 'providers':
            status, body, request_id, elapsed = request('/api/payments', payload['request_id'])
            result = {'ok':status == 200 and isinstance(body, list), 'gateways':[
                {'id':str(row['id']), 'provider':row['provider'], 'configured':bool(row['configured'])}
                for row in body]}
        elif action == 'test_provider':
            gateway_id = str(uuid.UUID(payload['gateway_id']))
            status, body, request_id, elapsed = request('/api/payments/' + gateway_id + '/test', payload['request_id'], {})
            result = {'ok':status == 200, 'status':status}
        elif action == 'logout':
            status, body, request_id, elapsed = request('/api/auth/logout', payload['request_id'], {})
            result = {'ok':status in [200,204]}
        else: raise ValueError('Unknown action')
    except urllib.error.HTTPError as error:
        result = {'ok':False, 'status':error.code, 'error':'HTTPError'}
    except Exception as error:
        result = {'ok':False, 'error':type(error).__name__}
    print(json.dumps(result), flush=True)
'''


class AuthenticatedProbe:
    """A private worker retains its cookie; credentials travel on stdin only."""
    def __init__(self, project, credentials=None):
        self.project = validate_project(project)
        self.name = project + "-verification-" + uuid.uuid4().hex[:12]
        self.credentials = credentials
        self.process = None
        self.answers = queue.Queue()

    def __enter__(self):
        if self.credentials:
            login = json.loads(Path(self.credentials).read_text())
        else:
            state = json.loads((ROOT / ".secrets/bootstrap.json").read_text())
            login = {"email":"admin@travelplan.local", "password":state["ADMIN_PASSWORD"]}
        self.process = subprocess.Popen(
            ["docker", "run", "--rm", "--pull=never", "-i", "--name", self.name,
             "--memory=128m", "--network", self.project + "_backend", "-v",
             str(ROOT / ".secrets/ca.crt") + ":/certs/ca.crt:ro",
             IMAGE, "python", "-u", "-c", WORKER],
            cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True,
        )
        def receive():
            for line in self.process.stdout:
                self.answers.put(line)
            self.answers.put(None)
        threading.Thread(target=receive, daemon=True).start()
        try:
            result = self.command("login", **login)
            if not result.get("ok"):
                raise VerificationError("Verification login failed; check the private credentials file")
        except BaseException:
            self.close()
            raise
        return self

    def command(self, action, **fields):
        fields.setdefault("request_id", "tpverify-" + uuid.uuid4().hex)
        try:
            self.process.stdin.write(json.dumps({"action":action, **fields}) + "\n")
            self.process.stdin.flush()
            answer = self.answers.get(timeout=20)
            if answer is None:
                raise VerificationError("Private probe exited; check Docker, networks and cached probe image")
            return json.loads(answer)
        except (BrokenPipeError, queue.Empty) as error:
            raise VerificationError("Private probe did not respond") from error

    def read(self, path, request_id=None):
        fields = {"path":path}
        if request_id:
            fields["request_id"] = request_id
        return self.command("read", **fields)

    def close(self):
        if not self.process:
            return
        try:
            if self.process.poll() is None:
                self.process.stdin.close()
                self.process.wait(timeout=12)
        finally:
            if self.process.poll() is None:
                self.process.kill()
            # Only this randomly named, volume-free verification worker is removed.
            subprocess.run(["docker", "rm", "-f", self.name], capture_output=True, timeout=20)

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            if self.process and self.process.poll() is None:
                result = self.command("logout")
                if not result.get("ok"):
                    print("NOTE: verification session logout failed; normal eight-hour expiry still applies.")
        finally:
            self.close()


def matching_records(text, request_id, expected_path):
    found = []
    for line in text.splitlines():
        start = line.find("{")
        if start < 0:
            continue
        try:
            record = json.loads(line[start:])
        except json.JSONDecodeError:
            continue
        if record.get("requestId") == request_id and (
            "path=" + expected_path + " " in record.get("message", "")
            and "status=200 " in record.get("message", "")
        ):
            found.append(record)
    return found


def service_logs(project, service, since):
    return "\n".join(
        docker("logs", "--since", since, container)
        for container in running_replicas(project, service)
    )


LOKI_WORKER = r'''
import json, ssl, sys, time, urllib.parse, urllib.request
p=json.load(sys.stdin)
query='{project="'+p['project']+'",service=~"identity|travel|payments"} |= "'+p['request_id']+'"'
params=urllib.parse.urlencode({'query':query,'start':p['start_ns'],'end':time.time_ns(),'limit':1000,'direction':'forward'})
ctx=ssl.create_default_context(cafile='/certs/ca.crt')
with urllib.request.urlopen('https://loki:3100/loki/api/v1/query_range?'+params,context=ctx,timeout=10) as r:
    data=json.load(r)
assert data['status']=='success'
print(json.dumps(data['data']['result']))
'''


def loki_records(project, request_id, start_ns):
    if not re.fullmatch(r"tpverify-[a-f0-9]{32}", request_id):
        raise VerificationError("Invalid verification request ID")
    result = docker(
        "run", "--rm", "--pull=never", "-i", "--memory=128m", "--network",
        project + "_monitoring", "-v", str(ROOT / ".secrets/ca.crt") + ":/certs/ca.crt:ro",
        IMAGE, "python", "-c", LOKI_WORKER,
        payload=json.dumps({"project":project,"request_id":request_id,"start_ns":start_ns}),
        timeout=25,
    )
    return json.loads(result)


def write_report(path, report):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
