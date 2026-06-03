import pytest
import requests
import uuid

BASE_URL = "http://127.0.0.1:8000"
DEMO_TENANT = "demo-tenant"
DEMO_USER = "demo-admin"

def headers(tenant: str = DEMO_TENANT, user_id: str = DEMO_USER):
    return {
        "x-tenant-id": tenant,
        "X-User-ID": user_id,
        "X-User-Role": "admin",
        "Content-Type": "application/json"
    }

def test_demo_health_and_readiness():
    resp = requests.get(f"{BASE_URL}/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    resp = requests.get(f"{BASE_URL}/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"

def test_demo_mailbox_status():
    resp = requests.get(f"{BASE_URL}/mailboxes", headers=headers())
    assert resp.status_code == 200
    mailboxes = resp.json()
    assert len(mailboxes) >= 1
    assert any(mb["id"] == "demo-mailbox-gmail" for mb in mailboxes)
    assert any(mb["connection_status"] == "CONNECTED" for mb in mailboxes)

def test_demo_emails_and_parsing():
    resp = requests.get(f"{BASE_URL}/emails", headers=headers())
    assert resp.status_code == 200
    emails = resp.json()
    assert len(emails) >= 2
    
    # Check if a specific seeded email is there
    subjects = [e["subject"] for e in emails]
    assert "Shipment BOL-44901 Delayed" in subjects

def test_demo_alerts_and_entities():
    resp = requests.get(f"{BASE_URL}/alerts", headers=headers())
    assert resp.status_code == 200
    alerts = resp.json()
    assert len(alerts) >= 1
    assert any("BOL-44901" in a["message"] for a in alerts)

    # Check entities
    resp = requests.get(f"{BASE_URL}/entities", headers=headers())
    assert resp.status_code == 200
    entities = resp.json()
    assert len(entities) >= 1
    assert any("BOL-44901" in ent["identity"] for ent in entities)

def test_demo_dashboard_metrics():
    resp = requests.get(f"{BASE_URL}/dashboard/metrics", headers=headers())
    assert resp.status_code == 200
    metrics = resp.json()
    assert metrics["email_count"] >= 2
    assert metrics["unresolved_alerts_count"] >= 1

def test_demo_search():
    # Search for BOL
    resp = requests.get(f"{BASE_URL}/search?q=BOL-44901", headers=headers())
    assert resp.status_code == 200
    results = resp.json()
    assert len(results["emails"]) >= 1
    assert any("BOL-44901" in e["subject"] for e in results["emails"])

def test_demo_ai_summary():
    # Get summary for the delayed email
    resp = requests.get(f"{BASE_URL}/emails", headers=headers())
    emails = resp.json()
    email_id = next(e["id"] for e in emails if "BOL-44901" in e["subject"])
    
    resp = requests.get(f"{BASE_URL}/emails/{email_id}/summary", headers=headers())
    assert resp.status_code == 200
    summary = resp.json()
    assert "subject" in summary
    assert "urgency_signal" in summary

def test_demo_tenant_isolation_smoke():
    # Try to access demo mailbox from a non-existent tenant
    other_headers = headers(tenant="other-tenant", user_id="other-user")
    resp = requests.get(f"{BASE_URL}/mailboxes", headers=other_headers)
    assert resp.status_code == 404 # Tenant not found
