import unittest
import os
import sys
import datetime
import base64
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure API path is in import search path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "workers", "neuromail", "tasks"))



from main import app
from database import Base, get_db
from models import Tenant, User, Mailbox, RawEmail, Attachment
from neuromail.core.auth import token_store, gmail_oauth, outlook_oauth
from neuromail.core.mailboxes.provider_factory import ProviderFactory
from neuromail.core.mailboxes.rate_limiter import execute_with_rate_limit
from neuromail.core.raw_email import ingestion_service, thread_service, attachment_service
from neuromail.core.mailboxes import connection_health, sync_state

from sqlalchemy.pool import StaticPool

# Isolated SQLite memory database for testing Phase 3
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

class TestPhase3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        db = TestingSessionLocal()
        
        # Seed test tenants
        cls.tenant_t1 = Tenant(id="tenant-1", name="Tenant One")
        cls.tenant_t2 = Tenant(id="tenant-2", name="Tenant Two")
        
        db.add(cls.tenant_t1)
        db.add(cls.tenant_t2)
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.client = TestClient(app)
        self.headers_t1 = {"X-Tenant-ID": "tenant-1"}
        self.headers_t2 = {"X-Tenant-ID": "tenant-2"}
        
        # Clear database tables before each test (except Tenant)
        db = TestingSessionLocal()
        db.query(Attachment).delete()
        db.query(RawEmail).delete()
        db.query(Mailbox).delete()
        db.commit()
        db.close()

    # ----------------- Phase 3.1 Encryption & Token Store -----------------
    def test_tenant_isolated_encryption(self):
        token = "secret_oauth_token_xyz_123"
        
        # Encrypt with tenant-1
        enc_t1 = token_store.encrypt_token(token, "tenant-1")
        # Encrypt with tenant-2
        enc_t2 = token_store.encrypt_token(token, "tenant-2")
        
        # Verify encrypted outputs are not same
        self.assertNotEqual(enc_t1, enc_t2)
        
        # Decrypt with corresponding tenants
        dec_t1 = token_store.decrypt_token(enc_t1, "tenant-1")
        dec_t2 = token_store.decrypt_token(enc_t2, "tenant-2")
        self.assertEqual(dec_t1, token)
        self.assertEqual(dec_t2, token)
        
        # Verify cross-tenant decryption failure
        with self.assertRaises(Exception):
            token_store.decrypt_token(enc_t1, "tenant-2")

    # ----------------- Phase 3.1 & 3.2 OAuth Handlers & Endpoints -----------------
    @patch("requests.post")
    @patch("requests.get")
    def test_gmail_oauth_flow_and_callback(self, mock_get, mock_post):
        db = TestingSessionLocal()
        # Seed a mailbox
        mailbox = Mailbox(id="gmail-mb", tenant_id="tenant-1", provider_type="GMAIL", connection_status="DISCONNECTED")
        db.add(mailbox)
        db.commit()
        db.close()
        
        # Test Authorize URL Endpoint
        res_auth = self.client.get("/auth/gmail/authorize?mailbox_id=gmail-mb", headers=self.headers_t1)
        self.assertEqual(res_auth.status_code, 200)
        self.assertIn("authorization_url", res_auth.json())
        self.assertIn("state=tenant-1%3Agmail-mb", res_auth.json()["authorization_url"])
        
        # Mock Google Token Exchange Response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "access_token": "mock_google_access_token",
            "refresh_token": "mock_google_refresh_token",
            "expires_in": 3600
        }
        # Mock profile call
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"emailAddress": "test-user@gmail.com"}
        
        # Test Callback Endpoint
        res_callback = self.client.get("/auth/gmail/callback?code=mock_code&state=tenant-1:gmail-mb")
        self.assertEqual(res_callback.status_code, 200)
        data = res_callback.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["connection_status"], "CONNECTED")
        
        # Verify tokens are stored encrypted in the DB and NOT returned in API responses
        db = TestingSessionLocal()
        mb = db.query(Mailbox).filter(Mailbox.id == "gmail-mb").first()
        self.assertIsNotNone(mb.encrypted_access_token)
        self.assertIsNotNone(mb.encrypted_refresh_token)
        self.assertEqual(mb.scope_state, "test-user@gmail.com")
        
        # Ensure raw tokens are not leaked
        self.assertNotIn("mock_google_access_token", mb.encrypted_access_token)
        self.assertEqual(token_store.decrypt_token(mb.encrypted_access_token, "tenant-1"), "mock_google_access_token")
        db.close()

    @patch("requests.post")
    @patch("requests.get")
    def test_outlook_oauth_flow_and_callback(self, mock_get, mock_post):
        db = TestingSessionLocal()
        # Seed a mailbox
        mailbox = Mailbox(id="outlook-mb", tenant_id="tenant-1", provider_type="OUTLOOK", connection_status="DISCONNECTED")
        db.add(mailbox)
        db.commit()
        db.close()
        
        # Test Authorize URL Endpoint
        res_auth = self.client.get("/auth/outlook/authorize?mailbox_id=outlook-mb", headers=self.headers_t1)
        self.assertEqual(res_auth.status_code, 200)
        self.assertIn("authorization_url", res_auth.json())
        self.assertIn("state=tenant-1%3Aoutlook-mb", res_auth.json()["authorization_url"])
        
        # Mock Microsoft Token Exchange Response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "access_token": "mock_ms_access_token",
            "refresh_token": "mock_ms_refresh_token",
            "expires_in": 3600
        }
        # Mock profile call
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"mail": "test-user@outlook.com"}
        
        # Test Callback Endpoint
        res_callback = self.client.get("/auth/outlook/callback?code=mock_code&state=tenant-1:outlook-mb")
        self.assertEqual(res_callback.status_code, 200)
        data = res_callback.json()
        self.assertEqual(data["status"], "success")
        
        db = TestingSessionLocal()
        mb = db.query(Mailbox).filter(Mailbox.id == "outlook-mb").first()
        self.assertEqual(mb.scope_state, "test-user@outlook.com")
        self.assertEqual(token_store.decrypt_token(mb.encrypted_access_token, "tenant-1"), "mock_ms_access_token")
        db.close()

    # ----------------- Phase 3.3 & 3.4 Provider Adapters -----------------
    @patch("requests.get")
    def test_gmail_adapter_fetch_and_normalize(self, mock_get):
        db = TestingSessionLocal()
        mb = Mailbox(
            id="gmail-mb",
            tenant_id="tenant-1",
            provider_type="GMAIL",
            encrypted_access_token=token_store.encrypt_token("g_tok", "tenant-1"),
            access_token_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        )
        db.add(mb)
        db.commit()
        
        # Mock Gmail REST APIs
        # 1. Message list response (2 messages)
        mock_get.side_effect = [
            MagicMock(status_code=200, json=lambda: {"messages": [{"id": "msg1"}, {"id": "msg2"}]}),
            # Detail message 1
            MagicMock(status_code=200, json=lambda: {
                "id": "msg1",
                "threadId": "th1",
                "snippet": "Hello World body 1",
                "internalDate": "1717070000000",
                "payload": {
                    "headers": [
                        {"name": "From", "value": "alice@gmail.com"},
                        {"name": "Subject", "value": "Subject 1"}
                    ],
                    "parts": [
                        {"filename": "doc1.pdf", "mimeType": "application/pdf", "body": {"size": 2048, "attachmentId": "att1"}},
                        {"filename": "doc2.xlsx", "mimeType": "application/vnd.ms-excel", "body": {"size": 4096, "attachmentId": "att2"}}
                    ]
                }
            }),
            # Detail message 2
            MagicMock(status_code=200, json=lambda: {
                "id": "msg2",
                "threadId": "th1",
                "snippet": "Hello World body 2",
                "internalDate": "1717070060000",
                "payload": {
                    "headers": [
                        {"name": "From", "value": "bob@gmail.com"},
                        {"name": "Subject", "value": "Subject 1 Re"}
                    ]
                }
            })
        ]
        
        adapter = ProviderFactory.get_adapter("GMAIL")
        messages = adapter.fetch_messages(mb, db)
        
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["provider_message_id"], "msg1")
        self.assertEqual(messages[0]["thread_id"], "th1")
        self.assertEqual(messages[0]["sender"], "alice@gmail.com")
        self.assertEqual(messages[0]["subject"], "Subject 1")
        self.assertEqual(messages[0]["body"], "Hello World body 1")
        self.assertEqual(len(messages[0]["attachments"]), 2)
        self.assertEqual(messages[0]["attachments"][0]["filename"], "doc1.pdf")
        
        self.assertEqual(messages[1]["provider_message_id"], "msg2")
        self.assertEqual(len(messages[1]["attachments"]), 0)
        db.close()

    # ----------------- Phase 3.8 Thread Normalization & 3.9 Attachments -----------------
    def test_ingestion_service_threading_and_attachments(self):
        db = TestingSessionLocal()
        mb = Mailbox(id="mb-ingest", tenant_id="tenant-1", provider_type="GMAIL", connection_status="CONNECTED")
        db.add(mb)
        db.commit()
        
        msg1 = {
            "provider_message_id": "m1",
            "thread_id": "thread-1",
            "sender": "cargo@freight.com",
            "subject": "Shipment Update #100",
            "body": "Your cargo is arriving tomorrow.",
            "received_at": datetime.datetime.utcnow(),
            "attachments": [
                {"filename": "invoice.pdf", "content_type": "application/pdf", "file_size": 1500, "attachment_id": "att1"}
            ]
        }
        msg2 = {
            "provider_message_id": "m2",
            "thread_id": "thread-1",
            "sender": "manager@freight.com",
            "subject": "Re: Shipment Update #100",
            "body": "Got the update.",
            "received_at": datetime.datetime.utcnow() + datetime.timedelta(minutes=5),
            "attachments": []
        }
        
        # Ingest first message
        rec1 = ingestion_service.ingest_normalized_email(db, "tenant-1", "mb-ingest", msg1)
        # Ingest second message in the same thread
        rec2 = ingestion_service.ingest_normalized_email(db, "tenant-1", "mb-ingest", msg2)
        
        # Verify records exist in DB
        self.assertEqual(db.query(RawEmail).count(), 2)
        
        # Verify thread grouping
        thread_details = thread_service.get_thread_by_id(db, "tenant-1", "thread-1")
        self.assertEqual(thread_details["message_count"], 2)
        self.assertEqual(thread_details["thread_id"], "thread-1")
        self.assertEqual(thread_details["subject"], "Shipment Update #100")
        
        # Verify cross-tenant isolation for thread grouping
        thread_t2 = thread_service.get_thread_by_id(db, "tenant-2", "thread-1")
        self.assertEqual(thread_t2, {}) # Empty because of tenant-2 filter
        
        # Verify attachments are stored
        attachments = attachment_service.get_attachments_by_email(db, "tenant-1", rec1.id)
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0].filename, "invoice.pdf")
        self.assertEqual(attachments[0].file_size, 1500)
        
        # Try duplicate ingestion (idempotency)
        dup_rec = ingestion_service.ingest_normalized_email(db, "tenant-1", "mb-ingest", msg1)
        self.assertEqual(dup_rec.id, rec1.id)
        self.assertEqual(db.query(RawEmail).count(), 2) # No duplicates added
        db.close()

    # ----------------- Phase 3.10 Rate Limiting & Backoff -----------------
    def test_rate_limiter_retry_and_backoff(self):
        # We simulate a function that fails with HTTP 429 twice then succeeds
        mock_fn = MagicMock()
        
        # Mock requests.exceptions.HTTPError with response status_code
        from requests.exceptions import HTTPError
        mock_resp_429 = MagicMock()
        mock_resp_429.status_code = 429
        mock_resp_429.headers = {"Retry-After": "1"}
        
        err = HTTPError(response=mock_resp_429)
        mock_fn.side_effect = [err, err, "success_result"]
        
        with patch("time.sleep") as mock_sleep:
            res = execute_with_rate_limit("test-limiter", mock_fn, initial_backoff=0.1)
            self.assertEqual(res, "success_result")
            self.assertEqual(mock_fn.call_count, 3)
            # Sleep was triggered twice due to the two 429 errors
            self.assertEqual(mock_sleep.call_count, 2)

    # ----------------- Phase 3.5 & 3.6 Webhook Endpoints -----------------
    @patch("requests.get")
    def test_gmail_webhook_decode_and_sync(self, mock_get):
        db = TestingSessionLocal()
        mb = Mailbox(
            id="mb-gmail-wh",
            tenant_id="tenant-1",
            provider_type="GMAIL",
            scope_state="web-user@gmail.com",
            encrypted_access_token=token_store.encrypt_token("g_tok", "tenant-1"),
            access_token_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        )
        db.add(mb)
        db.commit()
        db.close()
        
        # Google Pub/Sub mock push payload
        # Decoded data contains: {"emailAddress": "web-user@gmail.com", "historyId": 9876}
        encoded_data = base64.b64encode(json.dumps({
            "emailAddress": "web-user@gmail.com",
            "historyId": 9876
        }).encode()).decode()
        
        payload = {
            "message": {
                "data": encoded_data,
                "messageId": "pubsub-msg-1"
            }
        }
        
        # Mock detail calls inside the webhook endpoint fetch list
        mock_get.side_effect = [
            # history list
            MagicMock(status_code=200, json=lambda: {
                "history": [
                    {
                        "messagesAdded": [
                            {"message": {"id": "wh-msg-1"}}
                        ]
                    }
                ]
            }),
            # message detail
            MagicMock(status_code=200, json=lambda: {
                "id": "wh-msg-1",
                "threadId": "th-wh",
                "snippet": "Webhook notification content",
                "internalDate": "1717070100000",
                "payload": {
                    "headers": [
                        {"name": "From", "value": "vendor@gmail.com"},
                        {"name": "Subject", "value": "Webhook Sync subject"}
                    ]
                }
            })
        ]
        
        res = self.client.post("/webhooks/gmail", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["messages_processed"], 1)
        
        # Verify email is in database
        db = TestingSessionLocal()
        emails = db.query(RawEmail).filter(RawEmail.provider_message_id == "wh-msg-1").all()
        self.assertEqual(len(emails), 1)
        self.assertEqual(emails[0].thread_id, "th-wh")
        
        mb_updated = db.query(Mailbox).filter(Mailbox.id == "mb-gmail-wh").first()
        self.assertEqual(mb_updated.last_history_id, "9876")
        db.close()

    def test_outlook_webhook_validation_challenge(self):
        # Microsoft Graph subscription validation challenge sends plain validationToken
        res = self.client.post("/webhooks/outlook?validationToken=challenge_token_abc_123")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.text, "challenge_token_abc_123")

    @patch("requests.get")
    def test_outlook_webhook_notification_sync(self, mock_get):
        db = TestingSessionLocal()
        mb = Mailbox(
            id="mb-outlook-wh",
            tenant_id="tenant-1",
            provider_type="OUTLOOK",
            webhook_subscription_id="sub-100",
            encrypted_access_token=token_store.encrypt_token("ms_tok", "tenant-1"),
            access_token_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        )
        db.add(mb)
        db.commit()
        db.close()
        
        # MS Graph change notification body
        payload = {
            "value": [
                {
                    "subscriptionId": "sub-100",
                    "clientState": "mb-outlook-wh",
                    "resourceData": {
                        "id": "outlook-msg-99"
                    }
                }
            ]
        }
        
        # Mock Graph message detail
        mock_get.return_value = MagicMock(status_code=200, json=lambda: {
            "id": "outlook-msg-99",
            "conversationId": "conv-100",
            "subject": "Microsoft Webhook Subject",
            "body": {"content": "Microsoft Webhook Body"},
            "from": {"emailAddress": {"address": "partner@microsoft.com"}},
            "receivedDateTime": "2026-05-30T10:20:30Z",
            "hasAttachments": False
        })
        
        res = self.client.post("/webhooks/outlook", json=payload)
        self.assertEqual(res.status_code, 202) # Graph accepts 202
        
        # Verify message is stored
        db = TestingSessionLocal()
        emails = db.query(RawEmail).filter(RawEmail.provider_message_id == "outlook-msg-99").all()
        self.assertEqual(len(emails), 1)
        self.assertEqual(emails[0].thread_id, "conv-100")
        self.assertEqual(emails[0].sender, "partner@microsoft.com")
        db.close()

    # ----------------- Phase 3.7 Polling Fallback & 3.12 Connection Health -----------------
    @patch("inbox_poll.SessionLocal", new=TestingSessionLocal)
    @patch("neuromail.core.mailboxes.gmail_adapter.GmailAdapter.fetch_messages")
    def test_scheduled_polling_fallback(self, mock_fetch):
        db = TestingSessionLocal()
        mb = Mailbox(id="mb-polling", tenant_id="tenant-1", provider_type="GMAIL", connection_status="CONNECTED", last_sync_time=None)
        db.add(mb)
        db.commit()
        db.close()
        
        # Mock adapter returning 1 message
        mock_fetch.return_value = [
            {
                "provider_message_id": "poll-msg-1",
                "thread_id": "th-poll",
                "sender": "system@polling.com",
                "subject": "Polling sync",
                "body": "Synchronized via periodic fallback pull.",
                "received_at": datetime.datetime.utcnow(),
                "attachments": []
            }
        ]
        
        import sys
        sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/workers/neuromail/tasks")
        from inbox_poll import poll_all_connected_mailboxes
        res = poll_all_connected_mailboxes()
        
        self.assertEqual(res["processed"], 1)
        self.assertEqual(res["success"], 1)
        self.assertEqual(res["messages_ingested"], 1)
        
        db = TestingSessionLocal()
        # Verify sync time and connection health is updated
        mb_updated = db.query(Mailbox).filter(Mailbox.id == "mb-polling").first()
        self.assertIsNotNone(mb_updated.last_sync_time)
        self.assertEqual(mb_updated.connection_status, "CONNECTED")
        
        # Verify emails table
        self.assertEqual(db.query(RawEmail).filter(RawEmail.provider_message_id == "poll-msg-1").count(), 1)
        db.close()

    def test_connection_health_endpoint(self):
        db = TestingSessionLocal()
        # 1. Healthy mailbox
        mb_healthy = Mailbox(
            id="healthy-mb", tenant_id="tenant-1", provider_type="GMAIL", connection_status="CONNECTED",
            last_sync_time=datetime.datetime.utcnow()
        )
        # 2. Degraded mailbox (no sync for 3 hours)
        mb_degraded = Mailbox(
            id="degraded-mb", tenant_id="tenant-1", provider_type="GMAIL", connection_status="CONNECTED",
            last_sync_time=datetime.datetime.utcnow() - datetime.timedelta(hours=3)
        )
        # 3. Error mailbox
        mb_error = Mailbox(
            id="error-mb", tenant_id="tenant-1", provider_type="GMAIL", connection_status="ERROR",
            error_state="API Limit Exceeded"
        )
        db.add_all([mb_healthy, mb_degraded, mb_error])
        db.commit()
        db.close()
        
        # Test Status GET Endpoints
        res_h = self.client.get("/api/mailboxes/healthy-mb/status", headers=self.headers_t1)
        self.assertEqual(res_h.status_code, 200)
        self.assertEqual(res_h.json()["health_state"], "HEALTHY")
        
        res_d = self.client.get("/api/mailboxes/degraded-mb/status", headers=self.headers_t1)
        self.assertEqual(res_d.status_code, 200)
        self.assertEqual(res_d.json()["health_state"], "DEGRADED")
        
        res_e = self.client.get("/api/mailboxes/error-mb/status", headers=self.headers_t1)
        self.assertEqual(res_e.status_code, 200)
        self.assertEqual(res_e.json()["health_state"], "ERROR")
        self.assertEqual(res_e.json()["error_state"], "API Limit Exceeded")
