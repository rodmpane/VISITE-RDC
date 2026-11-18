"""Administrative itinerary lifecycle and carrier validation."""
import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.schema import init_schema
from scripts.import_csv import import_rows
from tests.test_api import fixture

class RouteAdminTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{"DATABASE_URL":f"sqlite:///{self.temp.name}/test.db","ADMIN_API_TOKEN":"test-token"})
        self.env.start()
        init_schema()
        import_rows(fixture())
        self.client=TestClient(app)
        self.auth={"Authorization":"Bearer test-token"}
        self.route={"mode":"bus","depart_id":"a","arrivee_id":"b","statut":"a_verifier","publie":False}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_create_edit_publish_remove(self):
        self.assertEqual(self.client.post("/api/admin/liaisons",json=self.route).status_code,401)
        created=self.client.post("/api/admin/liaisons",json=self.route,headers=self.auth)
        self.assertEqual(created.status_code,201,created.text)
        route_id=created.json()["id"]
        bad={**self.route,"publie":True}
        self.assertEqual(self.client.put(f"/api/admin/liaisons/{route_id}",json=bad,headers=self.auth).status_code,422)
        published={**self.route,"statut":"ok","publie":True,"verifie_le":"2026-11-01","source_info":"Test source"}
        result=self.client.put(f"/api/admin/liaisons/{route_id}",json=published,headers=self.auth)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()["publie"],1)
        self.assertEqual(self.client.delete(f"/api/admin/liaisons/{route_id}",headers=self.auth).status_code,200)

    def test_reject_unregistered_carrier_and_invalid_places(self):
        self.assertEqual(self.client.post("/api/admin/liaisons",json={**self.route,"operateur":"Fausse compagnie"},headers=self.auth).status_code,422)
        self.assertEqual(self.client.post("/api/admin/liaisons",json={**self.route,"arrivee_id":"unknown"},headers=self.auth).status_code,422)
