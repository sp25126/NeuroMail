import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import uuid

from main import app
from database import Base, get_db
from models import Tenant, User, AuditLog

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_phase1.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

client = TestClient(app)

class TestPhase1Foundation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=engine)
        db = TestingSessionLocal()
        
        # Create test tenants
        tenant1 = Tenant(id="tenant-1", name="Tenant One")
        tenant2 = Tenant(id="tenant-2", name="Tenant Two")
        db.add(tenant1)
        db.add(tenant2)
        
        # Create test users with different roles
        admin = User(id="user-admin", email="admin@tenant1.com", tenant_id="tenant-1", role="admin")
        operator = User(id="user-operator", email="op@tenant1.com", tenant_id="tenant-1", role="operator")
        viewer = User(id="user-viewer", email="viewer@tenant1.com", tenant_id="tenant-1", role="viewer")
        other_tenant_user = User(id="user-other", email="user@tenant2.com", tenant_id="tenant-2", role="admin")
        
        db.add(admin)
        db.add(operator)
        db.add(viewer)
        db.add(other_tenant_user)
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)

    def test_health_endpoints(self):
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

        response = client.get("/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ready")

    def test_tenant_isolation_middleware(self):
        # Missing headers
        response = client.get("/mailboxes")
        if response.status_code != 422:
            print(f"DEBUG: Response status: {response.status_code}, content: {response.content}")
        self.assertEqual(response.status_code, 422) # FastAPI validation error for missing headers

        # Non-existent tenant
        headers = {"X-Tenant-ID": "non-existent", "X-User-ID": "user-admin"}
        response = client.get("/mailboxes", headers=headers)
        self.assertEqual(response.status_code, 404)

        # Valid tenant, but user not in tenant
        headers = {"X-Tenant-ID": "tenant-1", "X-User-ID": "user-other"}
        response = client.get("/mailboxes", headers=headers)
        self.assertEqual(response.status_code, 403)

    def test_rbac_enforcement(self):
        # Admin can create mailbox
        headers = {"X-Tenant-ID": "tenant-1", "X-User-ID": "user-admin"}
        response = client.post("/mailboxes", json={"provider_type": "GMAIL"}, headers=headers)
        self.assertEqual(response.status_code, 201)

        # Viewer cannot create mailbox
        headers = {"X-Tenant-ID": "tenant-1", "X-User-ID": "user-viewer"}
        response = client.post("/mailboxes", json={"provider_type": "GMAIL"}, headers=headers)
        self.assertEqual(response.status_code, 403)

        # Operator can update status
        mailbox_id = response.json().get("id") # Use ID from previous successful creation or just mock
        headers = {"X-Tenant-ID": "tenant-1", "X-User-ID": "user-operator"}
        # First we need a mailbox id. Let's create one first as admin.
        headers_admin = {"X-Tenant-ID": "tenant-1", "X-User-ID": "user-admin"}
        mb = client.post("/mailboxes", json={"provider_type": "GMAIL"}, headers=headers_admin).json()
        
        response = client.patch(f"/mailboxes/{mb['id']}/status", json={"connection_status": "CONNECTED"}, headers=headers)
        self.assertEqual(response.status_code, 200)

    def test_audit_logging(self):
        db = TestingSessionLocal()
        # Admin creates entity
        headers = {"X-Tenant-ID": "tenant-1", "X-User-ID": "user-admin"}
        client.post("/entities", json={"status": "ACTIVE", "identity": "Audit Test"}, headers=headers)
        
        # Check audit log
        logs = db.query(AuditLog).filter(AuditLog.tenant_id == "tenant-1", AuditLog.action == "CREATE_ENTITY").all()
        self.assertTrue(len(logs) > 0)
        self.assertEqual(logs[0].performed_by, "admin@tenant1.com")
        db.close()

    def test_tenant_boundary_data_leak(self):
        # Tenant 2 tries to list Tenant 1 mailboxes
        # It shouldn't even be possible to pass Tenant 1 ID if we validate user belongs to tenant
        headers = {"X-Tenant-ID": "tenant-1", "X-User-ID": "user-other"}
        response = client.get("/mailboxes", headers=headers)
        self.assertEqual(response.status_code, 403)

        # Tenant 2 tries to access a mailbox ID from Tenant 1 (if there was a direct get)
        # Our list mailboxes only returns for the current tenant
        headers2 = {"X-Tenant-ID": "tenant-2", "X-User-ID": "user-other"}
        response = client.get("/mailboxes", headers=headers2)
        self.assertEqual(response.status_code, 200)
        # Should be empty if no mailboxes created for tenant-2
        self.assertEqual(len(response.json()), 0)

if __name__ == "__main__":
    unittest.main()
