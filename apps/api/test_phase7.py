import uuid
import datetime
import time
import pytest
import requests
from typing import Dict, Any

from database import SessionLocal
from models import (
    Tenant,
    User,
    Mailbox,
    RawEmail,
    DeadLetterQueue,
    TenantQuota,
    TenantQuotaUsage
)
from neuromail.core.mailboxes.connection_health import (
    record_sync_success,
    record_sync_failure,
    is_circuit_breaker_tripped,
    CircuitBreakerTrippedError
)
from neuromail.core.mailboxes.sync_service import SyncService
from services.dlq_service import add_to_dlq, list_dlq, replay_job
from services.quota_service import (
    get_or_create_quota,
    get_or_create_usage,
    check_email_quota,
    increment_email_count,
    check_token_quota,
    increment_token_usage,
    QuotaExceededError
)
from neuromail.core.llm.client import LLMClient

BASE_URL = "http://127.0.0.1:8000"
TEST_TENANT = "tenant-phase7"
TENANT_B = "tenant-phase7-isolated"

def get_headers(tenant: str, role: str = "operator") -> Dict[str, str]:
    user_id = f"user-b-{role}-p7" if tenant == TENANT_B else f"user-{role}-p7"
    return {
        "x-tenant-id": tenant,
        "X-User-Role": role,
        "X-User-ID": user_id,
        "Content-Type": "application/json"
    }

@pytest.fixture(scope="module", autouse=True)
def setup_test_data():
    """
    Seeds database with test tenants, users, and mailboxes.
    """
    db = SessionLocal()
    try:
        # Clean up existing test data to ensure repeatable test runs
        db.query(RawEmail).filter(RawEmail.tenant_id.in_([TEST_TENANT, TENANT_B])).delete(synchronize_session=False)
        db.query(DeadLetterQueue).filter(DeadLetterQueue.tenant_id.in_([TEST_TENANT, TENANT_B])).delete(synchronize_session=False)
        db.query(TenantQuotaUsage).filter(TenantQuotaUsage.tenant_id.in_([TEST_TENANT, TENANT_B])).delete(synchronize_session=False)
        db.query(TenantQuota).filter(TenantQuota.tenant_id.in_([TEST_TENANT, TENANT_B])).delete(synchronize_session=False)
        db.query(Mailbox).filter(Mailbox.tenant_id.in_([TEST_TENANT, TENANT_B])).delete(synchronize_session=False)
        db.query(User).filter(User.tenant_id.in_([TEST_TENANT, TENANT_B])).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id.in_([TEST_TENANT, TENANT_B])).delete(synchronize_session=False)
        db.commit()

        # Create test tenants
        for tid, name in [(TEST_TENANT, "Phase 7 Resiliency Tenant"), (TENANT_B, "Tenant B Isolated")]:
            exists = db.query(Tenant).filter(Tenant.id == tid).first()
            if not exists:
                t = Tenant(id=tid, name=name)
                db.add(t)
        db.commit()

        # Create users
        for role in ["admin", "operator"]:
            user_id = f"user-{role}-p7"
            exists = db.query(User).filter(User.id == user_id).first()
            if not exists:
                u = User(
                    id=user_id,
                    email=f"{role}@phase7.com",
                    name=f"User {role.capitalize()}",
                    tenant_id=TEST_TENANT,
                    role=role
                )
                db.add(u)
        
        # User for Tenant B
        b_user_id = "user-b-operator-p7"
        b_user = db.query(User).filter(User.id == b_user_id).first()
        if not b_user:
            bu = User(
                id=b_user_id,
                email="operator@tenantb.com",
                name="Tenant B Operator",
                tenant_id=TENANT_B,
                role="operator"
            )
            db.add(bu)
        db.commit()

        # Create mailboxes
        for tid, m_id in [(TEST_TENANT, "mailbox-p7"), (TENANT_B, "mailbox-b-p7")]:
            exists = db.query(Mailbox).filter(Mailbox.id == m_id).first()
            if not exists:
                m = Mailbox(
                    id=m_id,
                    tenant_id=tid,
                    provider_type="GMAIL",
                    connection_status="CONNECTED",
                    health_score=100.0,
                    consecutive_failures=0
                )
                db.add(m)
        db.commit()
    finally:
        db.close()


def test_circuit_breaker_transitions():
    """
    Test transition of circuit breaker: HEALTHY -> ERROR (tripped) -> HALF-OPEN -> HEALTHY.
    """
    db = SessionLocal()
    try:
        mailbox_id = "mailbox-p7"
        
        # Reset health
        record_sync_success(db, TEST_TENANT, mailbox_id)
        mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id).first()
        assert mailbox.health_score == 100.0
        assert mailbox.consecutive_failures == 0
        assert mailbox.circuit_breaker_tripped is False
        assert is_circuit_breaker_tripped(db, TEST_TENANT, mailbox_id) is False

        # Fail 4 times (does not trip yet)
        for i in range(4):
            record_sync_failure(db, TEST_TENANT, mailbox_id, f"Sync fail {i}")
        
        mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id).first()
        assert mailbox.consecutive_failures == 4
        assert mailbox.health_score == 20.0
        assert mailbox.circuit_breaker_tripped is False
        assert is_circuit_breaker_tripped(db, TEST_TENANT, mailbox_id) is False

        # 5th failure trips the breaker
        record_sync_failure(db, TEST_TENANT, mailbox_id, "Fifth fail")
        mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id).first()
        assert mailbox.consecutive_failures == 5
        assert mailbox.health_score == 0.0
        assert mailbox.circuit_breaker_tripped is True
        assert is_circuit_breaker_tripped(db, TEST_TENANT, mailbox_id) is True

        # Test sync_mailbox blocks execution
        sync_service = SyncService(db)
        with pytest.raises(CircuitBreakerTrippedError):
            sync_service.sync_mailbox(TEST_TENANT, mailbox_id)

        # Simulate cooldown elapsed: manually set circuit_breaker_tripped_at to 31s ago
        mailbox.circuit_breaker_tripped_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=35)
        db.commit()

        # Circuit breaker should now allow sync (HALF-OPEN)
        assert is_circuit_breaker_tripped(db, TEST_TENANT, mailbox_id) is False

        # Successful sync resets circuit breaker
        record_sync_success(db, TEST_TENANT, mailbox_id)
        mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id).first()
        assert mailbox.health_score == 100.0
        assert mailbox.consecutive_failures == 0
        assert mailbox.circuit_breaker_tripped is False
        
    finally:
        db.close()


def test_webhook_drift_and_fallback():
    """
    Test that webhook-to-polling fallback triggers when webhook drift exceeds threshold.
    """
    db = SessionLocal()
    try:
        mailbox_id = "mailbox-p7"
        mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id).first()
        mailbox.webhook_subscription_id = "projects/mock/topics/neuromail-pubsub"
        # Simulate last webhook received 45 minutes ago
        mailbox.last_webhook_received_at = datetime.datetime.utcnow() - datetime.timedelta(minutes=45)
        mailbox.last_sync_time = datetime.datetime.utcnow() - datetime.timedelta(minutes=45)
        mailbox.health_score = 100.0
        db.commit()

        # Run drift check with 30-minute threshold using a mock for sync_mailbox
        from unittest.mock import patch
        with patch.object(SyncService, 'sync_mailbox', return_value={"status": "success", "synced_count": 0}) as mock_sync:
            sync_service = SyncService(db)
            drifted = sync_service.check_webhook_drift_and_fallback(minutes_threshold=30)
            mock_sync.assert_called_once_with(TEST_TENANT, mailbox_id)
        
        # Should detect drift and run polling sync (mocked)
        assert drifted == 1
        
        # Verify health score decreased slightly
        db.refresh(mailbox)
        assert mailbox.health_score < 100.0
        assert mailbox.error_state == "Webhook drift detected. Fallback polling triggered."
    finally:
        db.close()


def test_dlq_replay_lifecycle():
    """
    Test job moving to Dead Letter Queue (DLQ) and replaying it idempotently.
    """
    db = SessionLocal()
    try:
        # 1. Add item to DLQ
        payload = {"raw_email_id": "email-dlq-test-1"}
        dlq_item = add_to_dlq(
            db=db,
            tenant_id=TEST_TENANT,
            job_type="PROCESS_EMAIL",
            payload=payload,
            error_message="Missing parser template",
            retry_count=3
        )
        assert dlq_item.status == "FAILED"
        assert dlq_item.retry_count == 3

        # Create raw email to process for replay
        raw_email = RawEmail(
            id="email-dlq-test-1",
            tenant_id=TEST_TENANT,
            mailbox_id="mailbox-p7",
            provider_message_id="msg-dlq-1",
            thread_id="thread-dlq-1",
            sender="test@dlq.com",
            received_at=datetime.datetime.utcnow(),
            body="Replay this email payload for shipment BOL-99011."
        )
        db.add(raw_email)
        db.commit()

        # 2. Query via API GET /dlq
        headers = get_headers(TEST_TENANT)
        res = requests.get(f"{BASE_URL}/dlq", headers=headers)
        assert res.status_code == 200
        dlq_list = res.json()
        assert len(dlq_list) > 0
        assert any(item["id"] == dlq_item.id for item in dlq_list)

        # Ensure isolation (Tenant B cannot see this DLQ item)
        res_b = requests.get(f"{BASE_URL}/dlq", headers=get_headers(TENANT_B))
        assert res_b.status_code == 200
        dlq_list_b = res_b.json()
        assert not any(item["id"] == dlq_item.id for item in dlq_list_b)

        # 3. Trigger replay via API
        res_replay = requests.post(f"{BASE_URL}/dlq/{dlq_item.id}/replay", headers=headers)
        assert res_replay.status_code == 200
        
        # Verify status updated to REPLAYED
        db.refresh(dlq_item)
        assert dlq_item.status == "REPLAYED"
        
    finally:
        db.close()


def test_tenant_ingestion_quota():
    """
    Test daily email ingestion quotas and tenant isolation.
    """
    db = SessionLocal()
    try:
        # Create small quota for TEST_TENANT
        quota = get_or_create_quota(db, TEST_TENANT)
        quota.max_emails_per_day = 2
        
        # Reset daily usage for TEST_TENANT
        usage = get_or_create_usage(db, TEST_TENANT, datetime.date.today())
        usage.emails_ingested = 0
        
        # Create quota for TENANT_B (isolated)
        quota_b = get_or_create_quota(db, TENANT_B)
        quota_b.max_emails_per_day = 5
        usage_b = get_or_create_usage(db, TENANT_B, datetime.date.today())
        usage_b.emails_ingested = 0
        
        db.commit()

        # API check: Ingest Email 1 for TEST_TENANT (allowed)
        headers = get_headers(TEST_TENANT)
        payload = {
            "mailbox_id": "mailbox-p7",
            "provider_message_id": f"msg-q-{uuid.uuid4().hex[:6]}",
            "thread_id": "thread-q-1",
            "sender": "sender@quota.com",
            "subject": "Email 1",
            "body": "Allowed email body",
            "received_at": datetime.datetime.utcnow().isoformat()
        }
        res = requests.post(f"{BASE_URL}/emails", json=payload, headers=headers)
        assert res.status_code == 201

        # Ingest Email 2 for TEST_TENANT (allowed)
        payload["provider_message_id"] = f"msg-q-{uuid.uuid4().hex[:6]}"
        res = requests.post(f"{BASE_URL}/emails", json=payload, headers=headers)
        assert res.status_code == 201

        # Ingest Email 3 for TEST_TENANT (BLOCKED - Quota Exceeded)
        payload["provider_message_id"] = f"msg-q-{uuid.uuid4().hex[:6]}"
        res = requests.post(f"{BASE_URL}/emails", json=payload, headers=headers)
        assert res.status_code == 429
        assert "quota exceeded" in res.json()["detail"].lower()

        # Verify TENANT_B ingestion is unaffected (isolation check)
        payload_b = {
            "mailbox_id": "mailbox-b-p7",
            "provider_message_id": f"msg-qb-{uuid.uuid4().hex[:6]}",
            "thread_id": "thread-qb-1",
            "sender": "sender@quota.com",
            "subject": "Email B",
            "body": "Allowed email body",
            "received_at": datetime.datetime.utcnow().isoformat()
        }
        res_b = requests.post(f"{BASE_URL}/emails", json=payload_b, headers=get_headers(TENANT_B))
        assert res_b.status_code == 201

    finally:
        db.close()


def test_tenant_llm_tokens_quota():
    """
    Test daily LLM token quotas and fallback.
    """
    db = SessionLocal()
    try:
        # Create small token quota for TEST_TENANT
        quota = get_or_create_quota(db, TEST_TENANT)
        quota.max_llm_tokens_per_day = 100
        
        # Reset daily token usage
        usage = get_or_create_usage(db, TEST_TENANT, datetime.date.today())
        usage.llm_tokens_used = 0
        
        # Seed mock LLM config for TEST_TENANT
        from models import TenantLLMConfig
        llm_config = db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == TEST_TENANT).first()
        if not llm_config:
            llm_config = TenantLLMConfig(
                id=str(uuid.uuid4()),
                tenant_id=TEST_TENANT,
                provider="mock",
                model_name="mock-model",
                encrypted_api_key=None,
                temperature=0.0,
                max_tokens=1000,
                auto_routing_enabled=False
            )
            db.add(llm_config)
        else:
            llm_config.provider = "mock"
        db.commit()

        client = LLMClient(db)
        
        # Call LLM client once (allowed because usage is 0 < 100)
        res = client.generate(
            tenant_id=TEST_TENANT,
            system_instruction="You are a helpful assistant",
            prompt="Hello World",
            feature_name="test_feature"
        )
        assert res is not None

        # Increase daily token usage manually to exceed quota
        usage.llm_tokens_used = 150
        db.commit()

        # Subsequent LLM call should be BLOCKED
        with pytest.raises(QuotaExceededError):
            client.generate(
                tenant_id=TEST_TENANT,
                system_instruction="You are a helpful assistant",
                prompt="Hello World again",
                feature_name="test_feature"
            )
            
    finally:
        db.close()
