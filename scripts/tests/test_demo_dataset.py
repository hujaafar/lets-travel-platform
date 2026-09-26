import datetime as dt
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('demo_dataset',Path(__file__).resolve().parents[1]/'demo_dataset.py')
demo=importlib.util.module_from_spec(spec);spec.loader.exec_module(demo)
class DemoDatasetTests(unittest.TestCase):
 def test_repeat_builds_have_stable_keys_and_no_provider_references(self):
  accounts={'manager':{'id':demo.ident('user','manager')},'traveler':{'id':demo.ident('user','traveler')}}
  people=[{'id':demo.ident('user',i)} for i in range(10)]
  source=demo.build_sql(accounts,people,dt.date(2026,9,26))
  self.assertEqual(source,demo.build_sql(accounts,people,dt.date(2026,9,26)))
  self.assertEqual(source.count('INSERT INTO travel.travels('),18)
  self.assertEqual(source.count('INSERT INTO payments.bookings('),64)
  self.assertEqual(source.count('INSERT INTO travel.feedback('),16)
  for token in ('provider_id','capture_id','refund_id','checkout_url','UPDATE ','DELETE '):self.assertNotIn(token,source)
  self.assertTrue(source.startswith('BEGIN;') and source.endswith('COMMIT;'))
 def test_sql_literals_escape_apostrophes(self):
  self.assertEqual(demo.literal("Host's house"),"'Host''s house'")
  self.assertEqual(demo.literal(None),'NULL')
