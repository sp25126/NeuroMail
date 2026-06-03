import pytest
import uuid
import datetime
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import (
    Tenant, User, FreightShipment, FreightAlert, 
    TrackflowCopilotConversation, TrackflowCopilotMessage, TrackflowCopilotAction,
    FreightApproval, FreightTenantConfig
)
from neuromail.core.services.trackflow_copilot import TrackflowCopilotService

@pytest.fixture(scope="function")
def test_context():
    from models import Base
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    tenant_id = f"test-copilot-{uuid.uuid4().hex[:4]}"
    tenant = Tenant(id=tenant_id, name=f"Tenant {tenant_id}")
    db.add(tenant)
    
    user_id = f"user-{tenant_id}"
    user = User(id=user_id, email=f"admin@{tenant_id}.com", tenant_id=tenant_id)
    db.add(user)
    
    config = FreightTenantConfig(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        ai_extraction_enabled=True
    )
    db.add(config)
    db.commit()
    
    yield db, tenant_id, user_id
    
    db.close()

def test_deterministic_intent_attention(test_context):
    db, tenant_id, user_id = test_context
    service = TrackflowCopilotService(db)
    
    response = service.handle_message(tenant_id, user_id, "What needs attention today?")
    
    assert response.response_mode == "deterministic"
    assert "Dashboard" in response.response_text
    assert any(t.tool_name == "tool_read_dashboard_summary" for t in response.tool_calls)

def test_deterministic_intent_risk(test_context):
    db, tenant_id, user_id = test_context
    
    # Create a delayed shipment
    shipment = FreightShipment(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        primary_reference="REF-RISK-1",
        last_known_status="DELAYED",
        status_source="test"
    )
    db.add(shipment)
    db.commit()
    
    service = TrackflowCopilotService(db)
    response = service.handle_message(tenant_id, user_id, "Which shipments are at risk?")
    
    assert response.response_mode == "deterministic"
    assert "I found 1 shipments" in response.response_text
    assert response.cited_objects[0].reference == "REF-RISK-1"

def test_approval_gating(test_context, monkeypatch):
    db, tenant_id, user_id = test_context
    service = TrackflowCopilotService(db)
    
    # Mock planning to trigger a sensitive tool
    from neuromail.core.services.trackflow_copilot import CopilotPlannerOutput
    def mock_plan(self, t_id, msg):
        return CopilotPlannerOutput(
            intent="send_update",
            reasoning_summary="User wants to send an update.",
            tools=[{
                "name": "tool_send_email",
                "arguments": {"recipient": "customer@example.com", "subject": "Update", "body": "Status is OK"}
            }],
            requires_approval=True
        )
    monkeypatch.setattr(TrackflowCopilotService, "_plan_actions", mock_plan)
    
    response = service.handle_message(tenant_id, user_id, "Send an update to the customer")
    
    assert response.response_mode == "ai_assisted"
    assert "submitted them for approval" in response.response_text
    assert any(t.status == "approval_required" for t in response.tool_calls)
    assert len(response.approval_requests) == 1

    # Verify approval record
    appr = db.query(FreightApproval).filter(FreightApproval.tenant_id == tenant_id).first()
    assert appr is not None
    assert appr.approval_type == "copilot_action"
    assert appr.payload["tool_name"] == "tool_send_email"

def test_audit_logging(test_context):
    db, tenant_id, user_id = test_context
    service = TrackflowCopilotService(db)
    
    service.handle_message(tenant_id, user_id, "What needs attention?")
    
    # Check conversation
    conv = db.query(TrackflowCopilotConversation).filter(TrackflowCopilotConversation.tenant_id == tenant_id).first()
    assert conv is not None
    
    # Check messages
    msgs = db.query(TrackflowCopilotMessage).filter(TrackflowCopilotMessage.conversation_id == conv.id).all()
    assert len(msgs) == 2 # User + Assistant
    
    # Check actions
    actions = db.query(TrackflowCopilotAction).filter(TrackflowCopilotAction.conversation_id == conv.id).all()
    assert len(actions) > 0
    assert actions[0].tool_name == "tool_read_dashboard_summary"

def test_fallback_mode(test_context, monkeypatch):
    db, tenant_id, user_id = test_context
    service = TrackflowCopilotService(db)
    
    # Mock planning to fail
    def mock_plan_fail(self, t_id, msg):
        raise Exception("LLM Down")
    monkeypatch.setattr(TrackflowCopilotService, "_plan_actions", mock_plan_fail)
    
    response = service.handle_message(tenant_id, user_id, "Complex query that needs planning")
    
    assert response.response_mode == "fallback_unavailable"
    assert "limited mode" in response.response_text
