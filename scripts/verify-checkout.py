"""Exercise real sandbox hosted-checkout creation and cancellation, without paying.
Provider credentials must already be in Vault. Gateways are explicitly enabled.
"""
from platform_client import admin, Client, ROOT
import datetime as dt
import json
import time
import uuid

def main():
    a=admin()
    for gateway in a.request('/payments'):
        if gateway['provider'] in ('STRIPE','PAYPAL'):
            a.request('/payments/'+gateway['id'],'PUT',{'name':gateway['name'],'provider':gateway['provider'],'currency':gateway['currency'],'enabled':True})
    accounts=json.loads((ROOT/'.secrets/demo-accounts.json').read_text())
    t=Client().login(accounts['traveler']['email'],accounts['traveler']['password'])
    start=dt.date.today()+dt.timedelta(days=45)
    trip=a.request('/manage/travels','POST',{'title':'Sandbox checkout verification '+uuid.uuid4().hex[:8],
        'startDate':str(start),'endDate':str(start+dt.timedelta(days=2)),'status':'PUBLISHED','price':12,'capacity':1,
        'description':'Operator sandbox verification. No real payment.','image':'greece',
        'stops':[{'destination':'Athens','country':'Greece','activities':'Walking','accommodation':'Hotel','transportation':'Rail'}],
        'participantIds':[],'version':0},201)['id']
    results={}
    for provider in ['STRIPE','PAYPAL']:
        b=t.request('/bookings','POST',{'travelId':trip,'provider':provider},201)
        assert b['status']=='PENDING', 'Checkout must not be confirmed before customer approval'
        if not b.get('checkout_url'):raise AssertionError(provider+' did not return a hosted checkout. Inspect sanitized payment service logs.')
        assert b['checkout_url'].startswith('https://checkout.stripe.com/') if provider=='STRIPE' else 'sandbox.paypal.com/' in b['checkout_url']
        again=t.request('/bookings','POST',{'travelId':trip,'provider':provider},201)
        assert again['id']==b['id'],'Retry created a duplicate booking'
        check=t.request('/bookings/'+b['id']+'/verify','POST',{})
        assert check['status']=='PENDING','Returning without a payment must not confirm a booking'
        t.request('/bookings/'+b['id']+'/cancel','POST',{})
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            row=next(r for r in t.request('/bookings') if r['id']==b['id'])
            if row['status']=='CANCELLED':break
            time.sleep(2)
        else:raise AssertionError(provider+' cancellation did not finish')
        results[provider]={'hosted_checkout_created':True,'idempotent_retry':True,'unpaid_not_confirmed':True,'cancelled':True,'payment_captured':False}
        print('PASS '+provider+' sandbox checkout, retry, unpaid verification, cancellation',flush=True)
    a.request('/manage/travels/'+trip,'PUT',{'title':'Sandbox checkout verification (archived)','startDate':str(start),'endDate':str(start+dt.timedelta(days=2)),'status':'ARCHIVED','price':12,'capacity':1,'description':'Sandbox API verification; no money was collected. Retained for audit.','image':'greece','stops':[{'destination':'Athens','country':'Greece','activities':'Walking','accommodation':'Hotel','transportation':'Rail'}],'participantIds':[],'version':0})
    out=ROOT/'work/verification/checkout.json';out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps({'passed':True,'providers':results,'completed_at':dt.datetime.now(dt.timezone.utc).isoformat()},indent=2))

if __name__=='__main__':main()
