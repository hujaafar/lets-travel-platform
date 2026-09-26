"""Opt-in, idempotent fictional fixtures; never stores a provider payment reference."""
import datetime as dt
import uuid

NAMESPACE = uuid.UUID('6be78c96-f92e-4c16-866d-d365ee006d33')
PEOPLE = ['Maya Bennett', 'Omar Rahman', 'Sofia Rossi', 'Leo Tanaka', 'Amira Hassan', 'Oliver Reed', 'Isabella Costa', 'Ethan Park', 'Lina Haddad', 'Daniel Brooks']
# title, image, country, two destinations, activities, accommodation, transport, price
CATALOG = [
 ('Bali, beyond the beach','bali','Indonesia','Ubud','Sanur','Temple visits; rice terrace walk; Beach picnic','Garden guesthouse and beach cottages','Private minibus',1480),
 ('The quiet side of the Cyclades','greece','Greece','Paros','Naxos','Coastal walks; pottery workshop; Beach swimming','Family-run island guesthouses','Ferry and local transfers',1720),
 ('Kyoto after the crowds','japan','Japan','Kyoto','Uji','Culture; temple gardens; tea tasting','Traditional ryokan','Regional train',2240),
 ('Morocco, from medina to mountains','morocco','Morocco','Marrakech','Imlil','Medina food walk; Hiking; Berber cooking','Courtyard riad and mountain lodge','Private minibus',1390),
 ('Iceland under open skies','iceland','Iceland','Vik','Selfoss','Hiking; waterfalls; geothermal bathing','Countryside cabins','Small-group minibus',2690),
 ('A week among the Dolomites','dolomites','Italy','Ortisei','Cortina','Hiking; alpine lakes; mountain photography','Alpine chalet and guesthouse','Rail connection and minibus',1980),
 ('Slow mornings in Ubud','ubud','Indonesia','Ubud','Sidemen','Rice field walks; craft workshop; village cooking','Small garden villas','Private minibus',1120),
 ('Uluwatu, tides and temples','uluwatu','Indonesia','Uluwatu','Jimbaran','Beach; sunset temple visit; seafood market','Clifftop guesthouse','Airport transfer and minibus',1280),
 ('Greek islands, golden evenings','greece','Greece','Milos','Sifnos','Beach; village walks; family cooking class','Seaside guesthouses','Inter-island ferry',1860),
 ('Japan by the local line','japan','Japan','Kyoto','Nara','Culture; city walks; heritage gardens','Boutique hotel and ryokan','Regional rail pass',2380),
 ('Atlas foothills and old stories','morocco','Morocco','Imlil','Marrakech','Hiking; local market; traditional weaving','Mountain lodge and riad','Private minibus',1560),
 ('The south coast of Iceland','iceland','Iceland','Hella','Vik','Hiking; black-sand beaches; waterfalls','Countryside lodge','Small-group minibus',2580),
 ('Dolomite trails for autumn','dolomites','Italy','Bolzano','Ortisei','Hiking; alpine food; cable-car views','Family-run alpine hotel','Train and minibus',2100),
 ('Bali, a little longer','ubud','Indonesia','Sidemen','Ubud','Temple walks; cooking; coffee farm','Garden guesthouse','Private minibus',1640),
 ('Postcards from Paros','greece','Greece','Parikia','Naoussa','Beach; island walks; local food','Island guesthouse','Ferry and local bus',1450),
 ('A spring in Kyoto','japan','Japan','Kyoto','Uji','Culture; temple gardens; tea ceremony','Traditional ryokan','Regional train',2160),
 ('Our week in the Atlas','morocco','Morocco','Marrakech','Imlil','Medina walk; Hiking; village cooking','Courtyard riad and lodge','Private minibus',1320),
 ('Days in the Italian mountains','dolomites','Italy','Ortisei','Cortina','Hiking; alpine lakes; local food','Mountain guesthouse','Train and minibus',1820),
]


def ident(kind, value):
    return str(uuid.uuid5(NAMESPACE, f'{kind}:{value}'))


def literal(value):
    if value is None: return 'NULL'
    if isinstance(value, bool): return 'true' if value else 'false'
    if isinstance(value, (int, float)): return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert(table, columns, values):
    return f"INSERT INTO {table}({','.join(columns.split())}) VALUES ({','.join(map(literal,values))}) ON CONFLICT DO NOTHING;"


def build_sql(accounts, people, today=None):
    today = today or dt.date.today()
    managers = [accounts['manager']['id'], people[8]['id'], people[9]['id']]
    travelers = [accounts['traveler']['id']] + [p['id'] for p in people[:8]]
    sql = ['BEGIN;']
    comments = ['The small group made it easy to settle in. Plenty of time to explore.', 'A lovely balance of planned activities and free afternoons.', 'The local guide and family-run stays were the highlight.', 'Clear meeting points, thoughtful stops and a relaxed pace.']
    for i, (title,image,country,first,second,activities,stay,transport,price) in enumerate(CATALOG):
        past, draft = i >= 14, 12 <= i < 14
        start = today + dt.timedelta(days=(-160+(i-14)*35) if past else 22+i*7)
        end = start + dt.timedelta(days=5+i%4)
        trip = ident('trip', i)
        sql.append(insert('travel.travels','id title image start_date end_date status price capacity description manager_id currency is_demo', [trip,title,image,start,end,'ARCHIVED' if past else 'DRAFT' if draft else 'PUBLISHED',price,12+i%3*2,f'A small-group journey through {first} and {second}. Local hosts, comfortable stays and unhurried afternoons, with every transfer taken care of.',managers[i%3],'USD',True]))
        for position, destination in enumerate([first,second]):
            sql.append(insert('travel.stops','travel_id position destination country activities accommodation transportation',[trip,position,destination,country,activities,stay,transport]))
        if draft: continue
        for j in range(4):
            person = travelers[(i+j)%len(travelers)] if not past else travelers[j]
            status = 'CONFIRMED' if past or j < 2 else ['PENDING','CANCELLED','REFUNDED','CANCEL_REQUESTED'][(i+j)%4]
            created = start-dt.timedelta(days=21+j*7) if past else today-dt.timedelta(days=2+i*2+j*6)
            booking = ident('booking',f'{i}-{j}')
            sql.append(insert('payments.bookings','id user_id travel_id provider amount currency status created_at updated_at expires_at is_demo',[booking,person,trip,'STRIPE' if (i+j)%2==0 else 'PAYPAL',price,'USD',status,created,created,created+dt.timedelta(days=1),True]))
            if status == 'CONFIRMED':
                sql.append(insert('travel.participants','travel_id user_id',[trip,person]))
            if past:
                sql.append(insert('travel.feedback','id travel_id user_id rating comment created_at is_demo',[ident('feedback',f'{i}-{j}'),trip,person,4+(i+j)%2,comments[j],end+dt.timedelta(days=2+j),True]))
    for i,status in enumerate(['OPEN','REVIEWED','DISMISSED']):
        sql.append(insert('travel.reports','id reporter_id target_user_id travel_id reason status resolution created_at',[ident('report',i),accounts['traveler']['id'],people[i]['id'],ident('trip',14+i),'Demo scenario: a traveler asked the host to clarify a meeting-point change.',status,None if status=='OPEN' else 'Demo scenario: the host clarified the itinerary and contacted the group.',today-dt.timedelta(days=3+i*12)]))
    sql.append('COMMIT;')
    return '\n'.join(sql)


def seed_rich(api, accounts, root):
    import json, secrets, subprocess
    file = root/'.secrets/demo-people.json'
    people = json.loads(file.read_text()) if file.exists() else [dict(name=name,email=f'demo-fixture-{i+1}@letstravel.example',role='TRAVELER' if i<8 else 'TRAVEL_MANAGER',password=secrets.token_urlsafe(20)) for i,name in enumerate(PEOPLE)]
    users = api.request('/users')
    for person in people:
        existing = next((u for u in users if u['email']==person['email']),None)
        person['id'] = existing['id'] if existing else api.request('/users','POST',{**person,'status':'ACTIVE'},201)['id']
        file.write_text(json.dumps(people,indent=2))
    subprocess.run(['docker','compose','-p','lets-travel','exec','-T','postgres','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','travelplan'],input=build_sql(accounts,people),text=True,cwd=root,check=True,capture_output=True)
    print('Rich demo ready: 18 itineraries, 64 demo bookings, 16 labeled demo reviews, 3 report examples, 10 fictional people. Existing records preserved; no provider calls made.')
