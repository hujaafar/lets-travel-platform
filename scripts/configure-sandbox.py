"""Import an operator-owned JSON file into the payments Vault secret. Never logs keys."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.file.read_text())
    fields = ['STRIPE_SECRET_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']
    values = {key: source[key] for key in fields}
    if not values['STRIPE_SECRET_KEY'].startswith('sk_test_'):
        raise SystemExit('Only Stripe sandbox credentials are accepted')
    if any(not isinstance(v, str) or not v.strip() or '\n' in v for v in values.values()):
        raise SystemExit('The sandbox configuration is incomplete or malformed')
    token = json.loads((ROOT / '.secrets/vault-init.json').read_text())['root_token']
    worker = """
import sys,json,ssl,urllib.request
p=json.load(sys.stdin)
ctx=ssl.create_default_context(cafile='/certs/ca.crt')
headers={'X-Vault-Token':p['token'],'Content-Type':'application/json'}
url='https://vault:8200/v1/secret/data/payments'
old=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=headers),context=ctx))['data']['data']
old.update(p['values'])
urllib.request.urlopen(urllib.request.Request(url,data=json.dumps({'data':old}).encode(),headers=headers),context=ctx).close()
print('Sandbox credentials saved in payments Vault scope.')
"""
    result = subprocess.run(['docker','run','--rm','-i','--network','lets-travel_backend','-v',str(ROOT/'.secrets/ca.crt')+':/certs/ca.crt:ro','python:3.13-alpine','python','-c',worker],
        input=json.dumps({'token':token,'values':values}), text=True, capture_output=True, timeout=60)
    if result.returncode: raise SystemExit('Vault import failed; secret values were not logged.')
    print(result.stdout.strip())
    subprocess.run(['docker','compose','restart','payments-agent'],cwd=ROOT,check=True,timeout=60)
    print('Restart payments after the Vault agent has rendered its new configuration.')

if __name__ == '__main__': main()
