"""TLS-verifying local API client for setup and integration tests."""
import http.cookiejar
import json
import ssl
import urllib.request
import urllib.error
import subprocess
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://localhost:8444'
WORKER = """
import sys,json,ssl,urllib.request,urllib.error
p=json.load(sys.stdin)
ctx=ssl.create_default_context(cafile='/certs/ca.crt')
r=urllib.request.Request('https://dashboard:8444/api'+p['path'],headers={**p['headers'],'Host':'localhost:8444'},method=p['method'],data=None if p['body'] is None else json.dumps(p['body']).encode())
try: response=urllib.request.urlopen(r,context=ctx,timeout=35)
except urllib.error.HTTPError as e: response=e
print(json.dumps({'status':response.status,'data':response.read().decode(),'cookie':response.headers.get('Set-Cookie','')}))
"""

class Client:
    def __init__(self):
        self.csrf = ''
        self.user = None
        self.cookie = ''
        context = ssl.create_default_context()
        context.load_verify_locations(cafile=str(ROOT/'.secrets/ca.crt'))
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=context),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(self, path, method='GET', body=None, status=200):
        headers = {'Content-Type':'application/json','Origin':BASE,'X-CSRF-Token':self.csrf}
        if os.name == 'nt' or os.environ.get('PLATFORM_TRANSPORT') == 'docker':
            # Windows HTTPS inspection can replace local certificates. Verify
            # the actual development CA inside the private Docker network.
            result=subprocess.run(['docker','run','--rm','-i','--memory=96m','--network','lets-travel_backend','-v',str(ROOT/'.secrets/ca.crt')+':/certs/ca.crt:ro','python:3.13-alpine','python','-c',WORKER],
                input=json.dumps({'path':path,'method':method,'body':body,'headers':{**headers,'Cookie':self.cookie}}),text=True,capture_output=True,timeout=60)
            if result.returncode: raise RuntimeError('TLS-verifying API transport failed: '+result.stderr[-350:])
            response=json.loads(result.stdout)
            if response['cookie']: self.cookie=response['cookie'].split(';')[0]
            if response['status']!=status: raise AssertionError(f"{method} {path}: expected {status}, got {response['status']}: {response['data'][:350]}")
            return json.loads(response['data']) if response['data'] else None
        request=urllib.request.Request(BASE+'/api'+path,headers=headers,method=method,
            data=None if body is None else json.dumps(body).encode())
        try:
            response=self.opener.open(request,timeout=40)
        except urllib.error.HTTPError as error:
            response=error
        data=response.read().decode()
        if response.status != status:
            raise AssertionError(f'{method} {path}: expected {status}, got {response.status}: {data[:350]}')
        return json.loads(data) if data else None
    def login(self,email,password):
        self.user=self.request('/auth/login','POST',{'email':email,'password':password})
        self.csrf=self.user['csrf']
        return self

def admin():
    password=json.loads((ROOT/'.secrets/bootstrap.json').read_text())['ADMIN_PASSWORD']
    return Client().login('admin@travelplan.local',password)
