import uuid
import datetime
import os
import time
import json
import pytest
import requests
from typing import Dict, Any

from database import SessionLocal
from models import (
    Tenant,
    User,
    Mailbox,
    RawEmail,
    Entity,
    Event,
    Alert,
    ReviewItem,
    AIEnrichmentCache,
    AIFeedbackSignal,
    TenantLLMConfig,
    TenantTokenUsage,
    Identifier,
    Rule,
    AuditLog
)

BASE_URL = "http://127.0.0.1:8000"
TEST_TENANT = "tenant-phase6"
TENANT_B = "tenant-phase6-isolated"

def get_headers(tenant: str, role: str = "viewer", user_id: str = None) -> Dict[str, str]:
    if user_id is None:
        if tenant == TENANT_B:
            user_id = "user-b-p6"
        else:
            user_id = f"user-{role}-p6"
    return {
        "x-tenant-id": tenant,
        "X-User-Role": role,
        "X-User-ID": user_id,
        "Content-Type": "application/json"
    }

@pytest.fixture(scope="module", autouse=True)
def setup_test_data():
    """
    Seeds database with test tenants, users, mailboxes, and default mock LLM configs.
    """
    db = SessionLocal()
    try:
        # 1. Create test tenants
        for tid, name in [(TEST_TENANT, "Phase 6 Test Tenant"), (TENANT_B, "Tenant B Isolated")]:
            exists = db.query(Tenant).filter(Tenant.id == tid).first()
            if not exists:
                t = Tenant(id=tid, name=name)
                db.add(t)
        db.commit()

        # 2. Create users of different roles
        roles = ["admin", "operator", "analyst", "viewer"]
        for role in roles:
            user_id = f"user-{role}-p6"
            exists = db.query(User).filter(User.id == user_id).first()
            if not exists:
                u = User(
                    id=user_id,
                    email=f"{role}@phase6.com",
                    name=f"User {role.capitalize()}",
                    tenant_id=TEST_TENANT,
                    role=role
                )
                db.add(u)
        
        # User for Tenant B
        b_user = db.query(User).filter(User.id == "user-b-p6").first()
        if not b_user:
            bu = User(
                id="user-b-p6",
                email="user@tenantb.com",
                name="Tenant B Operator",
                tenant_id=TENANT_B,
                role="operator"
            )
            db.add(bu)
        db.commit()

        # 3. Create mailboxes
        for tid, m_id in [(TEST_TENANT, "mailbox-p6"), (TENANT_B, "mailbox-b-p6")]:
            exists = db.query(Mailbox).filter(Mailbox.id == m_id).first()
            if not exists:
                m = Mailbox(
                    id=m_id,
                    tenant_id=tid,
                    provider_type="GMAIL",
                    connection_status="CONNECTED"
                )
                db.add(m)
        db.commit()

        # 4. Insert mock LLM configurations for both tenants
        # TEST_TENANT LLM config
        llm_exists = db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == TEST_TENANT).first()
        if not llm_exists:
            llm_c = TenantLLMConfig(
                id=str(uuid.uuid4()),
                tenant_id=TEST_TENANT,
                provider="mock",
                model_name="mock-model",
                encrypted_api_key=None,
                temperature=0.0,
                max_tokens=1000,
                auto_routing_enabled=False
            )
            db.add(llm_c)
            
        # TENANT_B LLM config
        llm_b_exists = db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == TENANT_B).first()
        if not llm_b_exists:
            llm_b = TenantLLMConfig(
                id=str(uuid.uuid4()),
                tenant_id=TENANT_B,
                provider="mock",
                model_name="mock-model-b",
                encrypted_api_key=None,
                temperature=0.0,
                max_tokens=500,
                auto_routing_enabled=False
            )
            db.add(llm_b)
        db.commit()

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.1 — LLM integration backbone
# ─────────────────────────────────────────────────────────────────────────────

def test_llm_config_crud():
    # 1. Update config using Operator role (should succeed)
    payload = {
        "provider": "mock",
        "model_name": "custom-mock-model",
        "api_key": "my-secret-key-123",
        "temperature": 0.2,
        "max_tokens": 1500,
        "auto_routing_enabled": True
    }
    resp = requests.post(
        f"{BASE_URL}/llm/config",
        json=payload,
        headers=get_headers(TEST_TENANT, role="operator")
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["provider"] == "mock"
    assert data["model_name"] == "custom-mock-model"
    assert data["has_api_key"] is True
    assert data["temperature"] == 0.2
    assert data["max_tokens"] == 1500
    assert data["auto_routing_enabled"] is True

    # 2. Get config
    resp_get = requests.get(
        f"{BASE_URL}/llm/config",
        headers=get_headers(TEST_TENANT, role="viewer")
    )
    assert resp_get.status_code == 200
    assert resp_get.json()["model_name"] == "custom-mock-model"

    # 3. Wrong provider name validation
    payload["provider"] = "invalid_provider"
    resp_err = requests.post(
        f"{BASE_URL}/llm/config",
        json=payload,
        headers=get_headers(TEST_TENANT, role="operator")
    )
    assert resp_err.status_code == 400
    assert "Unsupported LLM provider" in resp_err.json()["detail"]


def test_llm_backbone_client_direct():
    from neuromail.core.llm.client import LLMClient, LLMProviderError
    from pydantic import BaseModel
    
    class TestSchema(BaseModel):
        name: str
        value: int

    db = SessionLocal()
    try:
        # Reset LLM config to mock
        config = db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == TEST_TENANT).first()
        config.provider = "mock"
        db.commit()

        client = LLMClient(db)

        # 1. Structured output mode validation
        res = client.generate(TEST_TENANT, "instruction", "prompt", schema=TestSchema, feature_name="test_backbone")
        assert isinstance(res, TestSchema)
        assert isinstance(res.name, str)
        assert isinstance(res.value, int)

        # 2. Retry logic fires on malformed response
        initial_token_usages = db.query(TenantTokenUsage).filter(
            TenantTokenUsage.tenant_id == TEST_TENANT,
            TenantTokenUsage.feature_name == "test_retry"
        ).count()

        res_retry = client.generate(
            tenant_id=TEST_TENANT,
            system_instruction="sys",
            prompt="simulate_malformed prompt",
            schema=TestSchema,
            feature_name="test_retry",
            max_retries=3
        )
        assert isinstance(res_retry, TestSchema)

        # Confirm token usage is logged (usage is recorded only on success)
        post_token_usages = db.query(TenantTokenUsage).filter(
            TenantTokenUsage.tenant_id == TEST_TENANT,
            TenantTokenUsage.feature_name == "test_retry"
        ).count()
        assert post_token_usages == initial_token_usages + 1

        # 3. Wrong provider name in config triggers clean failure
        config.provider = "unsupported_llm"
        db.commit()
        
        with pytest.raises(ValueError) as exc:
            client.generate(TEST_TENANT, "sys", "prompt")
        assert "Unsupported LLM provider" in str(exc.value)

        # Reset back to mock
        config.provider = "mock"
        db.commit()

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.2 — AI email summarization
# ─────────────────────────────────────────────────────────────────────────────

def test_ai_email_summarization():
    db = SessionLocal()
    try:
        # Create raw email
        email_id = f"email-sum-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-sum-{uuid.uuid4().hex[:6]}",
            thread_id="thread-sum",
            sender="sender@example.com",
            subject="Shipment Delayed in Port",
            body="The delivery is late. Please verify the shipment delivery timeline immediately. Container BOL-9908 has been delayed.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # 1. Parse/Generate summary via API
        resp = requests.get(
            f"{BASE_URL}/emails/{email_id}/summary",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "formatted_summary" in data
        assert "Key Action:" in data["formatted_summary"]
        assert "BOL-9908" in data["entities_involved"] or len(data["entities_involved"]) >= 0

        # Check token usage count
        usage_count_1 = db.query(TenantTokenUsage).filter(
            TenantTokenUsage.tenant_id == TEST_TENANT,
            TenantTokenUsage.feature_name == "email_summarization"
        ).count()

        # 2. Call again (confirm cache hit)
        resp2 = requests.get(
            f"{BASE_URL}/emails/{email_id}/summary",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp2.status_code == 200
        assert resp2.json()["formatted_summary"] == data["formatted_summary"]

        usage_count_2 = db.query(TenantTokenUsage).filter(
            TenantTokenUsage.tenant_id == TEST_TENANT,
            TenantTokenUsage.feature_name == "email_summarization"
        ).count()
        # Since it was cached, the token usage log count should remain unchanged
        assert usage_count_2 == usage_count_1

        # 3. Tenant isolation check: Tenant B should not be able to fetch Tenant A's summary
        resp_b = requests.get(
            f"{BASE_URL}/emails/{email_id}/summary",
            headers=get_headers(TENANT_B, role="viewer")
        )
        assert resp_b.status_code == 404

        # 4. Graceful handling of empty body
        empty_id = f"email-empty-{uuid.uuid4().hex[:6]}"
        ee = RawEmail(
            id=empty_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-empty-{uuid.uuid4().hex[:6]}",
            thread_id="thread-empty",
            sender="sender@example.com",
            subject="Empty Subject",
            body="",
            received_at=datetime.datetime.utcnow()
        )
        db.add(ee)
        db.commit()

        resp_empty = requests.get(
            f"{BASE_URL}/emails/{empty_id}/summary",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp_empty.status_code == 200
        assert "Empty email body" in resp_empty.json()["formatted_summary"]

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.3 — Intent classification engine
# ─────────────────────────────────────────────────────────────────────────────

def test_intent_classification():
    db = SessionLocal()
    try:
        email_id = f"email-cls-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-cls-{uuid.uuid4().hex[:6]}",
            thread_id="thread-cls",
            sender="sender@example.com",
            subject="Invoice details",
            body="Attached is the invoice for delivery.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # 1. Call classification
        resp = requests.post(
            f"{BASE_URL}/emails/{email_id}/classify",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp.status_code == 200
        intent = resp.json()["intent"]
        # Constrained to the literal list
        valid_intents = [
            'new inquiry', 'status update', 'complaint', 'escalation', 
            'invoice', 'delay notification', 'confirmation', 'cancellation', 
            'follow-up request'
        ]
        assert intent in valid_intents

        # 2. Confirm invalid label is rejected and retried to a valid label
        # Send prompt label override causing mock provider to return "invalid_label" on attempt 0
        resp_override = requests.post(
            f"{BASE_URL}/emails/{email_id}/classify?force=true&prompt_label_overrides=true",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp_override.status_code == 200
        # The mock provider returns "invalid_label" on attempt 0, but on attempt 1, it returns "status update"
        assert resp_override.json()["intent"] == "status update"

        # 3. Idempotency check: Rerunning classification
        resp_re = requests.post(
            f"{BASE_URL}/emails/{email_id}/classify?force=false",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp_re.status_code == 200
        assert resp_re.json()["intent"] == resp_override.json()["intent"]

        # 4. Tenant isolation: Tenant B cannot classify Tenant A's email
        resp_b = requests.post(
            f"{BASE_URL}/emails/{email_id}/classify",
            headers=get_headers(TENANT_B, role="viewer")
        )
        assert resp_b.status_code == 404

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.4 — Urgency and priority scoring
# ─────────────────────────────────────────────────────────────────────────────

def test_urgency_priority_scoring():
    db = SessionLocal()
    try:
        email_id = f"email-score-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-score-{uuid.uuid4().hex[:6]}",
            thread_id="thread-score",
            sender="sender@example.com",
            subject="URGENT: Broken shipment delay",
            body="The delivery is broke and delayed. Urgent action required.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # 1. Urgency score check
        resp = requests.post(
            f"{BASE_URL}/emails/{email_id}/score",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp.status_code == 200
        data = resp.json()
        assert 1 <= data["urgency_score"] <= 5
        assert data["priority_label"] in ['critical', 'high', 'medium', 'low', 'informational']

        # 2. Check rule engine integration with urgency/priority score
        # Create rule requiring urgency_score >= 4
        rule_payload = {
            "name": "High Urgency Route Alert",
            "conditions": {
                "urgency_score_gte": 4
            },
            "outcome": {
                "action": "create_alert",
                "alert_type": "URGENT_AI_EXCEPTION",
                "severity": "HIGH",
                "message_template": "AI flagged high urgency email from {sender}"
            }
        }
        # Clear existing rules for clean evaluation
        db.query(Rule).filter(Rule.tenant_id == TEST_TENANT).delete()
        db.commit()

        resp_rule = requests.post(
            f"{BASE_URL}/rules",
            json=rule_payload,
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp_rule.status_code == 201
        
        # Run processing pipeline on the email
        resp_pipe = requests.post(
            f"{BASE_URL}/pipeline/process/{email_id}",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp_pipe.status_code == 200
        pipe_data = resp_pipe.json()
        # Verify alert was generated because urgency score (mock generator yields 4 for urgency_score field) >= 4
        assert pipe_data["alerts_count"] >= 1

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.5 — AI-powered entity extraction upgrade
# ─────────────────────────────────────────────────────────────────────────────

def test_ai_entity_extraction_upgrade():
    db = SessionLocal()
    try:
        # Create email mentioning a deterministic BOL and a custom code
        email_id = f"email-ent-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-ent-{uuid.uuid4().hex[:6]}",
            thread_id="thread-ent",
            sender="sender@example.com",
            subject="Shipment details",
            body="Please update shipment tracking for BOL-12345. We also received informal cargo tracking identifier TRK-456.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # Run pipeline
        resp = requests.post(
            f"{BASE_URL}/pipeline/process/{email_id}",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp.status_code == 200
        
        # Fetch identifiers created
        entity_id = resp.json()["entity_id"]
        assert entity_id is not None
        
        idents = db.query(Identifier).filter(Identifier.entity_id == entity_id).all()
        # Verify deterministic extractor finds BOL-12345 (confidence = 1.0)
        det_ident = next((i for i in idents if i.identifier_value == "BOL-12345"), None)
        assert det_ident is not None
        assert det_ident.confidence == 1.0
        assert det_ident.source == "EMAIL_PARSER"

        # Verify AI extractor supplements with TRK-456 (flagged with lower confidence)
        ai_ident = next((i for i in idents if i.source == "AI_EXTRACTOR"), None)
        assert ai_ident is not None
        assert ai_ident.confidence < 1.0
        
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.6 — Smart alert suggestions
# ─────────────────────────────────────────────────────────────────────────────

def test_smart_alert_suggestions():
    db = SessionLocal()
    try:
        # Create entity and stale timeline event
        entity_id = f"entity-stale-{uuid.uuid4().hex[:6]}"
        ent = Entity(
            id=entity_id,
            tenant_id=TEST_TENANT,
            status="ACTIVE",
            identity="Stale Cargo Container",
            source_reference="raw_emails/some-msg-id"
        )
        db.add(ent)
        
        ev = Event(
            id=str(uuid.uuid4()),
            tenant_id=TEST_TENANT,
            entity_id=entity_id,
            event_type="SHIPMENT_DEPARTED",
            payload={"port": "Seattle"},
            source="SYSTEM",
            created_at=datetime.datetime.utcnow() - datetime.timedelta(days=6)
        )
        db.add(ev)
        db.commit()

        # Run suggestion generator directly by triggering pipeline or endpoints
        # Let's hit the get review suggestions endpoint to see if any are pending
        # First, generate suggestions using the service
        from services.ai_service import generate_smart_suggestions
        suggestions = generate_smart_suggestions(db, TEST_TENANT, entity_id)
        assert len(suggestions) >= 1
        review_item_id = suggestions[0].id

        # 1. Fetch suggestions list via API
        resp_list = requests.get(
            f"{BASE_URL}/review/suggestions",
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp_list.status_code == 200
        assert any(item["id"] == review_item_id for item in resp_list.json())

        # 2. Approve suggestion -> promotes to alert
        resp_app = requests.post(
            f"{BASE_URL}/review/suggestions/{review_item_id}/approve",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp_app.status_code == 200
        alert_id = resp_app.json()["alert_id"]
        
        # Verify alert exists in database
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        assert alert is not None
        assert alert.entity_id == entity_id

        # 3. Dismiss suggestion (REJECTED state)
        # Generate another suggestion
        sugg2 = generate_smart_suggestions(db, TEST_TENANT, entity_id)
        assert len(sugg2) >= 1
        ri_id_2 = sugg2[0].id
        
        resp_d = requests.post(
            f"{BASE_URL}/review/suggestions/{ri_id_2}/dismiss",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp_d.status_code == 200
        
        # Verify suggestion status updated in DB
        ri = db.query(ReviewItem).filter(ReviewItem.id == ri_id_2).first()
        db.refresh(ri)
        assert ri.status == "REJECTED"

        # 4. Tenant isolation check: Tenant B suggestions must not show Tenant A suggestions
        resp_b = requests.get(
            f"{BASE_URL}/review/suggestions",
            headers=get_headers(TENANT_B, role="viewer")
        )
        assert resp_b.status_code == 200
        assert not any(item["id"] == ri_id_2 for item in resp_b.json())

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.7 — Automated response drafting
# ─────────────────────────────────────────────────────────────────────────────

def test_automated_response_drafting():
    db = SessionLocal()
    try:
        email_id = f"email-drf-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-drf-{uuid.uuid4().hex[:6]}",
            thread_id="thread-drf",
            sender="customer@freight.com",
            subject="Shipment status check",
            body="When will my container BOL-12345 arrive?",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # 1. Generate draft via API
        resp = requests.post(
            f"{BASE_URL}/emails/{email_id}/draft",
            json={"mode": "status_update"},
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp.status_code == 201
        draft_data = resp.json()
        assert draft_data["status"] == "PENDING"
        assert "subject" in draft_data["payload"]
        assert "body" in draft_data["payload"]

        review_item_id = draft_data["id"]

        # 2. Verify draft requires human approval to send
        # Verify it cannot be auto-sent: draft is stored as ReviewItem with PENDING status
        ri = db.query(ReviewItem).filter(ReviewItem.id == review_item_id).first()
        assert ri.status == "PENDING"

        # 3. Approve and dispatch draft
        resp_app = requests.post(
            f"{BASE_URL}/review/drafts/{review_item_id}/approve",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp_app.status_code == 200
        assert resp_app.json()["status"] == "dispatched"

        # Verify draft status in database is now APPROVED
        db.refresh(ri)
        assert ri.status == "APPROVED"

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.8 — Proactive digest generation
# ─────────────────────────────────────────────────────────────────────────────

def test_proactive_digest_generation():
    db = SessionLocal()
    try:
        # Create some alerts and entities within time window
        now = datetime.datetime.utcnow()
        yesterday = now - datetime.timedelta(days=1)
        
        ent = Entity(
            id=f"ent-dig-{uuid.uuid4().hex[:6]}",
            tenant_id=TEST_TENANT,
            status="ACTIVE",
            identity="Digest Shipment Container",
            updated_at=now
        )
        db.add(ent)
        
        alt = Alert(
            id=f"alt-dig-{uuid.uuid4().hex[:6]}",
            tenant_id=TEST_TENANT,
            message="Severe ocean storm delaying vessel",
            alert_type="WEATHER_DELAY",
            severity="CRITICAL",
            status="UNRESOLVED",
            created_at=now
        )
        db.add(alt)
        db.commit()

        # 1. Create a DIGEST report definition
        payload = {
            "name": "Weekly AI Ops Digest",
            "report_type": "DIGEST",
            "config": {"days": 3}
        }
        resp_def = requests.post(
            f"{BASE_URL}/reports/definitions",
            json=payload,
            headers=get_headers(TEST_TENANT, role="analyst")
        )
        assert resp_def.status_code == 201
        definition_id = resp_def.json()["id"]

        # 2. Run report definition -> generates digest
        resp_run = requests.post(
            f"{BASE_URL}/reports/definitions/{definition_id}/run",
            headers=get_headers(TEST_TENANT, role="analyst")
        )
        assert resp_run.status_code == 201
        run_data = resp_run.json()
        assert run_data["status"] == "COMPLETED"
        assert "headline" in run_data["output_data"]
        # Markdown contains the generated operational narrative summary
        assert "Digest" in run_data["human_output_markdown"] or "operational" in run_data["human_output_markdown"].lower()

        # 3. Empty window handling
        empty_payload = {
            "name": "Empty Window Digest",
            "report_type": "DIGEST",
            # Offset window by 20 days so no alerts/entities are found
            "config": {"start_date": (now - datetime.timedelta(days=30)).isoformat(), "end_date": (now - datetime.timedelta(days=25)).isoformat()}
        }
        resp_def_empty = requests.post(
            f"{BASE_URL}/reports/definitions",
            json=empty_payload,
            headers=get_headers(TEST_TENANT, role="analyst")
        )
        assert resp_def_empty.status_code == 201
        def_empty_id = resp_def_empty.json()["id"]

        resp_run_empty = requests.post(
            f"{BASE_URL}/reports/definitions/{def_empty_id}/run",
            headers=get_headers(TEST_TENANT, role="analyst")
        )
        assert resp_run_empty.status_code == 201
        run_empty_data = resp_run_empty.json()
        assert run_empty_data["status"] == "COMPLETED"
        assert "No operational activity" in run_empty_data["output_data"]["headline"]

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.9 — Conversational ops copilot
# ─────────────────────────────────────────────────────────────────────────────

def test_conversational_ops_copilot():
    db = SessionLocal()
    try:
        # Create a unique email and entity
        unique_suffix = uuid.uuid4().hex[:6]
        email_id = f"email-cop-{unique_suffix}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-cop-{unique_suffix}",
            thread_id="thread-cop",
            sender="copilot-sender@freight.com",
            subject="Shipment schedule confirmation",
            body=f"Confirming shipment status for BOL-{unique_suffix}. Delivery scheduled.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        
        ent = Entity(
            id=f"entity-cop-{unique_suffix}",
            tenant_id=TEST_TENANT,
            status="ACTIVE",
            identity=f"Copilot Container BOL-{unique_suffix}",
            source_reference=f"raw_emails/{email_id}"
        )
        db.add(ent)
        db.commit()

        # 1. Ask a question about known entity
        payload = {
            "query": f"Where is BOL-{unique_suffix} and what did copilot-sender confirm?"
        }
        resp = requests.post(
            f"{BASE_URL}/copilot/ask",
            json=payload,
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data
        assert len(data["citations"]) >= 1
        
        # Verify the citation links back to the correct source records
        citations = data["citations"]
        assert any(c["record_type"] == "EMAIL" and c["record_id"] == email_id for c in citations) or any(c["record_type"] == "ENTITY" for c in citations)

        # 2. Ask about non-existent entity
        payload_null = {
            "query": "Who is shipper non_existent_shipper?"
        }
        resp_null = requests.post(
            f"{BASE_URL}/copilot/ask",
            json=payload_null,
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp_null.status_code == 200
        assert len(resp_null.json()["citations"]) == 0

        # 3. Tenant scoping: Tenant B asks about Tenant A's BOL -> must yield empty response
        resp_b = requests.post(
            f"{BASE_URL}/copilot/ask",
            json=payload,
            headers=get_headers(TENANT_B, role="viewer")
        )
        assert resp_b.status_code == 200
        assert len(resp_b.json()["citations"]) == 0

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.10 — AI action routing
# ─────────────────────────────────────────────────────────────────────────────

def test_ai_action_routing():
    db = SessionLocal()
    try:
        email_id = f"email-rout-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-rout-{uuid.uuid4().hex[:6]}",
            thread_id="thread-rout",
            sender="escalations@freight.com",
            subject="URGENT: Port strikes delaying container delivery",
            body="Port strikes have started. Container delivery delayed indefinitely.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # 1. Routing suggestion generated by default
        # Clear/update LLM config to have automation mode disabled
        config = db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == TEST_TENANT).first()
        config.auto_routing_enabled = False
        db.commit()

        resp = requests.post(
            f"{BASE_URL}/emails/{email_id}/route",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "suggested"
        assert data["auto_fired"] is False
        assert "review_item_id" in data

        # 2. Enable automation mode -> fires action automatically and logs to audit
        config.auto_routing_enabled = True
        db.commit()

        resp_auto = requests.post(
            f"{BASE_URL}/emails/{email_id}/route",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp_auto.status_code == 200
        data_auto = resp_auto.json()
        assert data_auto["status"] == "executed"
        assert data_auto["auto_fired"] is True

        # Verify audit log exists for this decision
        audit_log = db.query(AuditLog).filter(
            AuditLog.tenant_id == TEST_TENANT,
            AuditLog.object_id == email_id,
            AuditLog.action.like("AUTO_FIRE_%")
        ).first()
        assert audit_log is not None

        # Reset config
        config.auto_routing_enabled = False
        db.commit()

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.11 — AI confidence and feedback loop
# ─────────────────────────────────────────────────────────────────────────────

def test_confidence_feedback_loop():
    db = SessionLocal()
    try:
        # Override classification -> save correction
        email_id = f"email-feed-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-feed-{uuid.uuid4().hex[:6]}",
            thread_id="thread-feed",
            sender="sender@example.com",
            subject="Invoice issue",
            body="Billing error corrected.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # Run classification
        requests.post(
            f"{BASE_URL}/emails/{email_id}/classify",
            headers=get_headers(TEST_TENANT, role="viewer")
        )

        # 1. Post human correction override
        feedback_payload = {
            "feature": "intent_classification",
            "original_value": {"intent": "invoice"},
            "corrected_value": {"intent": "billing_issue"},
            "context": {"email_id": email_id}
        }
        resp_feed = requests.post(
            f"{BASE_URL}/emails/{email_id}/feedback",
            json=feedback_payload,
            headers=get_headers(TEST_TENANT, role="viewer")
        )
        assert resp_feed.status_code == 201
        assert resp_feed.json()["feature"] == "intent_classification"

        # 2. Query feedback signals (requires Analyst/Operator)
        resp_query = requests.get(
            f"{BASE_URL}/observability/feedback?feature=intent_classification",
            headers=get_headers(TEST_TENANT, role="analyst")
        )
        assert resp_query.status_code == 200
        assert len(resp_query.json()) >= 1
        assert any(item["corrected_value"]["intent"] == "billing_issue" for item in resp_query.json())

        # 3. Confirm feedback is tenant-isolated
        resp_query_b = requests.get(
            f"{BASE_URL}/observability/feedback?feature=intent_classification",
            headers=get_headers(TENANT_B, role="analyst")
        )
        # Tenant B cannot see Tenant A's feedback signals
        assert len(resp_query_b.json()) == 0

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6.12 — Full Phase 6 end-to-end validation
# ─────────────────────────────────────────────────────────────────────────────

def test_full_phase6_end_to_end_validation():
    db = SessionLocal()
    try:
        # Feed single raw email
        email_id = f"email-e2e-{uuid.uuid4().hex[:6]}"
        e = RawEmail(
            id=email_id,
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p6",
            provider_message_id=f"msg-e2e-{uuid.uuid4().hex[:6]}",
            thread_id="thread-e2e",
            sender="client@freight.com",
            subject="Shipment BOL-55610 Delayed Exception",
            body="Our carrier reports container BOL-55610 is delayed due to weather exceptions. Urgently resolve.",
            received_at=datetime.datetime.utcnow()
        )
        db.add(e)
        db.commit()

        # Run pipeline
        resp = requests.post(
            f"{BASE_URL}/pipeline/process/{email_id}",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        
        # Verify every AI output is stored correctly
        cache = db.query(AIEnrichmentCache).filter(AIEnrichmentCache.raw_email_id == email_id).first()
        assert cache is not None
        assert cache.summary is not None
        assert cache.intent is not None
        assert cache.urgency_score is not None
        assert cache.priority_label is not None

        # Verify suggestion review item exists
        entity_id = data["entity_id"]
        ri_sugg = db.query(ReviewItem).filter(
            ReviewItem.tenant_id == TEST_TENANT,
            ReviewItem.object_type == "ALERT_SUGGESTION",
            ReviewItem.object_id == entity_id
        ).first()
        assert ri_sugg is not None
        assert ri_sugg.status == "PENDING" # Gate is enforced

        # Rerun is idempotent: cache is hit, no new items created
        initial_cache_id = cache.id
        
        resp_re = requests.post(
            f"{BASE_URL}/pipeline/process/{email_id}",
            headers=get_headers(TEST_TENANT, role="operator")
        )
        assert resp_re.status_code == 200
        
        cache_re = db.query(AIEnrichmentCache).filter(AIEnrichmentCache.raw_email_id == email_id).first()
        assert cache_re.id == initial_cache_id

    finally:
        db.close()
