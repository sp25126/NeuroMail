import pytest
import uuid
import datetime
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import (
    Tenant, User, Mailbox, FreightRawEmail, FreightTenantConfig, 
    FreightShipment, TrackflowFieldProvenance, FreightEmailExtraction
)
from neuromail.core.raw_email import trackflow_extraction_pipeline
from neuromail.core.raw_email.trackflow_deterministic_parser import ExtractedField

@pytest.fixture(scope="function")
def test_context():
    from models import Base
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    tenant_id = f"test-trackflow-{uuid.uuid4().hex[:4]}"
    tenant = Tenant(id=tenant_id, name=f"Tenant {tenant_id}")
    db.add(tenant)
    
    user = User(id=f"user-{tenant_id}", email=f"admin@{tenant_id}.com", tenant_id=tenant_id)
    db.add(user)
    
    config = FreightTenantConfig(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        ai_extraction_enabled=True,
        extraction_confidence_threshold=0.7,
        quarantine_threshold=0.3
    )
    db.add(config)
    db.commit()
    
    yield db, tenant_id
    
    db.close()

def test_deterministic_parser_success(test_context):
    db, tenant_id = test_context
    from neuromail.core.raw_email import trackflow_deterministic_parser
    
    # Mock raw email
    class MockEmail:
        subject = "Booking: BK9908123"
        from_address = "notifications@maersk.com"
        raw_body = """
        Dear Customer,
        Your booking BK9908123 is confirmed.
        Container: MSKU1234567
        Vessel: MAERSK SEOUL
        POL: SHANGHAI
        POD: LOS ANGELES
        ETA: 2026-06-15
        """
        raw_headers = {}

    result = trackflow_deterministic_parser.parse(MockEmail(), [])
    
    assert result.primary_reference == "BK9908123"
    assert result.carrier == "Maersk"
    assert result.fields["container_id"].value == "MSKU1234567"
    assert result.fields["origin_port"].value == "SHANGHAI"
    assert result.fields["destination_port"].value == "LOS ANGELES"
    assert result.confidence >= 0.7

def test_extraction_pipeline_deterministic_only(test_context):
    db, tenant_id = test_context
    
    # Ensure AI is enabled but threshold is low enough that deterministic wins
    config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    config.extraction_confidence_threshold = 0.5
    db.commit()

    # Create raw email
    re_id = str(uuid.uuid4())
    raw_email = FreightRawEmail(
        id=re_id,
        tenant_id=tenant_id,
        mailbox_id="mb-1",
        provider="gmail",
        provider_message_id=f"msg-{re_id[:8]}",
        subject="Shipment Update Booking: BK9908123",
        from_address="carrier@example.com",
        received_at=datetime.datetime.utcnow(),
        raw_body="Your shipment BK9908123 is on its way. Carrier: MSC. ETA: 2026-12-01.",
        parsing_status="pending"
    )
    db.add(raw_email)
    db.commit()

    shipment = trackflow_extraction_pipeline.run(db, re_id, tenant_id)
    
    assert shipment is not None
    assert shipment.primary_reference == "BK9908123"
    assert shipment.carrier == "MSC"
    
    # Check provenance
    provs = db.query(TrackflowFieldProvenance).filter(TrackflowFieldProvenance.raw_email_id == re_id).all()
    assert len(provs) > 0
    methods = [p.extraction_method for p in provs]
    assert all(m == "deterministic" for m in methods)

def test_extraction_pipeline_ai_fallback_mock(test_context, monkeypatch):
    db, tenant_id = test_context
    
    # Set high threshold to force AI fallback
    config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    config.extraction_confidence_threshold = 1.0
    config.ai_extraction_enabled = True
    db.commit()

    # Mock AI Extractor
    from neuromail.core.raw_email.trackflow_ai_extractor import TrackflowAIExtractor
    
    def mock_extract(self, raw_email, partial_result, tenant_config):
        return {
            "booking_ref": {"value": "AI-REF-999", "confidence": 0.9},
            "carrier": {"value": "AI-Carrier", "confidence": 0.95},
            "container_id": {"value": None, "confidence": 0.0},
            "bl_number": {"value": None, "confidence": 0.0},
            "po_number": {"value": None, "confidence": 0.0},
            "origin_port": {"value": "AI-Origin", "confidence": 0.8},
            "destination_port": {"value": "AI-Dest", "confidence": 0.8},
            "vessel": {"value": "AI-Vessel", "confidence": 0.7},
            "eta": {"value": "2026-07-01", "confidence": 0.85},
            "_model_used": "gpt-4o",
            "_raw_response": "{}"
        }
    
    monkeypatch.setattr(TrackflowAIExtractor, "extract", mock_extract)

    # Create raw email with very little info (low deterministic confidence)
    re_id = str(uuid.uuid4())
    raw_email = FreightRawEmail(
        id=re_id,
        tenant_id=tenant_id,
        mailbox_id="mb-1",
        provider="gmail",
        provider_message_id=f"msg-{re_id[:8]}",
        subject="Inquiry",
        from_address="client@example.com",
        received_at=datetime.datetime.utcnow(),
        raw_body="I want to know about AI-REF-999.",
        parsing_status="pending"
    )
    db.add(raw_email)
    db.commit()

    shipment = trackflow_extraction_pipeline.run(db, re_id, tenant_id)
    
    assert shipment is not None
    assert shipment.primary_reference == "AI-REF-999"
    
    # Check provenance
    provs = db.query(TrackflowFieldProvenance).filter(TrackflowFieldProvenance.raw_email_id == re_id).all()
    methods = [p.extraction_method for p in provs]
    assert "ai_assisted" in methods
    
    # Specifically check origin_port provenance
    origin_prov = next(p for p in provs if p.field_name == "origin_port")
    assert origin_prov.extraction_method == "ai_assisted"
    assert origin_prov.field_value == "AI-Origin"
    assert origin_prov.extraction_model == "gpt-4o"

def test_extraction_pipeline_quarantine(test_context):
    db, tenant_id = test_context
    
    # Create raw email with NO tracking info
    re_id = str(uuid.uuid4())
    raw_email = FreightRawEmail(
        id=re_id,
        tenant_id=tenant_id,
        mailbox_id="mb-1",
        provider="gmail",
        provider_message_id=f"msg-{re_id[:8]}",
        subject="Hello",
        from_address="someone@example.com",
        received_at=datetime.datetime.utcnow(),
        raw_body="Just saying hello, no shipment here.",
        parsing_status="pending"
    )
    db.add(raw_email)
    db.commit()

    # Disable AI to ensure deterministic fails and quarantines
    config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    config.ai_extraction_enabled = False
    db.commit()

    shipment = trackflow_extraction_pipeline.run(db, re_id, tenant_id)
    
    assert shipment is None
    
    # Verify raw email status
    db.refresh(raw_email)
    assert raw_email.parsing_status == "quarantined"
    assert raw_email.parsing_error == "no_primary_reference_found"

def test_idempotency(test_context):
    db, tenant_id = test_context
    
    re_id = str(uuid.uuid4())
    raw_email = FreightRawEmail(
        id=re_id,
        tenant_id=tenant_id,
        mailbox_id="mb-1",
        provider="gmail",
        provider_message_id=f"msg-{re_id[:8]}",
        subject="Idempotency BK-XYZ123",
        from_address="carrier@example.com",
        received_at=datetime.datetime.utcnow(),
        raw_body="BK-XYZ123 info.",
        parsing_status="pending"
    )
    db.add(raw_email)
    db.commit()

    # Run 1
    shipment1 = trackflow_extraction_pipeline.run(db, re_id, tenant_id)
    assert shipment1 is not None
    provs1 = db.query(TrackflowFieldProvenance).filter(TrackflowFieldProvenance.raw_email_id == re_id).count()
    
    # Run 2
    shipment2 = trackflow_extraction_pipeline.run(db, re_id, tenant_id)
    assert shipment2.id == shipment1.id
    provs2 = db.query(TrackflowFieldProvenance).filter(TrackflowFieldProvenance.raw_email_id == re_id).count()
    
    assert provs1 == provs2 # Should not double-count provenances

