"""Create fictional demo accounts and journeys. Never fabricates provider payments."""
from platform_client import ROOT, admin
import datetime as dt
import json
import secrets
import subprocess

def main():
    api=admin()
    file=ROOT/'.secrets/demo-accounts.json'
    accounts=json.loads(file.read_text()) if file.exists() else {
        'manager': {'name':'Noor Al Khalifa','email':'manager@letstravel.local','role':'TRAVEL_MANAGER','password':secrets.token_urlsafe(16)},
        'traveler': {'name':'Alex Morgan','email':'traveler@letstravel.local','role':'TRAVELER','password':secrets.token_urlsafe(16)}
    }
    users=api.request('/users')
    for person in accounts.values():
        existing=next((u for u in users if u['email']==person['email']),None)
        person['id']=existing['id'] if existing else api.request('/users','POST',{**person,'status':'ACTIVE'},201)['id']
    file.write_text(json.dumps(accounts,indent=2))
    (ROOT/'.secrets/demo-login.txt').write_text('Fictional demo accounts · https://localhost:8444\n\n'+'\n\n'.join(f"{k.title()}\nEmail: {v['email']}\nPassword: {v['password']}" for k,v in accounts.items()))
    # Only known foundation demo IDs are updated. Operator-created trips are untouched.
    manager=accounts['manager']['id']
    sql=f"UPDATE travel.travels SET manager_id='{manager}' WHERE id::text LIKE '10000000-0000-0000-0000-%' AND manager_id IS NULL;"
    subprocess.run(['docker','compose','exec','-T','postgres','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','travelplan'],input=sql,text=True,cwd=ROOT,check=True,capture_output=True)
    current=api.request('/travels')
    collections=[('The slow way through Greece','greece','Naxos','Greece','Beach; island walks','Family-run guesthouse','Ferry',1250),('Between fire and ice','iceland','Reykjavik','Iceland','Hiking; hot springs','Countryside lodge','Minibus transfer',2460)]
    from platform_client import Client
    m=Client().login(accounts['manager']['email'],accounts['manager']['password'])
    for i,(title,image,dest,country,activity,stay,transport,price) in enumerate(collections):
        if any(t['title']==title for t in current): continue
        start=dt.date.today()+dt.timedelta(days=35+i*14)
        m.request('/manage/travels','POST',{'title':title,'image':image,'startDate':str(start),'endDate':str(start+dt.timedelta(days=6)),
            'status':'PUBLISHED','price':price,'capacity':12,'description':'A thoughtfully paced small-group journey, with time for local stories and unexpected discoveries.',
            'stops':[{'destination':dest,'country':country,'activities':activity,'accommodation':stay,'transportation':transport}],'participantIds':[],'version':0},201)
    print('Demo accounts and journeys ready. Private login details: .secrets/demo-login.txt')
    print('No payments or traveler reviews were fabricated.')

if __name__=='__main__':main()
