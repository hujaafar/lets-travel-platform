"""Provision a scoped Elasticsearch indexer; the travel service never receives root access."""
from pathlib import Path
import json
import secrets
import subprocess

ROOT=Path(__file__).resolve().parents[1]

def configure():
    private=ROOT/'.secrets/bootstrap.json'
    config=json.loads(private.read_text())
    config.setdefault('ELASTIC_TRAVEL_PASSWORD',secrets.token_hex(24))
    private.write_text(json.dumps(config,indent=2))
    token=json.loads((ROOT/'.secrets/vault-init.json').read_text())['root_token']
    worker="""
import sys,json,ssl,urllib.request,base64
p=json.load(sys.stdin);ctx=ssl.create_default_context(cafile='/certs/ca.crt')
auth=base64.b64encode(('elastic:'+p['root']).encode()).decode()
headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'}
def send(path,data):
 r=urllib.request.Request('https://elasticsearch:9200'+path,headers=headers,data=json.dumps(data).encode(),method='PUT')
 urllib.request.urlopen(r,context=ctx,timeout=20).close()
send('/_security/role/journey_indexer',{'cluster':[],'indices':[{'names':['journeys'],'privileges':['read','write','create_index','view_index_metadata']}]})
send('/_security/user/travel-indexer',{'password':p['password'],'roles':['journey_indexer']})
url='https://vault:8200/v1/secret/data/travel';h={'X-Vault-Token':p['token'],'Content-Type':'application/json'}
old=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=h),context=ctx))['data']['data']
old.update({'ELASTIC_USERNAME':'travel-indexer','ELASTIC_PASSWORD':p['password']})
urllib.request.urlopen(urllib.request.Request(url,headers=h,data=json.dumps({'data':old}).encode()),context=ctx).close()
print('Scoped search credentials provisioned through Vault.')
"""
    result=subprocess.run(['docker','run','--rm','-i','--network','lets-travel_backend','-v',str(ROOT/'.secrets/ca.crt')+':/certs/ca.crt:ro','python:3.13-alpine','python','-c',worker],input=json.dumps({'root':config['ELASTIC_PASSWORD'],'password':config['ELASTIC_TRAVEL_PASSWORD'],'token':token}),text=True,capture_output=True,timeout=60)
    if result.returncode:raise RuntimeError('Scoped search provisioning failed; credentials were not logged')
    print(result.stdout.strip())

if __name__=='__main__':configure()
