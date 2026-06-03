import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from database import get_db
import schemas
from models import ReviewItem, AIFeedbackSignal, RawEmail
from services import ai_service
from neuromail.core.api.rbac import require_viewer, require_operator, require_analyst

router = APIRouter(tags=["AI Services"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

def get_user_id(x_user_id: str = Header(default="test-user-1")):
    return x_user_id


# --- Phase 6.2 — AI email summarization ---
@router.get("/emails/{email_id}/summary")
def get_email_summary(
    email_id: str,
    force: Optional[bool] = False,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    try:
        summary_data = ai_service.summarize_email(db, tenant_id, email_id, force=force)
        return summary_data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Phase 6.3 — Intent classification engine ---
@router.post("/emails/{email_id}/classify")
def run_intent_classification(
    email_id: str,
    force: Optional[bool] = True,
    prompt_label_overrides: Optional[bool] = False,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    try:
        intent = ai_service.classify_email(db, tenant_id, email_id, force=force, prompt_label_overrides=prompt_label_overrides)
        return {"email_id": email_id, "intent": intent}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Phase 6.4 — Urgency and priority scoring ---
@router.post("/emails/{email_id}/score")
def run_urgency_scoring(
    email_id: str,
    force: Optional[bool] = True,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    try:
        score_data = ai_service.score_urgency(db, tenant_id, email_id, force=force)
        return score_data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Phase 6.6 — Smart alert suggestions ---
@router.get("/review/suggestions", response_model=List[schemas.SmartSuggestionResponse])
def get_alert_suggestions(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    suggestions = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.object_type == "ALERT_SUGGESTION",
        ReviewItem.status == "PENDING"
    ).all()
    return suggestions

@router.post("/review/suggestions/{review_item_id}/approve")
def approve_suggestion_endpoint(
    review_item_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator),
    user_id: str = Depends(get_user_id)
):
    try:
        alert = ai_service.approve_alert_suggestion(db, tenant_id, review_item_id, user_id)
        return {"status": "approved", "alert_id": alert.id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/review/suggestions/{review_item_id}/dismiss")
def dismiss_suggestion_endpoint(
    review_item_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator),
    user_id: str = Depends(get_user_id)
):
    try:
        ai_service.dismiss_alert_suggestion(db, tenant_id, review_item_id, user_id)
        return {"status": "dismissed"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Phase 6.7 — Response drafting ---
@router.post("/emails/{email_id}/draft", response_model=schemas.ResponseDraftResponse, status_code=201)
def generate_draft_endpoint(
    email_id: str,
    payload: schemas.ResponseDraftCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator)
):
    try:
        draft_item = ai_service.generate_response_draft(db, tenant_id, email_id, payload.mode)
        return draft_item
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/review/drafts", response_model=List[schemas.ResponseDraftResponse])
def get_pending_drafts(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    drafts = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.object_type == "RESPONSE_DRAFT",
        ReviewItem.status == "PENDING"
    ).all()
    return drafts

@router.post("/review/drafts/{review_item_id}/approve")
def approve_draft_endpoint(
    review_item_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator),
    user_id: str = Depends(get_user_id)
):
    try:
        res = ai_service.approve_and_dispatch_draft(db, tenant_id, review_item_id, user_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/review/drafts/{review_item_id}/reject")
def reject_draft_endpoint(
    review_item_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator),
    user_id: str = Depends(get_user_id)
):
    item = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.id == review_item_id,
        ReviewItem.object_type == "RESPONSE_DRAFT"
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Draft not found")
        
    item.status = "REJECTED"
    item.reviewed_by = user_id
    item.reviewed_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "rejected"}


# --- Phase 6.9 — Conversational ops copilot ---
@router.post("/copilot/ask", response_model=schemas.CopilotResponse)
def ask_copilot_endpoint(
    payload: schemas.CopilotQuestion,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    try:
        res = ai_service.ask_copilot(db, tenant_id, payload.query)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Phase 6.11 — AI confidence and feedback loop ---
@router.post("/emails/{email_id}/feedback", response_model=schemas.AIFeedbackSignalResponse, status_code=201)
def log_feedback_endpoint(
    email_id: str,
    payload: schemas.AIFeedbackSignalCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    signal = ai_service.log_feedback_signal(
        db=db,
        tenant_id=tenant_id,
        feature=payload.feature,
        original_value=payload.original_value,
        corrected_value=payload.corrected_value,
        context=payload.context
    )
    return signal

@router.get("/observability/feedback", response_model=List[schemas.AIFeedbackSignalResponse])
def get_feedback_signals(
    feature: Optional[str] = Query(None),
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    query = db.query(AIFeedbackSignal).filter(AIFeedbackSignal.tenant_id == tenant_id)
    if feature:
        query = query.filter(AIFeedbackSignal.feature == feature)
    return query.order_by(AIFeedbackSignal.created_at.desc()).all()


# --- Phase 6.12 — AI action routing trigger endpoint ---
@router.post("/emails/{email_id}/suggestions")
def get_quick_suggestions(
    email_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    try:
        return ai_service.generate_quick_suggestions(db, tenant_id, email_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/emails/{email_id}/route")
def route_email_action_endpoint(
    email_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator)
):
    try:
        res = ai_service.run_action_routing(db, tenant_id, email_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
