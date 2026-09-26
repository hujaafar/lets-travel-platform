"""Verify labeled fixtures, repeatable seeding and payment isolation against live services."""
from platform_client import ROOT, Client, admin
import json
import subprocess
from demo_dataset import build_sql

def sql(statement):
    r = subprocess.run(['docker','compose','-p','lets-travel','exec','-T','postgres','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','travelplan','-At'],input=statement,text=True,cwd=ROOT,capture_output=True,check=True)
    return r.stdout.strip()

def main():
    accounts=json.loads((ROOT/'.secrets/demo-accounts.json').read_text())
    people=json.loads((ROOT/'.secrets/demo-people.json').read_text())
    counts="SELECT (SELECT count(*) FROM travel.travels WHERE is_demo), (SELECT count(*) FROM payments.bookings WHERE is_demo), (SELECT count(*) FROM travel.feedback WHERE is_demo);"
    before=sql(counts)
    sql(build_sql(accounts,people))
    assert sql(counts)==before=='18|64|16',before
    assert sql('SELECT count(*) FROM payments.bookings WHERE is_demo AND (provider_id IS NOT NULL OR capture_id IS NOT NULL OR checkout_url IS NOT NULL OR refund_id IS NOT NULL);')=='0'
    a=admin()
    ledger=a.request('/payments/transactions')
    assert sum(r['is_demo'] for r in ledger)==64
    t=Client().login(accounts['traveler']['email'],accounts['traveler']['password'])
    t.request('/payments/transactions',status=403)
    Client().request('/payments/transactions',status=401)
    examples=[b for b in t.request('/bookings') if b['is_demo']]
    assert len(examples)>=6
    for booking in examples[:2]:
        original=sql(f"SELECT row_to_json(b) FROM payments.bookings b WHERE id='{booking['id']}';")
        t.request('/bookings/'+booking['id']+'/verify','POST',{})
        t.request('/bookings/'+booking['id']+'/cancel','POST',{},409)
        assert sql(f"SELECT row_to_json(b) FROM payments.bookings b WHERE id='{booking['id']}';")==original
    print('PASS: 18 demo itineraries, 64 demo bookings, 16 labeled reviews; repeat seeding preserves records; admin-only ledger; demo verification/cancellation cannot change payment state.')

if __name__=='__main__':main()
