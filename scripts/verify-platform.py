"""Real-service phase-two integration checks. Creates isolated, removable test fixtures.
Never captures a payment or contacts a provider checkout endpoint.
"""
from platform_client import Client, ROOT, admin
import datetime as dt
import json
import secrets
import subprocess
import time
import uuid

def sql(statement):
    result=subprocess.run(['docker','compose','exec','-T','postgres','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','travelplan','-At'],cwd=ROOT,input=statement,text=True,capture_output=True,timeout=30)
    if result.returncode: raise RuntimeError('Fixture SQL failed: '+result.stderr[-400:])
    return result.stdout.strip()

def run():
    checks=[]; people=[]; trips=[]; ids=[]
    a=admin(); marker=uuid.uuid4().hex[:10]; password=secrets.token_urlsafe(18)
    def check(name):checks.append(name);print('PASS '+name,flush=True)
    try:
        sessions={}
        for role in ['TRAVEL_MANAGER','TRAVELER']:
            email=role.lower()+'.'+marker+'@example.test'
            person=a.request('/users','POST',{'name':'Integration '+role,'email':email,'role':role,'status':'ACTIVE','password':password},201)['id']
            people.append(person);sessions[role]=Client().login(email,password)
        m=sessions['TRAVEL_MANAGER']; t=sessions['TRAVELER']
        Client().request('/explore',status=401)
        t.request('/manage/travels',status=403);m.request('/users',status=403)
        saved=t.csrf;t.csrf='invalid';t.request('/reports','POST',{'reason':'Test'},403);t.csrf=saved
        check('anonymous, role, and CSRF restrictions')
        start=dt.date.today()+dt.timedelta(days=30)
        payload={'title':'Integration '+marker,'startDate':str(start),'endDate':str(start+dt.timedelta(days=5)),'status':'PUBLISHED','price':12,'capacity':2,'description':'A test itinerary','image':'bali','stops':[{'destination':'Ubud','country':'Indonesia','activities':'Hiking; cooking','accommodation':'Lodge','transportation':'Rail'}],'participantIds':[],'version':0}
        trip=m.request('/manage/travels','POST',payload,201)['id'];trips.append(trip)
        assert m.request('/manage/travels') and t.request('/explore/'+trip)['manager_id']==m.user['id']
        other=a.request('/manage/travels','POST',{**payload,'title':'Other manager '+marker},201)['id'];trips.append(other)
        m.request('/manage/travels/'+other,'PUT',payload,403)
        check('manager ownership and itinerary creation')
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            try:
                results=t.request('/explore?q='+marker)
                suggestions=t.request('/explore/suggest?q=Integration')
                if any(r['id']==trip for r in results) and suggestions:break
            except AssertionError:pass
            time.sleep(3)
        else:raise AssertionError('Elasticsearch did not index the itinerary')
        check('Elasticsearch search and autocomplete')
        t.request('/feedback','POST',{'travelId':trip,'rating':5,'comment':'Not attended'},403)
        report=t.request('/reports','POST',{'targetUserId':m.user['id'],'travelId':trip,'reason':'Integration test report'},201)['id'];ids.append(report)
        t.request('/reports/'+report,'PUT',{'status':'REVIEWED','resolution':'Test'},403)
        a.request('/reports/'+report,'PUT',{'status':'REVIEWED','resolution':'Integration fixture reviewed'})
        assert t.request('/managers/'+m.user['id'])['report_count']==1
        check('feedback eligibility, report privacy and administrator moderation')
        # Explicit DB fixtures test participation rules without claiming provider settlement.
        historic=str(uuid.uuid4());trips.append(historic)
        booking=str(uuid.uuid4());ids.append(booking)
        yesterday=dt.date.today()-dt.timedelta(days=2)
        sql(f"INSERT INTO travel.travels(id,title,start_date,end_date,status,price,capacity,image,manager_id) VALUES ('{historic}','Integration history {marker}','{yesterday-dt.timedelta(days=4)}','{yesterday}','PUBLISHED',12,2,'bali','{m.user['id']}'); INSERT INTO travel.stops VALUES ('{historic}',0,'Ubud','Indonesia','Hiking; cooking','Lodge','Rail'); INSERT INTO payments.bookings(id,user_id,travel_id,provider,amount,currency,status,provider_id) VALUES ('{booking}','{t.user['id']}','{historic}','STRIPE',12,'USD','CONFIRMED','test-fixture-{marker}');")
        t.request('/feedback','POST',{'travelId':historic,'rating':5,'comment':'Integration fixture feedback'},201)
        t.request('/bookings/'+booking+'/cancel','POST',{},409)
        assert t.request('/profile')['past_trips']==1
        assert m.request('/manage/travels/'+historic+'/subscribers')[0]['user_id']==t.user['id']
        assert t.request('/explore/'+historic+'/community')[0]['id']==t.user['id']
        m.request('/explore/'+historic+'/community',status=403)
        check('past-trip feedback, personal statistics, subscriber profiles, private community and cutoff')
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            recommendation=t.request('/explore/recommendations')
            if recommendation['basis'].startswith('Based on') and any(r['id']==trip for r in recommendation['trips']):break
            time.sleep(3)
        else:raise AssertionError('Neo4j did not personalize from completed travel fields')
        assert all(r.get('end_date') and r.get('stops') for r in recommendation['trips'])
        check('Neo4j recommendations from destination, activity and transport plus rating')
        analytic=a.request('/manage/analytics')
        assert any(r['id']==historic and float(r['income'])==12 for r in analytic['trips'])
        ranked=next(r for r in analytic['managers'] if r['id']==m.user['id'])
        assert float(ranked['income_usd'])==12 and float(ranked['score'])==101.12
        check('admin rankings, histories and currency-separated income')
        a.request('/travels/'+historic,'PUT',{**payload,'startDate':str(start),'endDate':str(start+dt.timedelta(days=5))},409)
        check('legacy admin route cannot change dates beneath a paid booking')
        report={'passed':True,'checks':checks,'finished_at':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'Real local identity/travel/payments/PostgreSQL/Elasticsearch/Neo4j. Payment completion tested with marked DB fixtures, not provider money.'}
        out=ROOT/'work/verification/platform.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2))
    finally:
        # Only IDs created during this test run are removed, in FK order.
        for person in people:sql(f"DELETE FROM travel.reports WHERE reporter_id='{person}' OR target_user_id='{person}'; DELETE FROM payments.bookings WHERE user_id='{person}';")
        for trip in trips:sql(f"DELETE FROM payments.bookings WHERE travel_id='{trip}'; DELETE FROM travel.travels WHERE id='{trip}';")
        for person in people:sql(f"DELETE FROM identity.users WHERE id='{person}';")
    print(f'{len(checks)} integration groups passed. Fixtures removed.')

if __name__=='__main__':run()
