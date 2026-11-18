from tests.admin_helper import admin_headers
"""Account management authorization and suspension regression tests."""
import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.schema import init_schema

class AdminAccountTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{"DATABASE_URL":f"sqlite:///{self.temp.name}/test.db",})
        self.env.start()
        init_schema()
        self.client=TestClient(app)
        self.auth=admin_headers()

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_list_suspend_reactivate_and_revoke(self):
        registered=self.client.post("/api/compte/inscription",json={"nom":"Voyageur Test","email":"test@example.com","password":"Password12345"})
        self.assertEqual(registered.status_code,201,registered.text)
        user=registered.json()["user"]["id"]
        self.assertEqual(self.client.get("/api/admin/comptes").status_code,401)
        listing=self.client.get("/api/admin/comptes",headers=self.auth)
        self.assertEqual(listing.status_code,200,listing.text)
        self.assertEqual(listing.json()["total"],2)
        self.assertNotIn("password_hash",str(listing.json()))
        details=self.client.get("/api/admin/comptes/"+user,headers=self.auth)
        self.assertEqual(details.status_code,200,details.text)
        self.assertNotIn("password_hash",str(details.json()))
        self.assertEqual(self.client.patch("/api/admin/comptes/"+user,json={"bloque":True},headers=self.auth).status_code,200)
        self.assertEqual(self.client.post("/api/compte/connexion",json={"email":"test@example.com","password":"Password12345"}).status_code,403)
        self.assertEqual(self.client.get("/api/compte/moi",headers={"Authorization":"Bearer "+registered.json()["token"]}).status_code,401)
        self.assertEqual(self.client.patch("/api/admin/comptes/"+user,json={"bloque":False},headers=self.auth).status_code,200)
        self.assertEqual(self.client.post("/api/compte/connexion",json={"email":"test@example.com","password":"Password12345"}).status_code,200)
        self.assertEqual(self.client.post("/api/admin/comptes/"+user+"/deconnecter",headers=self.auth).status_code,200)
