import unittest
import os
import sys
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import patch

# Ensure API path is in import search path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import Base, get_db
from models import (
    Tenant, User, Mailbox, RawEmail,
    FreightConfig, FreightRawEmail, FreightShipment,
    FreightShipmentIdentifier, FreightEmailExtraction,
    FreightEvent, ReviewItem
)
from services.freight_service import (
    freight_ingest_emails,
    AIFreightExtractionSchema,
    FreightIdentifierSchema
)

# Use an isolated SQLite memory database
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

class TestFreightCore(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        
        db = TestingSessionLocal()
        # Seed test tenants
        cls.tenant1 = Tenant(id="tenant-freight-1", name="Freight Tenant One")
        cls.tenant2 = Tenant(id="tenant-freight-2", name="Freight Tenant Two")
        
        # Seed test users
        cls.user1 = User(id="user-f1", email="user1@freight1.com", name="User F1", tenant_id="tenant-freight-1", role="operator")
        cls.user2 = User(id="user-f2", email="user2@freight2.com", name="User F2", tenant_id="tenant-freight-2", role="operator")
        
        # Seed test mailboxes
        cls.mailbox1 = Mailbox(id="mb-f1", tenant_id="tenant-freight-1", provider_type="GMAIL", connection_status="CONNECTED")
        cls.mailbox2 = Mailbox(id="mb-f2", tenant_id="tenant-freight-2", provider_type="OUTLOOK", connection_status="CONNECTED")
        
        # Seed Tenant-specific Freight configs
        cls.config1 = FreightConfig(
            id="cfg-f1",
            tenant_id="tenant-freight-1",
            subject_patterns=["shipment", "bol-", "arrival notice"],
            from_addresses=["carrier.com"]
        )
        cls.config2 = FreightConfig(
            id="cfg-f2",
            tenant_id="tenant-freight-2",
            subject_patterns=["booking", "delivery"],
            from_addresses=[]
        )
        
        db.add(cls.tenant1)
        db.add(cls.tenant2)
        db.add(cls.user1)
        db.add(cls.user2)
        db.add(cls.mailbox1)
        db.add(cls.mailbox2)
        db.add(cls.config1)
        db.add(cls.config2)
        
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self.headers_t1 = {"X-Tenant-ID": "tenant-freight-1", "X-User-ID": "user-f1"}
        self.headers_t2 = {"X-Tenant-ID": "tenant-freight-2", "X-User-ID": "user-f2"}
        
        # Clear dynamic data tables before each test
        db = TestingSessionLocal()
        db.query(RawEmail).delete()
        db.query(FreightRawEmail).delete()
        db.query(FreightShipment).delete()
        db.query(FreightShipmentIdentifier).delete()
        db.query(FreightEmailExtraction).delete()
        db.query(FreightEvent).delete()
        db.query(ReviewItem).delete()
        
        # Reset ingestion configs
        for cfg in db.query(FreightConfig).all():
            cfg.last_ingestion_at = None
            db.add(cfg)
            
        db.commit()
        db.close()

    def test_idempotent_ingestion(self):
        db = TestingSessionLocal()
        
        # 1. Add raw email matching subject and sender allowlist for tenant-freight-1
        email = RawEmail(
            id="raw-email-1",
            tenant_id="tenant-freight-1",
            mailbox_id="mb-f1",
            provider_message_id="msg-123",
            thread_id="th-123",
            sender="notifications@carrier.com",
            subject="Shipment status update: BOL-10020",
            body="Your shipment BOL-10020 is on its way. Carrier: MSC, Origin: Shanghai, Destination: Rotterdam, ETA: 2026-07-10.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(email)
        db.commit()
        
        # 2. Run ingestion engine
        count = freight_ingest_emails(db, "tenant-freight-1")
        self.assertEqual(count, 1)
        
        # 3. Verify database state
        raw_freights = db.query(FreightRawEmail).filter(FreightRawEmail.tenant_id == "tenant-freight-1").all()
        self.assertEqual(len(raw_freights), 1)
        self.assertEqual(raw_freights[0].parsing_status, "parsed")
        
        shipments = db.query(FreightShipment).filter(FreightShipment.tenant_id == "tenant-freight-1").all()
        self.assertEqual(len(shipments), 1)
        self.assertEqual(shipments[0].primary_reference, "BOL-10020")
        self.assertEqual(shipments[0].carrier, "MSC")
        self.assertEqual(shipments[0].origin_port, "Shanghai")
        
        extractions = db.query(FreightEmailExtraction).filter(FreightEmailExtraction.tenant_id == "tenant-freight-1").all()
        self.assertEqual(len(extractions), 1)
        self.assertEqual(extractions[0].extraction_status, "success")
        
        events = db.query(FreightEvent).filter(FreightEvent.tenant_id == "tenant-freight-1").all()
        # Should have shipment_created and email_ingested events
        event_types = [e.event_type for e in events]
        self.assertIn("shipment_created", event_types)
        self.assertIn("email_ingested", event_types)
        
        # 4. Run ingestion again (should be idempotent)
        count_repeat = freight_ingest_emails(db, "tenant-freight-1")
        self.assertEqual(count_repeat, 0)
        
        # Shipments count must remain 1
        shipments_repeat = db.query(FreightShipment).filter(FreightShipment.tenant_id == "tenant-freight-1").all()
        self.assertEqual(len(shipments_repeat), 1)
        db.close()

    def test_shipment_consolidation(self):
        db = TestingSessionLocal()
        
        # 1. First email: creates shipment BOL-50000 with carrier MSC and origin Shanghai
        email1 = RawEmail(
            id="raw-email-c1",
            tenant_id="tenant-freight-1",
            mailbox_id="mb-f1",
            provider_message_id="msg-c1",
            thread_id="th-c1",
            sender="notifications@carrier.com",
            subject="Shipment status update: BOL-50000",
            body="Shipment BOL-50000 is loading. Carrier: MSC, Origin: Shanghai.",
            received_at=datetime.datetime.utcnow() - datetime.timedelta(hours=2)
        )
        db.add(email1)
        db.commit()
        
        freight_ingest_emails(db, "tenant-freight-1")
        
        # Verify shipment state
        shipment = db.query(FreightShipment).filter(FreightShipment.primary_reference == "BOL-50000").one()
        self.assertEqual(shipment.carrier, "MSC")
        self.assertEqual(shipment.origin_port, "Shanghai")
        self.assertIsNone(shipment.destination_port)
        
        # 2. Second email: updates same shipment BOL-50000 with destination Rotterdam and ETA
        email2 = RawEmail(
            id="raw-email-c2",
            tenant_id="tenant-freight-1",
            mailbox_id="mb-f1",
            provider_message_id="msg-c2",
            thread_id="th-c2",
            sender="notifications@carrier.com",
            subject="Shipment status update: BOL-50000",
            body="Shipment BOL-50000 route updated. Destination: Rotterdam, ETA: 2026-08-01.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(email2)
        db.commit()
        
        freight_ingest_emails(db, "tenant-freight-1")
        
        # Verify consolidated shipment
        shipment_updated = db.query(FreightShipment).filter(FreightShipment.primary_reference == "BOL-50000").one()
        self.assertEqual(shipment_updated.carrier, "MSC") # preserved
        self.assertEqual(shipment_updated.origin_port, "Shanghai") # preserved
        self.assertEqual(shipment_updated.destination_port, "Rotterdam") # updated
        self.assertIsNotNone(shipment_updated.eta)
        
        # Overall shipment count is still 1
        shipments_count = db.query(FreightShipment).filter(FreightShipment.tenant_id == "tenant-freight-1").count()
        self.assertEqual(shipments_count, 1)
        db.close()

    @patch('neuromail.core.llm.client.LLMClient.generate')
    def test_llm_fallback_parsing(self, mock_generate):
        db = TestingSessionLocal()
        
        # Setup mock return value for LLM structured output
        mock_generate.return_value = AIFreightExtractionSchema(
            primary_reference="BOL-LLM-112233",
            carrier="Maersk",
            origin_port="Ningbo",
            destination_port="Los Angeles",
            eta="2026-07-20",
            identifiers=[FreightIdentifierSchema(identifier_type="container_id", identifier_value="MSCU9988776")]
        )
        
        # Email has no obvious BOL regex match in text, requiring LLM fallback
        email = RawEmail(
            id="raw-email-llm",
            tenant_id="tenant-freight-1",
            mailbox_id="mb-f1",
            provider_message_id="msg-llm",
            thread_id="th-llm",
            sender="notifications@carrier.com",
            subject="Shipment booking details update",
            body="Our ops team has scheduled the freight. Booking ref/B/L reference is recorded. Container code: MSCU9988776.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(email)
        db.commit()
        
        freight_ingest_emails(db, "tenant-freight-1")
        
        # Verify LLM extracted shipment
        shipment = db.query(FreightShipment).filter(FreightShipment.primary_reference == "BOL-LLM-112233").first()
        self.assertIsNotNone(shipment)
        self.assertEqual(shipment.carrier, "Maersk")
        self.assertEqual(shipment.origin_port, "Ningbo")
        self.assertEqual(shipment.destination_port, "Los Angeles")
        
        # Verify extra identifier container_id was synced
        ident = db.query(FreightShipmentIdentifier).filter(
            FreightShipmentIdentifier.shipment_id == shipment.id,
            FreightShipmentIdentifier.identifier_type == "container_id"
        ).first()
        self.assertIsNotNone(ident)
        self.assertEqual(ident.identifier_value, "MSCU9988776")
        
        db.close()

    def test_quarantine_lifecycle(self):
        db = TestingSessionLocal()
        
        # 1. Add email with no primary reference at all
        email = RawEmail(
            id="raw-email-q",
            tenant_id="tenant-freight-1",
            mailbox_id="mb-f1",
            provider_message_id="msg-quar",
            thread_id="th-quar",
            sender="notifications@carrier.com",
            subject="Shipment notice: Unknown details",
            body="This email is empty and has no tracking numbers or references.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(email)
        db.commit()
        
        # With patch returning None or empty details for LLM
        with patch('neuromail.core.llm.client.LLMClient.generate', return_value=None):
            freight_ingest_emails(db, "tenant-freight-1")
            
        # 2. Verify quarantine state
        raw_freight = db.query(FreightRawEmail).filter(FreightRawEmail.provider_message_id == "msg-quar").one()
        self.assertEqual(raw_freight.parsing_status, "quarantined")
        self.assertIn("Missing reliable primary reference", raw_freight.parsing_error)
        
        # Verify NO shipment was created
        shipments_count = db.query(FreightShipment).count()
        self.assertEqual(shipments_count, 0)
        
        # Verify extraction marked as quarantined
        extraction = db.query(FreightEmailExtraction).filter(FreightEmailExtraction.raw_email_id == raw_freight.id).one()
        self.assertEqual(extraction.extraction_status, "quarantined")
        self.assertEqual(extraction.confidence_score, 0.0)
        
        # Verify events contain quarantine log
        events = db.query(FreightEvent).filter(FreightEvent.event_type == "quarantined").all()
        self.assertEqual(len(events), 1)
        
        # Verify ReviewItem is generated for UI Review Queue
        review = db.query(ReviewItem).filter(ReviewItem.object_id == raw_freight.id).first()
        self.assertIsNotNone(review)
        self.assertEqual(review.status, "PENDING")
        
        # 3. Verify API endpoint GET /freight/quarantine lists this email
        response = self.client.get("/freight/quarantine", headers=self.headers_t1)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], raw_freight.id)
        
        db.close()

    def test_tenant_isolation(self):
        db = TestingSessionLocal()
        
        # Ingest Tenant 1 email
        email1 = RawEmail(
            id="t1-email",
            tenant_id="tenant-freight-1",
            mailbox_id="mb-f1",
            provider_message_id="msg-t1",
            thread_id="th-t1",
            sender="notifications@carrier.com",
            subject="Shipment status update: BOL-T1-100",
            body="BOL-T1-100 update. Carrier: Maersk.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(email1)
        
        # Ingest Tenant 2 email (matching patterns of config 2: 'booking')
        email2 = RawEmail(
            id="t2-email",
            tenant_id="tenant-freight-2",
            mailbox_id="mb-f2",
            provider_message_id="msg-t2",
            thread_id="th-t2",
            sender="agent@logistics.com",
            subject="Booking confirm: BOL-T2-200",
            body="BOL-T2-200 booking updated. Carrier: MSC.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(email2)
        db.commit()
        
        freight_ingest_emails(db, "tenant-freight-1")
        freight_ingest_emails(db, "tenant-freight-2")
        
        # Verify database scoped counts
        t1_shipments = db.query(FreightShipment).filter(FreightShipment.tenant_id == "tenant-freight-1").all()
        self.assertEqual(len(t1_shipments), 1)
        self.assertEqual(t1_shipments[0].primary_reference, "BOL-T1-100")
        
        t2_shipments = db.query(FreightShipment).filter(FreightShipment.tenant_id == "tenant-freight-2").all()
        self.assertEqual(len(t2_shipments), 1)
        self.assertEqual(t2_shipments[0].primary_reference, "BOL-T2-200")
        
        # 1. API isolation: Tenant 1 lists shipments
        response_t1 = self.client.get("/freight/shipments", headers=self.headers_t1)
        self.assertEqual(response_t1.status_code, 200)
        data_t1 = response_t1.json()
        self.assertEqual(len(data_t1), 1)
        self.assertEqual(data_t1[0]["primary_reference"], "BOL-T1-100")
        
        # 2. API isolation: Tenant 2 lists shipments
        response_t2 = self.client.get("/freight/shipments", headers=self.headers_t2)
        self.assertEqual(response_t2.status_code, 200)
        data_t2 = response_t2.json()
        self.assertEqual(len(data_t2), 1)
        self.assertEqual(data_t2[0]["primary_reference"], "BOL-T2-200")
        
        # 3. API isolation: Tenant 2 attempts to get Tenant 1 shipment details
        t1_shipment_id = t1_shipments[0].id
        response_cross = self.client.get(f"/freight/shipments/{t1_shipment_id}", headers=self.headers_t2)
        self.assertEqual(response_cross.status_code, 404)
        
        db.close()

if __name__ == "__main__":
    unittest.main()
