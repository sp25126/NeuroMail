import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_db, Base
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import datetime
import uuid

# Ensure we use test DB
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_outlook_mailbox.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Apply migrations / schema creation
Base.metadata.create_all(bind=engine)

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    def override_get_db():
        try:
            db = TestingSessionLocal()
            db.execute(text("PRAGMA foreign_keys = ON;"))  # In case foreign keys are needed
            yield db
        finally:
            db.close()
    
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    from models import Tenant, User, FreightTenantConfig
    tenant = Tenant(id="tenant-1", name="Test Tenant")
    db.add(tenant)
    user = User(id="user-1", email="admin@test.com", tenant_id="tenant-1", role="freight_admin")
    db.add(user)
    config = FreightTenantConfig(id="cfg-1", tenant_id="tenant-1")
    db.add(config)
    db.commit()
    db.close()
    yield
    app.dependency_overrides.pop(get_db, None)

def headers(tenant="tenant-1", user="user-1"):
    return {"x-tenant-id": tenant, "x-user-id": user}

def test_outlook_auth_url():
    res = client.get("/api/trackflow/mailboxes/outlook/auth-url", headers=headers())
    assert res.status_code == 200
    data = res.json()
    assert "authorization_url" in data
    url = data["authorization_url"]
    assert "login.microsoftonline.com" in url
    assert "openid" in url
    assert "Mail.Read" in url
    # Ensure Mail.Send and Mail.ReadWrite are not requested
    assert "Mail.Send" not in url
    assert "Mail.ReadWrite" not in url

    # Verify audit log is generated
    db = TestingSessionLocal()
    from models import FreightAuditLog
    audit = db.query(FreightAuditLog).filter_by(action="OUTLOOK_AUTH_INITIATED").first()
    assert audit is not None
    db.close()

def test_outlook_callback_mock():
    # Invoke callback with state containing tenant_id
    state = "tenant_id=tenant-1&nonce=xyz"
    res = client.get(f"/api/trackflow/mailboxes/outlook/callback?code=mock_code&state={state}", follow_redirects=False)
    assert res.status_code == 307  # Redirect response back to frontend settings
    
    # Verify connection created in database
    db = TestingSessionLocal()
    from models import MailboxConnection, FreightAuditLog
    conn = db.query(MailboxConnection).filter_by(tenant_id="tenant-1", provider="outlook").first()
    assert conn is not None
    assert conn.email_address == "mock_outlook_user@outlook.com"
    assert conn.status == "connected"
    
    # Verify audit log is written
    audit = db.query(FreightAuditLog).filter_by(action="OUTLOOK_CONNECTED").first()
    assert audit is not None
    assert audit.payload == {"email": "mock_outlook_user@outlook.com"}
    db.close()

def test_outlook_test_and_validation():
    # 1. First run validation on non-existent connection
    res = client.post("/api/trackflow/mailboxes/outlook/test", headers=headers())
    assert res.status_code == 200
    assert res.json()["ok"] is False
    assert "No active Outlook connection found" in res.json()["errors"][0]

    # 2. Add connection
    db = TestingSessionLocal()
    from models import MailboxConnection
    conn = MailboxConnection(
        id="conn-outlook-1",
        tenant_id="tenant-1",
        provider="outlook",
        email_address="outlook_test@outlook.com",
        status="connected",
        access_token_encrypted="vault:mock_access",
        token_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    )
    db.add(conn)
    db.commit()
    db.close()

    # 3. Test without subject patterns -> should give warning about no matching rules
    res = client.post("/api/trackflow/mailboxes/outlook/test", headers=headers())
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["matching_messages_found"] == 0
    assert len(data["warnings"]) > 0
    assert "no emails matched your current TrackFlow subject rules" in data["warnings"][0]

    # 4. Add subject patterns, run validation again -> should succeed with mock matching count
    db = TestingSessionLocal()
    from models import FreightTenantConfig
    cfg = db.query(FreightTenantConfig).filter_by(tenant_id="tenant-1").first()
    cfg.freight_subject_patterns = ["BOL#", "Booking"]
    db.commit()
    db.close()

    res = client.post("/api/trackflow/mailboxes/outlook/test", headers=headers())
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["matching_messages_found"] == 3
    assert len(data["warnings"]) == 0

    # 5. Check audit log
    db = TestingSessionLocal()
    from models import FreightAuditLog
    audit = db.query(FreightAuditLog).filter_by(action="OUTLOOK_CONNECTION_TESTED").first()
    assert audit is not None
    db.close()

def test_outlook_disconnect():
    # Insert connection
    db = TestingSessionLocal()
    from models import MailboxConnection
    conn = MailboxConnection(
        id="conn-outlook-2",
        tenant_id="tenant-1",
        provider="outlook",
        email_address="outlook_disconnect@outlook.com",
        status="connected"
    )
    db.add(conn)
    db.commit()
    db.close()

    res = client.post("/api/trackflow/mailboxes/outlook/disconnect", headers=headers())
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # Verify status changed in DB
    db = TestingSessionLocal()
    from models import MailboxConnection, FreightAuditLog
    conn_after = db.query(MailboxConnection).filter_by(id="conn-outlook-2").first()
    assert conn_after.status == "disconnected"

    # Verify audit log is written
    audit = db.query(FreightAuditLog).filter_by(action="OUTLOOK_DISCONNECTED").first()
    assert audit is not None
    db.close()
