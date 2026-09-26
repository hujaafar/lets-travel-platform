"""Run a real, disposable Jenkins/Sonar review on a GitHub-hosted Linux runner.

No stored GitHub, course Git, payment, deployment or laptop credentials are used.
The isolated Jenkins agent receives a committed archive and a project analysis
token; it never receives the Docker socket. Evidence excludes generated secrets.
"""

import base64
from datetime import datetime, timezone
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'work/github-ci'
PROJECT = 'travel-plan-review'
JOB = 'travel-plan-github-review'
PRIVATE = set()


def mask(value):
    PRIVATE.add(value)
    # GitHub masks the following value in all subsequent runner output.
    print('::add-mask::' + value.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A'), flush=True)
    return value


def redacted(value):
    for secret in sorted(PRIVATE, key=len, reverse=True):
        value = value.replace(secret, '[REDACTED]')
    return value


def sonar_password():
    # Sonar requires all four character classes even for a long random secret.
    return 'Ci9!' + secrets.token_urlsafe(36)


def run(*args, capture=False, timeout=900):
    return subprocess.run(args, cwd=ROOT, check=True, timeout=timeout,
                          capture_output=capture, text=True)


class API:
    def __init__(self, base, password):
        self.base = base
        self.password = password
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(ROOT / '.secrets/ca.crt'))),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, path, data=None, content_type=None, crumb=False):
        headers = {'Authorization': 'Basic ' + base64.b64encode(('admin:' + self.password).encode()).decode()}
        if crumb and data is not None:
            token = self.json('/crumbIssuer/api/json')
            headers[token['crumbRequestField']] = token['crumb']
        if isinstance(data, dict):
            data = urllib.parse.urlencode(data).encode()
            content_type = 'application/x-www-form-urlencoded'
        if content_type:
            headers['Content-Type'] = content_type
        request = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            with self.opener.open(request, timeout=30) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            detail = redacted(error.read(2000).decode(errors='replace'))
            raise urllib.error.HTTPError(error.url, error.code, detail, {}, None) from None

    def json(self, path, data=None):
        return json.loads(self.call(path, data) or b'{}')


def wait_for(label, predicate, timeout=600):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if predicate():
                print(label + ' ready', flush=True)
                return
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(5)
    raise RuntimeError(label + ' did not become ready')


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted' or os.name != 'posix':
        raise SystemExit('This script requires a disposable GitHub-hosted Linux runner.')
    os.chdir(ROOT)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    config = json.loads((ROOT / '.secrets/bootstrap.json').read_text())
    for value in config.values():
        if isinstance(value, str):
            mask(value)
    jenkins = API('https://localhost:18443', config['JENKINS_ADMIN_PASSWORD'])
    sonar = API('https://localhost:19443', 'admin')
    compose = ('docker', 'compose', '-f', 'compose.yml', '-f', 'compose.tools.yml', '--profile', 'tools')
    run(*compose, 'up', '-d', 'jenkins', 'sonar-db', 'sonarqube', 'sonar-tls')
    wait_for('Jenkins', lambda: 'numExecutors' in jenkins.json('/api/json?tree=numExecutors'))
    wait_for('SonarQube', lambda: sonar.json('/api/system/status').get('status') == 'UP')
    password = mask(sonar_password())
    sonar.call('/api/users/change_password', {'login': 'admin', 'previousPassword': 'admin', 'password': password})
    # Do not retain a session established with the now-rotated default password.
    sonar = API('https://localhost:19443', password)
    sonar.call('/api/projects/create', {'project': PROJECT, 'name': 'Travel Plan PR candidate', 'visibility': 'private'})
    token = mask(sonar.json('/api/user_tokens/generate', {'name': 'candidate-analysis', 'type': 'PROJECT_ANALYSIS_TOKEN', 'projectKey': PROJECT})['token'])
    gate_name = 'Travel Plan candidate'
    source_gate = next(g['name'] for g in sonar.json('/api/qualitygates/list')['qualitygates'] if g['isDefault'])
    sonar.call('/api/qualitygates/copy', {'sourceName': source_gate, 'name': gate_name})
    current = sonar.json('/api/qualitygates/show?name=' + urllib.parse.quote(gate_name))
    metrics = {c['metric'] for c in current['conditions']}
    for metric, threshold in [('bugs', '0'), ('vulnerabilities', '0'), ('duplicated_lines_density', '3')]:
        if metric not in metrics:
            sonar.call('/api/qualitygates/create_condition', {'gateName': gate_name, 'metric': metric, 'op': 'GT', 'error': threshold})
    sonar.call('/api/qualitygates/select', {'gateName': gate_name, 'projectKey': PROJECT})
    script = '''
import jenkins.model.Jenkins
import hudson.model.*
import hudson.slaves.*
import groovy.json.JsonOutput
import com.cloudbees.plugins.credentials.*
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
import hudson.util.Secret
def j=Jenkins.get()
def n=new DumbSlave('travel-plan-review','Disposable GitHub review; no Docker socket','/home/jenkins/agent','1',Node.Mode.EXCLUSIVE,'travel-plan-review',new JNLPLauncher(),new RetentionStrategy.Always(),[])
j.addNode(n)
def provider=SystemCredentialsProvider.getInstance()
provider.credentials.add(new StringCredentialsImpl(CredentialsScope.GLOBAL,'travel-plan-review-sonar','Disposable project analysis only',Secret.fromString(TOKEN)))
provider.save()
println JsonOutput.toJson([secret:n.toComputer().getJnlpMac()])
'''.replace('TOKEN', json.dumps(token))
    response = jenkins.call('/scriptText', {'script': script}, crumb=True)
    try:
        agent_secret = mask(json.loads(response)['secret'])
    except (ValueError, KeyError):
        raise RuntimeError('Jenkins agent configuration failed; private response suppressed') from None
    private_dir = ROOT / '.secrets/ci'
    private_dir.mkdir(mode=0o700, exist_ok=True)
    environment = '\n'.join([
        'JENKINS_URL=https://jenkins:8443/', 'JENKINS_WEB_SOCKET=true',
        'JENKINS_AGENT_NAME=travel-plan-review', 'JENKINS_SECRET=' + agent_secret,
        'JENKINS_JAVA_OPTS=-Xmx192m -Djavax.net.ssl.trustStore=/certs/truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit',
        'MAVEN_OPTS=-Xmx384m -XX:ActiveProcessorCount=2 -Djavax.net.ssl.trustStore=/certs/truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit',
    ]) + '\n'
    env_file = private_dir / 'agent.env'
    env_file.write_text(environment)
    env_file.chmod(0o600)
    pipeline = (ROOT / 'infra/jenkins/Jenkinsfile.review').read_text()
    xml = '<flow-definition><description>GitHub PR candidate; isolated disposable runner.</description><keepDependencies>false</keepDependencies><properties/><definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition"><script>' + escape(pipeline) + '</script><sandbox>true</sandbox></definition><triggers/><disabled>false</disabled></flow-definition>'
    jenkins.call('/createItem?name=' + JOB, xml.encode(), 'application/xml', crumb=True)
    run('docker', 'run', '-d', '--name', 'travel-plan-github-agent', '--network', 'travel-plan_egress', '--memory=2g', '--cpus=2',
        '--env-file', str(env_file), '-v', 'travel-plan_github-agent-home:/home/jenkins',
        '-v', str(ROOT / '.secrets/certs/tools/truststore.p12') + ':/certs/truststore.p12:ro',
        '-v', str(ROOT / 'work/ci-review') + ':/review:ro', 'travel-plan-ci-agent:github')
    wait_for('Jenkins agent', lambda: not jenkins.json('/computer/travel-plan-review/api/json')['offline'])
    jenkins.call('/job/' + JOB + '/build', b'', crumb=True)
    wait_for('Jenkins build', lambda: bool(jenkins.json('/job/' + JOB + '/api/json?tree=lastBuild[number]')['lastBuild']), timeout=120)
    number = jenkins.json('/job/' + JOB + '/api/json?tree=lastBuild[number]')['lastBuild']['number']
    build_path = '/job/' + JOB + '/' + str(number)
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        status = jenkins.json(build_path + '/api/json?tree=number,result,building')
        if not status['building']:
            break
        print('Jenkins pipeline running...', flush=True)
        time.sleep(30)
    else:
        raise RuntimeError('Jenkins pipeline deadline exceeded')
    console = redacted(jenkins.call(build_path + '/consoleText').decode(errors='replace'))
    (EVIDENCE / 'jenkins-console.log').write_text(console)
    print(console[-6000:], flush=True)
    revision = (ROOT / 'work/ci-review/revision.txt').read_text().strip()
    report = {'revision': revision, 'observed_at': datetime.now(timezone.utc).isoformat(), 'jenkins': status,
              'run_url': os.environ['GITHUB_SERVER_URL'] + '/' + os.environ['GITHUB_REPOSITORY'] + '/actions/runs/' + os.environ['GITHUB_RUN_ID'],
              'scope': 'Real Jenkins pipeline and fresh candidate Sonar analysis; no native Sonar PR decoration or persistent baseline; no deployment/provider credentials.'}
    for label, path in [('gate', '/api/qualitygates/project_status?projectKey=' + PROJECT),
                        ('gate_definition', '/api/qualitygates/show?name=' + urllib.parse.quote(gate_name)),
                        ('metrics', '/api/measures/component?component=' + PROJECT + '&metricKeys=bugs,vulnerabilities,coverage,code_smells,security_hotspots,duplicated_lines_density,ncloc')]:
        try:
            report[label] = sonar.json(path)
        except urllib.error.HTTPError:
            report[label] = {'unavailable': True}
    try:
        report['junit'] = jenkins.json(build_path + '/testReport/api/json?tree=failCount,skipCount,passCount')
    except urllib.error.HTTPError:
        report['junit'] = {'unavailable': True}
    (EVIDENCE / 'review.json').write_text(redacted(json.dumps(report, indent=2)) + '\n')
    (EVIDENCE / 'source.sha256').write_bytes((ROOT / 'work/ci-review/source.sha256').read_bytes())
    if status['result'] != 'SUCCESS':
        raise RuntimeError('Jenkins pipeline failed; see sanitized evidence')
    if report['gate'].get('projectStatus', {}).get('status') != 'OK':
        raise RuntimeError('Sonar quality gate did not pass')
    for name in ('lcov.info', 'coverage-summary.json'):
        data = jenkins.call(build_path + '/artifact/dashboard/coverage/' + name).decode()
        (EVIDENCE / name).write_text(redacted(data))
    print('PASS Jenkins and SonarQube for ' + revision)


if __name__ == '__main__':
    main()
