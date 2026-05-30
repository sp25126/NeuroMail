import unittest
import os
import sys
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure API path is in import search path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import Base, get_db
from models import Tenant, User, Mailbox, RawEmail, Entity, Identifier, Event, AuditLog
from services import vault

from sqlalchemy.pool import StaticPool

# Use an isolated SQLite memory database for testing Phase 2 services
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

class TestPhase2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        # Create common test tenants
        db = TestingSessionLocal()
        cls.tenant1 = Tenant(id="tenant-1", name="Tenant One")
        cls.tenant2 = Tenant(id="tenant-2", name="Tenant Two")
        cls.user1 = User(id="user-1", email="user1@tenant1.com", name="User One", tenant_id="tenant-1")
        cls.user2 = User(id="user-2", email="user2@tenant2.com", name="User Two", tenant_id="tenant-2")
        db.add(cls.tenant1)
        db.add(cls.tenant2)
        db.add(cls.user1)
        db.add(cls.user2)
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.client = TestClient(app)
        self.headers_t1 = {"X-Tenant-ID": "tenant-1"}
        self.headers_t2 = {"X-Tenant-ID": "tenant-2"}

    # ----------------- Phase 2.2 Mailbox Registry -----------------
    def test_mailbox_registry_and_status(self):
        # 1. Create a mailbox with a secret token
        raw_token = "secret_access_token_123"
        payload = {
            "provider_type": "GMAIL",
            "scope_state": "https://www.googleapis.com/auth/gmail.readonly",
            "raw_token": raw_token
        }
        res = self.client.post("/mailboxes", json=payload, headers=self.headers_t1)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        mailbox_id = data["id"]
        
        self.assertEqual(data["provider_type"], "GMAIL")
        self.assertEqual(data["connection_status"], "CONNECTED")
        # Ensure raw token does not leak in response!
        self.assertNotIn("raw_token", data)
        self.assertNotIn("secret_access_token_123", str(data))
        self.assertIsNotNone(data["token_ref"])

        # Verify token is encrypted and stored in vault
        self.assertEqual(vault.retrieve_token(data["token_ref"]), raw_token)

        # 2. Update mailbox sync status
        update_payload = {
            "connection_status": "ERROR",
            "error_state": "Token expired"
        }
        res_update = self.client.patch(f"/mailboxes/{mailbox_id}/status", json=update_payload, headers=self.headers_t1)
        self.assertEqual(res_update.status_code, 200)
        data_update = res_update.json()
        self.assertEqual(data_update["connection_status"], "ERROR")
        self.assertEqual(data_update["error_state"], "Token expired")

        # 3. Verify cross-tenant access to mailbox is blocked (Phase 2.10)
        res_cross = self.client.patch(f"/mailboxes/{mailbox_id}/status", json=update_payload, headers=self.headers_t2)
        self.assertEqual(res_cross.status_code, 404)  # Blocked / Not Found in tenant-2

    # ----------------- Phase 2.3 Raw Email Ingestion -----------------
    def test_raw_email_storage_and_idempotency(self):
        # Setup mailbox
        mbox_payload = {"provider_type": "OUTLOOK"}
        res_mbox = self.client.post("/mailboxes", json=mbox_payload, headers=self.headers_t1)
        mailbox_id = res_mbox.json()["id"]

        # 1. Insert a new raw email
        email_payload = {
            "mailbox_id": mailbox_id,
            "provider_message_id": "msg-999",
            "thread_id": "thread-abc",
            "sender": "sender@gmail.com",
            "subject": "Neuromail test",
            "body": "Ingestion service details",
            "received_at": datetime.datetime.utcnow().isoformat(),
            "normalized_metadata": {"parser_version": "v2"}
        }
        res_email = self.client.post("/emails", json=email_payload, headers=self.headers_t1)
        self.assertEqual(res_email.status_code, 201)
        data = res_email.json()
        self.assertEqual(data["provider_message_id"], "msg-999")
        email_id = data["id"]

        # 2. Re-insert the same raw email (Idempotency check)
        res_dup = self.client.post("/emails", json=email_payload, headers=self.headers_t1)
        self.assertEqual(res_dup.status_code, 201)
        self.assertEqual(res_dup.json()["id"], email_id)  # Returned existing record ID

        # 3. Query by thread ID
        res_query = self.client.get(f"/emails/thread/thread-abc?mailbox_id={mailbox_id}", headers=self.headers_t1)
        self.assertEqual(res_query.status_code, 200)
        self.assertEqual(len(res_query.json()), 1)

        # 4. Verify tenant isolation (Phase 2.10)
        res_cross = self.client.get(f"/emails/thread/thread-abc?mailbox_id={mailbox_id}", headers=self.headers_t2)
        self.assertEqual(len(res_cross.json()), 0)  # Empty because thread belongs to tenant-1

    # ----------------- Phase 2.4 Entity Scaffold -----------------
    def test_entity_service(self):
        # 1. Create an entity
        entity_payload = {
            "status": "ACTIVE",
            "identity": "Shipment #ABC-123",
            "source_reference": "raw_emails/msg-999",
            "metadata_json": {"origin": "LAX"}
        }
        res_entity = self.client.post("/entities", json=entity_payload, headers=self.headers_t1)
        self.assertEqual(res_entity.status_code, 201)
        data = res_entity.json()
        entity_id = data["id"]
        self.assertEqual(data["identity"], "Shipment #ABC-123")

        # 2. Update entity status
        update_payload = {"status": "COMPLETED"}
        res_update = self.client.patch(f"/entities/{entity_id}", json=update_payload, headers=self.headers_t1)
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["status"], "COMPLETED")

        # 3. Verify tenant boundary
        res_cross = self.client.get(f"/entities/{entity_id}", headers=self.headers_t2)
        self.assertEqual(res_cross.status_code, 404)

    # ----------------- Phase 2.5 Identifier Mapping -----------------
    def test_identifier_mapping(self):
        # Setup entity
        res_entity = self.client.post("/entities", json={"status": "ACTIVE", "identity": "Shipment #BOL-99"}, headers=self.headers_t1)
        entity_id = res_entity.json()["id"]

        # 1. Add multiple identifiers to one entity
        id_payload_1 = {
            "identifier_type": "BOL",
            "identifier_value": "BOL-9999",
            "source": "EMAIL_PARSER"
        }
        res_id1 = self.client.post(f"/entities/{entity_id}/identifiers", json=id_payload_1, headers=self.headers_t1)
        self.assertEqual(res_id1.status_code, 201)

        id_payload_2 = {
            "identifier_type": "CONTAINER_ID",
            "identifier_value": "CONT-7777",
            "source": "EMAIL_PARSER"
        }
        res_id2 = self.client.post(f"/entities/{entity_id}/identifiers", json=id_payload_2, headers=self.headers_t1)
        self.assertEqual(res_id2.status_code, 201)

        # 2. Resolve entity from each identifier
        res_res1 = self.client.get("/identifiers/resolve?identifier_type=BOL&identifier_value=BOL-9999", headers=self.headers_t1)
        self.assertEqual(res_res1.status_code, 200)
        self.assertEqual(res_res1.json()["id"], entity_id)

        res_res2 = self.client.get("/identifiers/resolve?identifier_type=CONTAINER_ID&identifier_value=CONT-7777", headers=self.headers_t1)
        self.assertEqual(res_res2.status_code, 200)
        self.assertEqual(res_res2.json()["id"], entity_id)

        # 3. Verify collision check across tenants (Phase 2.10)
        # Re-adding the same BOL reference under tenant-2 works because unique constraint is scoped by (tenant_id, type, value)
        res_t2 = self.client.post("/entities", json={"status": "ACTIVE", "identity": "Tenant 2 BOL"}, headers=self.headers_t2)
        entity_t2_id = res_t2.json()["id"]
        res_id_t2 = self.client.post(f"/entities/{entity_t2_id}/identifiers", json=id_payload_1, headers=self.headers_t2)
        self.assertEqual(res_id_t2.status_code, 201)

        # Collision in SAME tenant should fail
        res_collision = self.client.post(f"/entities/{entity_id}/identifiers", json=id_payload_1, headers=self.headers_t1)
        self.assertEqual(res_collision.status_code, 400)  # Rejection constraint

    # ----------------- Phase 2.6 Event & Timeline Scaffold -----------------
    def test_events_and_timeline(self):
        # Setup entity
        res_entity = self.client.post("/entities", json={"status": "ACTIVE", "identity": "Shipment Timeline"}, headers=self.headers_t1)
        entity_id = res_entity.json()["id"]

        # 1. Append multiple events
        evt_1 = {"event_type": "SHIPMENT_CREATED", "payload": {"created_by": "system"}}
        res_e1 = self.client.post(f"/entities/{entity_id}/events", json=evt_1, headers=self.headers_t1)
        self.assertEqual(res_e1.status_code, 201)

        evt_2 = {"event_type": "SHIPMENT_INGESTED", "payload": {"status": "in_transit"}}
        res_e2 = self.client.post(f"/entities/{entity_id}/events", json=evt_2, headers=self.headers_t1)
        self.assertEqual(res_e2.status_code, 201)

        # 2. Get chronological timeline
        res_timeline = self.client.get(f"/entities/{entity_id}/timeline", headers=self.headers_t1)
        self.assertEqual(res_timeline.status_code, 200)
        timeline = res_timeline.json()
        self.assertEqual(len(timeline), 2)
        self.assertEqual(timeline[0]["event_type"], "SHIPMENT_CREATED")
        self.assertEqual(timeline[1]["event_type"], "SHIPMENT_INGESTED")

    # ----------------- Phase 2.7 Audit Logging -----------------
    def test_audit_logs(self):
        # Setup action: create a mailbox with a secret token
        raw_token = "secret_access_token_456"
        payload = {
            "provider_type": "GMAIL",
            "scope_state": "https://www.googleapis.com/auth/gmail.readonly",
            "raw_token": raw_token
        }
        res_mbox = self.client.post("/mailboxes", json=payload, headers=self.headers_t1)
        mailbox_id = res_mbox.json()["id"]

        # 1. Query audit logs
        res_audit = self.client.get("/audit_logs", headers=self.headers_t1)
        self.assertEqual(res_audit.status_code, 200)
        logs = res_audit.json()
        self.assertTrue(len(logs) > 0)
        
        # Verify the top/latest log is about the mailbox creation
        mbox_log = next(log for log in logs if log["object_id"] == mailbox_id)
        self.assertEqual(mbox_log["action"], "CREATE_MAILBOX")
        self.assertEqual(mbox_log["object_type"], "MAILBOX")
        
        # 2. Check secret masking (Phase 2.7)
        changes = mbox_log["changes"]
        self.assertEqual(changes["raw_token"], "[MASKED]")
        self.assertNotIn("secret_access_token_456", str(changes))

    # ----------------- Phase 2.9 Ingestion Readiness Hooks -----------------
    def test_ingestion_readiness_hook(self):
        # Setup mailbox
        res_mbox = self.client.post("/mailboxes", json={"provider_type": "GMAIL"}, headers=self.headers_t1)
        mailbox_id = res_mbox.json()["id"]

        # Trigger mock ingestion hook
        hook_payload = {
            "mailbox_id": mailbox_id,
            "provider_message_id": "ingest-111",
            "thread_id": "thread-ingest",
            "sender": "cargo-agent@freight.com",
            "subject": "Urgent Shipment",
            "body": "Shipment coordinates BOL-8888",
            "received_at": datetime.datetime.utcnow().isoformat(),
            "normalized_metadata": {"ingest_type": "webhook"}
        }
        res_hook = self.client.post("/ingestion/mock", json=hook_payload, headers=self.headers_t1)
        self.assertEqual(res_hook.status_code, 201)
        data = res_hook.json()
        self.assertEqual(data["status"], "success")
        email_id = data["email_id"]
        entity_id = data["entity_id"]

        # Verify that raw email exists
        res_email = self.client.get("/emails", headers=self.headers_t1)
        emails = res_email.json()
        self.assertTrue(any(e["id"] == email_id for e in emails))

        # Verify that event was generated
        res_timeline = self.client.get(f"/entities/{entity_id}/timeline", headers=self.headers_t1)
        timeline = res_timeline.json()
        self.assertTrue(any(evt["event_type"] == "EMAIL_INGESTED" for evt in timeline))

        # Re-trigger with same msg-id to verify duplicate handling inside ingestion hook
        res_hook_dup = self.client.post("/ingestion/mock", json=hook_payload, headers=self.headers_t1)
        self.assertEqual(res_hook_dup.status_code, 201)
        self.assertEqual(res_hook_dup.json()["email_id"], email_id)  # Returned the same email_id without creating duplicate

if __name__ == "__main__":
    unittest.main()
