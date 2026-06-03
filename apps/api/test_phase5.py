import uuid
import datetime
import os
import time
import json
import pytest
import requests
from typing import Dict, Any

# Target FastAPI server URL
BASE_URL = "http://127.0.0.1:8000"
TEST_TENANT = "tenant-phase5"
TENANT_B = "tenant-phase5-isolated"

def get_headers(tenant: str, role: str = "viewer", user_id: str = None) -> Dict[str, str]:
    if user_id is None:
        user_id = f"{tenant}-{role}"
    return {
        "x-tenant-id": tenant,
        "X-User-Role": role,
        "X-User-ID": user_id,
        "Content-Type": "application/json"
    }

@pytest.fixture(scope="module", autouse=True)
def setup_test_data():
    """
    Seeds test database with a tenant, users of different roles, and preliminary records.
    """
    from database import SessionLocal
    from models import Tenant, User, RawEmail, Alert, Mailbox, Rule, ReportDefinition, ReportRun, SavedView, NotificationChannel, NotificationPreference

    db = SessionLocal()
    try:
        # Clear existing data for these test tenants
        for tid in [TEST_TENANT, TENANT_B]:
            db.query(SavedView).filter(SavedView.tenant_id == tid).delete()
            db.query(ReportRun).filter(ReportRun.tenant_id == tid).delete()
            db.query(ReportDefinition).filter(ReportDefinition.tenant_id == tid).delete()
            db.query(Alert).filter(Alert.tenant_id == tid).delete()
            db.query(Rule).filter(Rule.tenant_id == tid).delete()
            db.query(RawEmail).filter(RawEmail.tenant_id == tid).delete()
            db.query(Mailbox).filter(Mailbox.tenant_id == tid).delete()
            db.query(NotificationPreference).filter(NotificationPreference.tenant_id == tid).delete()
            db.query(NotificationChannel).filter(NotificationChannel.tenant_id == tid).delete()
            db.query(User).filter(User.tenant_id == tid).delete()
            db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit()

        # Create test tenants
        for tid, name in [(TEST_TENANT, "Phase 5 Test Tenant"), (TENANT_B, "Tenant B Isolated")]:
            t = Tenant(id=tid, name=name)
            db.add(t)
        db.commit()

        # Create test users with different roles for both tenants
        roles = ["admin", "operator", "analyst", "viewer"]
        for tid in [TEST_TENANT, TENANT_B]:
            for role in roles:
                user_id = f"{tid}-{role}"
                u = User(
                    id=user_id,
                    email=f"{role}@{tid}.com",
                    name=f"User {role.capitalize()}",
                    tenant_id=tid,
                    role=role
                )
                db.add(u)
        db.commit()

        # Seed a default mailbox and raw email to make dashboard calculations non-empty
        m_id = "mailbox-p5"
        mailbox = Mailbox(
            id=m_id,
            tenant_id=TEST_TENANT,
            provider_type="GMAIL",
            connection_status="CONNECTED"
        )
        db.add(mailbox)
        db.commit()

        # Raw email
        email_id = "email-p5"
        email = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id=m_id,
            provider_message_id="msg-p5",
            thread_id="thread-p5",
            sender="sender@p5.com",
            subject="Operational Exception Alert",
            body="Cargo delay in Terminal 2",
            received_at=datetime.datetime.utcnow()
        )
        db.add(email)
        db.commit()

    finally:
        db.close()

# ─────────────────────────────────────────────────────────────────────────────
# 1. Role-Based Access Control (RBAC) tests
# ─────────────────────────────────────────────────────────────────────────────

def test_rbac_access_control():
    # 1. Viewer trying to create a rule -> Should return 403
    rule_payload = {
        "name": "Viewer Rule Attempt",
        "conditions": {"subject_contains": "test"},
        "outcome": {"action": "create_alert"}
    }
    resp = requests.post(
        f"{BASE_URL}/rules", 
        json=rule_payload, 
        headers=get_headers(TEST_TENANT, role="viewer")
    )
    assert resp.status_code == 403

    # 2. Operator trying to create a rule -> Should succeed (201)
    resp_op = requests.post(
        f"{BASE_URL}/rules", 
        json=rule_payload, 
        headers=get_headers(TEST_TENANT, role="operator")
    )
    assert resp_op.status_code == 201
    rule_id = resp_op.json()["id"]

    # Clean up the created rule
    resp_del = requests.delete(
        f"{BASE_URL}/rules/{rule_id}", 
        headers=get_headers(TEST_TENANT, role="operator")
    )
    assert resp_del.status_code == 200

    # 3. Viewer trying to create report definitions -> Should return 403
    report_payload = {
        "name": "Viewer Report Attempt",
        "report_type": "WEEKLY_SUMMARY",
        "config": {"days": 7}
    }
    resp_rep = requests.post(
        f"{BASE_URL}/reports/definitions", 
        json=report_payload, 
        headers=get_headers(TEST_TENANT, role="viewer")
    )
    assert resp_rep.status_code == 403

    # 4. Analyst trying to create report definitions -> Should succeed (201)
    resp_rep_an = requests.post(
        f"{BASE_URL}/reports/definitions", 
        json=report_payload, 
        headers=get_headers(TEST_TENANT, role="analyst")
    )
    assert resp_rep_an.status_code == 201

# ─────────────────────────────────────────────────────────────────────────────
# 2. Reporting Engine tests
# ─────────────────────────────────────────────────────────────────────────────

def test_reporting_engine():
    # 1. Analyst creates a report definition
    payload = {
        "name": "Ops Weekly Summary",
        "report_type": "WEEKLY_SUMMARY",
        "config": {"days": 10}
    }
    resp = requests.post(
        f"{BASE_URL}/reports/definitions",
        json=payload,
        headers=get_headers(TEST_TENANT, role="analyst")
    )
    assert resp.status_code == 201
    def_data = resp.json()
    definition_id = def_data["id"]

    # 2. Analyst runs the report definition on-demand
    resp_run = requests.post(
        f"{BASE_URL}/reports/definitions/{definition_id}/run",
        headers=get_headers(TEST_TENANT, role="analyst")
    )
    assert resp_run.status_code == 201
    run_data = resp_run.json()
    assert run_data["status"] == "COMPLETED"
    assert run_data["output_data"] is not None
    assert "metrics" in run_data["output_data"]
    assert "Operational Summary" in run_data["human_output_markdown"]

    # 3. List report runs
    resp_list = requests.get(
        f"{BASE_URL}/reports/runs",
        headers=get_headers(TEST_TENANT, role="analyst")
    )
    assert resp_list.status_code == 200
    runs = resp_list.json()
    assert len(runs) >= 1
    assert any(r["id"] == run_data["id"] for r in runs)

    # 4. Tenant isolation check: Listing definitions from Tenant B should not show Tenant A's definition
    resp_b = requests.get(
        f"{BASE_URL}/reports/definitions",
        headers=get_headers(TENANT_B, role="analyst")
    )
    assert resp_b.status_code == 200
    assert len(resp_b.json()) == 0

# ─────────────────────────────────────────────────────────────────────────────
# 3. Dashboard Metrics and Cache Invalidation
# ─────────────────────────────────────────────────────────────────────────────

def test_dashboard_metrics_cache():
    # 1. Fetch initial metrics (Viewer is permitted)
    resp = requests.get(
        f"{BASE_URL}/dashboard/metrics",
        headers=get_headers(TEST_TENANT, role="viewer")
    )
    assert resp.status_code == 200
    initial_metrics = resp.json()
    initial_count = initial_metrics["email_count"]

    # 2. Insert a new raw email using the database service directly to trigger cache invalidation
    from database import SessionLocal
    from services.email_service import insert_raw_email
    db = SessionLocal()
    try:
        insert_raw_email(
            db=db,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p5",
            provider_message_id=f"msg-{uuid.uuid4().hex[:8]}",
            thread_id="thread-new",
            sender="sender@p5.com",
            subject="Fresh Email",
            received_at=datetime.datetime.utcnow()
        )
    finally:
        db.close()

    # 3. Query metrics again. Should show the updated count (indicating cache was invalidated)
    resp_new = requests.get(
        f"{BASE_URL}/dashboard/metrics",
        headers={**get_headers(TEST_TENANT, role="viewer"), "X-Refresh-Cache": "true"}
    )
    assert resp_new.status_code == 200
    updated_metrics = resp_new.json()
    assert updated_metrics["email_count"] == initial_count + 1

# ─────────────────────────────────────────────────────────────────────────────
# 4. Export Pipeline tests
# ─────────────────────────────────────────────────────────────────────────────

def test_export_pipeline():
    # Start an export job for EMAIL as JSON
    payload = {
        "target_type": "EMAIL",
        "export_format": "JSON",
        "limit": 10
    }
    resp = requests.post(
        f"{BASE_URL}/exports",
        json=payload,
        headers=get_headers(TEST_TENANT, role="analyst")
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "COMPLETED"
    filename = data["filename"]
    assert filename.startswith("export_email_")
    assert filename.endswith(".json")
    
    # Verify file exists on local storage path
    file_path = data["file_path"]
    assert os.path.exists(file_path)
    with open(file_path, "r", encoding="utf-8") as f:
        json_data = json.load(f)
        assert isinstance(json_data, list)
        assert len(json_data) >= 1

# ─────────────────────────────────────────────────────────────────────────────
# 5. Preferences & Routing tests
# ─────────────────────────────────────────────────────────────────────────────

def test_preferences_routing_and_mute_windows():
    from database import SessionLocal
    from models import NotificationChannel, User, NotificationPreference, Alert
    from neuromail.core.raw_email.notification_service import dispatch_notifications_for_alert

    db = SessionLocal()
    try:
        # Create user record
        user_id = f"{TEST_TENANT}-user-pref-test"
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            user = User(
                id=user_id,
                email="pref@phase5.com",
                name="Pref User",
                tenant_id=TEST_TENANT,
                role="viewer"
            )
            db.add(user)
            db.commit()

        # Set up active notification channel
        ch_id = "chan-slack-p5"
        channel = db.query(NotificationChannel).filter(NotificationChannel.id == ch_id).first()
        if not channel:
            channel = NotificationChannel(
                id=ch_id,
                tenant_id=TEST_TENANT,
                channel_type="SLACK",
                config={"webhook_url": "http://testserver/slack-mock"},
                is_active=True
            )
            db.add(channel)
            db.commit()

        # User updates their preferences: severity_threshold="HIGH", enabled_channels=["SLACK"]
        pref_payload = {
            "severity_threshold": "HIGH",
            "enabled_channels": ["SLACK"],
            "mute_windows": []
        }
        resp = requests.put(
            f"{BASE_URL}/notification_preferences",
            json=pref_payload,
            headers=get_headers(TEST_TENANT, role="viewer", user_id=user_id)
        )
        assert resp.status_code == 200

        # Trigger a MEDIUM alert
        medium_alert = Alert(
            id=str(uuid.uuid4()),
            tenant_id=TEST_TENANT,
            alert_type="DELAY",
            message="Medium severity alert",
            severity="MEDIUM",
            status="UNRESOLVED"
        )
        db.add(medium_alert)
        db.commit()

        # Run dispatch
        dispatch_notifications_for_alert(db, TEST_TENANT, medium_alert)
        
        # Verify no notification log is generated because MEDIUM < user's HIGH threshold
        from models import NotificationLog
        log_count = db.query(NotificationLog).filter(NotificationLog.alert_id == medium_alert.id).count()
        assert log_count == 0

        # Trigger a HIGH alert
        high_alert = Alert(
            id=str(uuid.uuid4()),
            tenant_id=TEST_TENANT,
            alert_type="DELAY",
            message="High severity alert",
            severity="HIGH",
            status="UNRESOLVED"
        )
        db.add(high_alert)
        db.commit()

        # Run dispatch
        dispatch_notifications_for_alert(db, TEST_TENANT, high_alert)
        
        # Verify notification log IS generated (status should be SENT because channel mock URL handles it)
        h_log = db.query(NotificationLog).filter(NotificationLog.alert_id == high_alert.id).first()
        assert h_log is not None
        assert h_log.status == "SENT"

        # Update user pref to include a mute window spanning the current time
        # E.g. start at 00:00, end at 23:59 (covering all times)
        pref_payload_muted = {
            "severity_threshold": "HIGH",
            "enabled_channels": ["SLACK"],
            "mute_windows": [{"start": "00:00", "end": "23:59"}]
        }
        resp_muted = requests.put(
            f"{BASE_URL}/notification_preferences",
            json=pref_payload_muted,
            headers=get_headers(TEST_TENANT, role="viewer", user_id=user_id)
        )
        assert resp_muted.status_code == 200

        # Trigger another HIGH alert
        high_alert_muted = Alert(
            id=str(uuid.uuid4()),
            tenant_id=TEST_TENANT,
            alert_type="DELAY",
            message="High severity alert but muted",
            severity="HIGH",
            status="UNRESOLVED"
        )
        db.add(high_alert_muted)
        db.commit()

        # Run dispatch
        dispatch_notifications_for_alert(db, TEST_TENANT, high_alert_muted)

        # Verify no notification log was created during the mute window
        m_log_count = db.query(NotificationLog).filter(NotificationLog.alert_id == high_alert_muted.id).count()
        assert m_log_count == 0

    finally:
        db.close()

# ─────────────────────────────────────────────────────────────────────────────
# 6. Saved Views tests
# ─────────────────────────────────────────────────────────────────────────────

def test_saved_views():
    # 1. Create saved view
    payload = {
        "name": "Active Delayed Alerts",
        "description": "Show all unresolved delay alerts",
        "target_type": "ALERT",
        "filters": {"status": "UNRESOLVED", "alert_type": "DELAY"},
        "is_default": True
    }
    resp = requests.post(
        f"{BASE_URL}/saved_views",
        json=payload,
        headers=get_headers(TEST_TENANT, role="viewer")
    )
    assert resp.status_code == 201
    view = resp.json()
    assert view["is_default"] == True

    # 2. Retrieve views
    resp_get = requests.get(
        f"{BASE_URL}/saved_views",
        headers=get_headers(TEST_TENANT, role="viewer")
    )
    assert resp_get.status_code == 200
    views = resp_get.json()
    assert len(views) >= 1
    assert any(v["name"] == "Active Delayed Alerts" for v in views)

# ─────────────────────────────────────────────────────────────────────────────
# 7. Redacted Audit Log Compliance Exports
# ─────────────────────────────────────────────────────────────────────────────

def test_redacted_audit_log_export():
    from database import SessionLocal
    from services.audit_service import create_audit_log
    
    db = SessionLocal()
    try:
        # Create an audit log with sensitive authentication fields
        create_audit_log(
            db=db,
            tenant_id=TEST_TENANT,
            action="TOKEN_REFRESH",
            performed_by=f"{TEST_TENANT}-user-admin",
            object_type="USER",
            object_id="user-1",
            changes={
                "access_token": "bearer_secret_12345",
                "client_secret": "my_client_secret_xyz",
                "safe_field": "public_data"
            }
        )
    finally:
        db.close()

    # Query audit logs export (requires Admin role)
    resp = requests.get(
        f"{BASE_URL}/audit_logs/export",
        headers=get_headers(TEST_TENANT, role="admin")
    )
    assert resp.status_code == 200
    csv_text = resp.text
    
    # Verify sensitive token values are redacted/masked in the export output
    assert "bearer_secret_12345" not in csv_text
    assert "my_client_secret_xyz" not in csv_text
    assert "[REDACTED]" in csv_text
    assert "public_data" in csv_text

# ─────────────────────────────────────────────────────────────────────────────
# 8. Subsystem health checks
# ─────────────────────────────────────────────────────────────────────────────

def test_subsystem_health():
    # Query ops health endpoint
    resp = requests.get(
        f"{BASE_URL}/ops/health",
        headers=get_headers(TEST_TENANT, role="admin")
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "subsystems" in data
    assert "ingestion_pipeline" in data["subsystems"]
    assert "queue_depth" in data["subsystems"]["ingestion_pipeline"]

# ─────────────────────────────────────────────────────────────────────────────
# 9. Retry Decorator test
# ─────────────────────────────────────────────────────────────────────────────

def test_retry_decorator():
    from neuromail.core.raw_email.retry import retry

    attempts = 0

    @retry(exceptions=(ValueError,), tries=3, delay=0.1, backoff=1.5)
    def flappy_function():
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise ValueError("Transient error")
        return "success"

    res = flappy_function()
    assert res == "success"
    assert attempts == 3
