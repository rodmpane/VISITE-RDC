from tests.admin_helper import admin_headers
"""Catalogue: authentication, draft isolation and verified publication."""
import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{"DATABASE_URL":f"sqlite:///{self.temp.name}/test.db",})
        self.env.start()
        self.client=TestClient(app)
        self.headers=admin_headers()
        self.partner={"categorie":"hotel","nom":"Hôtel de test","ville_id":"kinshasa","adresse":"Adresse de test","tarif":50,"devise":"USD"}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_admin_auth_draft_and_publication(self):
        self.assertEqual(self.client.get("/api/admin/catalogue").status_code,401)
        created=self.client.post("/api/admin/catalogue",json=self.partner,headers=self.headers)
        self.assertEqual(created.status_code,201,created.text)
        partner_id=created.json()["id"]
        self.assertEqual(self.client.get("/api/catalogue").json(),[])
        invalid={**self.partner,"publie":True}
        self.assertEqual(self.client.put(f"/api/admin/catalogue/{partner_id}",json=invalid,headers=self.headers).status_code,422)
        published={**self.partner,"publie":True,"source_verification":"Test uniquement","date_verification":"2026-11-01"}
        response=self.client.put(f"/api/admin/catalogue/{partner_id}",json=published,headers=self.headers)
        self.assertEqual(response.status_code,200,response.text)
        public=self.client.get("/api/catalogue?categorie=hotel&ville_id=kinshasa").json()
        self.assertEqual(len(public),1)
        self.assertNotIn("source_verification",public[0])
        self.assertEqual(self.client.delete(f"/api/admin/catalogue/{partner_id}",headers=self.headers).status_code,200)
        self.assertEqual(self.client.get("/api/catalogue").json(),[])

    def test_notifications_require_verified_published_partner(self):
        draft={**self.partner,"email":"partenaire@example.invalid","notification_active":True}
        self.assertEqual(self.client.post("/api/admin/catalogue",json=draft,headers=self.headers).status_code,422)
        enabled={**draft,"publie":True,"source_verification":"Accord partenaire de test","date_verification":"2026-11-01"}
        created=self.client.post("/api/admin/catalogue",json=enabled,headers=self.headers)
        self.assertEqual(created.status_code,201,created.text)
        self.assertTrue(created.json()["notification_active"])

    def test_photo_url_requires_https_and_no_fake_records(self):
        self.assertEqual(self.client.get("/api/catalogue").json(),[])
        bad={**self.partner,"photo_url":"javascript:alert(1)"}
        self.assertEqual(self.client.post("/api/admin/catalogue",json=bad,headers=self.headers).status_code,422)
        self.assertEqual(self.client.get("/api/catalogue").json(),[])
