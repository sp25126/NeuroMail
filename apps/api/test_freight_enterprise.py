import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_db, Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import datetime
import uuid
import sys
import os

# Ensure we use test DB
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_freight_enterprise.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()
            
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Create required base Tenant and User
    from models import Tenant, User
    tenant = Tenant(id="tenant-1", name="Test Tenant")
    db.add(tenant)
    user = User(id="user-1", email="admin@test.com", tenant_id="tenant-1", role="freight_admin")
    db.add(user)
    db.commit()
    db.close()
    yield
    app.dependency_overrides.pop(get_db, None)

def headers(tenant="tenant-1", user="user-1"):
    return {"x-tenant-id": tenant, "x-user-id": user}

def test_onboarding_transitions():
    # Get initial
    res = client.get("/freight/onboarding", headers=headers())
    assert res.status_code == 200
    assert res.json()["step_mailbox_connected"] is False

    # Connect mailbox
    res = client.post("/freight/onboarding/connect-mailbox", headers=headers())
    assert res.status_code == 200
    assert res.json()["step_mailbox_connected"] is True

def test_provider_connect_disconnect():
    res = client.post("/freight/providers/gmail/connect", headers=headers())
    assert res.status_code == 200
    assert res.json()["status"] == "connected"

    # Check audit log
    db = TestingSessionLocal()
    from models import FreightAuditLog
    log = db.query(FreightAuditLog).filter_by(action="connect_gmail").first()
    assert log is not None
    db.close()

    res = client.post("/freight/providers/gmail/disconnect", headers=headers())
    assert res.status_code == 200
    assert res.json()["status"] == "disconnected"

def test_admin_health_endpoints():
    res = client.get("/freight/admin/health", headers=headers())
    assert res.status_code == 200
    assert res.json() == {"status": "healthy"}

def test_quarantine_replay():
    # Insert a quarantine raw email
    db = TestingSessionLocal()
    from models import FreightRawEmail, Mailbox
    mb = Mailbox(id="mb-1", tenant_id="tenant-1", provider_type="GMAIL")
    db.add(mb)
    db.commit()
    
    email = FreightRawEmail(
        id="raw-1",
        tenant_id="tenant-1",
        mailbox_id="mb-1",
        provider="GMAIL",
        provider_message_id="msg-1",
        from_address="test@test.com",
        received_at=datetime.datetime.utcnow(),
        parsing_status="quarantined"
    )
    db.add(email)
    db.commit()
    db.close()

    res = client.post("/freight/admin/quarantine/raw-1/replay", headers=headers())
    assert res.status_code == 200
    
    db = TestingSessionLocal()
    from models import FreightRawEmail, FreightAuditLog
    email_after = db.query(FreightRawEmail).get("raw-1")
    assert email_after.parsing_status == "pending"

    # check audit log
    audit = db.query(FreightAuditLog).filter_by(action="replay_quarantine").first()
    assert audit is not None
    db.close()

def test_tenant_visibility():
    res = client.get("/freight/admin/tenants/tenant-2/health", headers=headers())
    assert res.status_code == 403 # forbidden since current tenant is tenant-1

def test_rbac_restrictions():
    # User with freight_viewer role trying to connect provider
    db = TestingSessionLocal()
    from models import User
    viewer_user = User(id="user-viewer", email="viewer@test.com", tenant_id="tenant-1", role="freight_viewer")
    db.add(viewer_user)
    db.commit()
    db.close()

    # This should fail since connect needs admin
    res = client.post("/freight/providers/gmail/connect", headers=headers(user="user-viewer"))
    assert res.status_code == 403

def test_encrypted_credentials():
    payload = {
        "connection_metadata": {
            "api_key": "secret_key_123",
            "endpoint_url": "https://api.terminal49.com"
        }
    }
    res = client.post("/freight/providers/terminal49/connect", json=payload, headers=headers())
    assert res.status_code == 200
    conn_resp = res.json()
    # Key must be masked in response
    assert conn_resp["connection_metadata"]["api_key"] == "********"
    assert conn_resp["connection_metadata"]["endpoint_url"] == "https://api.terminal49.com"

    # In database it must be encrypted
    db = TestingSessionLocal()
    from models import FreightProviderConnection
    from services.vault import decrypt_token
    db_conn = db.query(FreightProviderConnection).filter_by(tenant_id="tenant-1", provider_type="terminal49").first()
    assert db_conn is not None
    assert db_conn.connection_metadata["api_key"].startswith("vault:")
    
    # Decrypting should return original
    encrypted_val = db_conn.connection_metadata["api_key"][6:]
    assert decrypt_token(encrypted_val) == "secret_key_123"
    db.close()

def test_approval_and_audit_flow():
    db = TestingSessionLocal()
    from models import FreightApproval, RawEmail, Mailbox
    
    mb = Mailbox(id="mb-2", tenant_id="tenant-1", provider_type="GMAIL")
    db.add(mb)
    db.commit()
    
    email = RawEmail(
        id="email-1",
        tenant_id="tenant-1",
        mailbox_id="mb-2",
        provider_message_id="msg-1",
        thread_id="thread-1",
        sender="shipper@example.com",
        subject="BOL 123",
        body="Your BOL 123 is here.",
        received_at=datetime.datetime.utcnow(),
    )
    db.add(email)
    db.commit()
    
    # Generate draft using ai_service which should automatically create FreightApproval
    from services.ai_service import generate_response_draft
    draft_item = generate_response_draft(db, "tenant-1", "email-1", "professional")
    db.commit()
    
    # Check that FreightApproval exists
    approval = db.query(FreightApproval).filter_by(tenant_id="tenant-1", target_id=draft_item.id).first()
    assert approval is not None
    assert approval.status == "pending"
    assert approval.approval_type == "email_send"
    db.close()

    # Resolve approval
    res = client.post(f"/freight/admin/approvals/{approval.id}/resolve?action=approved", headers=headers())
    assert res.status_code == 200
    assert res.json()["status"] == "approved"

    # Verify audit log was created
    db = TestingSessionLocal()
    from models import FreightAuditLog
    audit = db.query(FreightAuditLog).filter_by(action="resolve_approval_approved").first()
    assert audit is not None
    assert audit.target_id == approval.id
    db.close()
