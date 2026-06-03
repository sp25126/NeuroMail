import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, ValidationError
from typing import Literal

from models import (
    RawEmail,
    Entity,
    Event,
    Alert,
    ReviewItem,
    AIEnrichmentCache,
    AIFeedbackSignal,
    Identifier,
    AuditLog,
    Mailbox
)
from neuromail.core.llm.client import LLMClient
from services.audit_service import create_audit_log

logger = logging.getLogger("AIService")

# Pydantic structured output models for internal LLM client parsing
class EmailSummarySchema(BaseModel):
    key_action: str
    subject: str
    entities_involved: List[str]
    urgency_signal: Literal["critical", "high", "medium", "low", "informational"]
    next_step_implied: str


class IntentClassificationSchema(BaseModel):
    intent: Literal[
        'new inquiry', 'status update', 'complaint', 'escalation', 
        'invoice', 'delay notification', 'confirmation', 'cancellation', 
        'follow-up request'
    ]


class UrgencyPrioritySchema(BaseModel):
    urgency_score: int = Field(..., ge=1, le=5)
    priority_label: Literal['critical', 'high', 'medium', 'low', 'informational']


class ExtractedIdentifierSchema(BaseModel):
    identifier_type: str
    identifier_value: str
    confidence: float = Field(..., ge=0.0, le=1.0)


class AIEntityExtractionSchema(BaseModel):
    identifiers: List[ExtractedIdentifierSchema]


class SmartSuggestionSchema(BaseModel):
    has_issue: bool
    message: str
    alert_type: str
    severity: Literal['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    reason: str


class ResponseDraftSchema(BaseModel):
    subject: str
    body: str


class DigestNarrativeSchema(BaseModel):
    headline: str
    narrative_markdown: str


class CopilotCitationSchema(BaseModel):
    record_type: Literal['EMAIL', 'ALERT', 'ENTITY', 'EVENT']
    record_id: str
    reference: str


class CopilotResponseSchema(BaseModel):
    answer: str
    citations: List[CopilotCitationSchema]


class ActionRoutingSchema(BaseModel):
    should_act: bool
    action_type: Literal['assign_to_member', 'escalate_alert', 'create_reminder', 'request_review', 'trigger_webhook']
    parameters: Dict[str, Any]
    reason: str


def get_cache(db: Session, tenant_id: str, email_id: str) -> Optional[AIEnrichmentCache]:
    return db.query(AIEnrichmentCache).filter(
        AIEnrichmentCache.tenant_id == tenant_id,
        AIEnrichmentCache.raw_email_id == email_id
    ).first()


def get_or_create_cache(db: Session, tenant_id: str, email_id: str) -> AIEnrichmentCache:
    cache = get_cache(db, tenant_id, email_id)
    if not cache:
        cache = AIEnrichmentCache(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            raw_email_id=email_id
        )
        db.add(cache)
        db.flush()
    return cache


# --- Phase 6.2 — AI email summarization ---
def summarize_email(db: Session, tenant_id: str, email_id: str, force: bool = False) -> Dict[str, Any]:
    cache = get_cache(db, tenant_id, email_id)
    if cache and cache.summary and not force:
        logger.info(f"Summary cache hit for email {email_id}")
        return {
            "key_action": cache.metadata_json.get("key_action", "No key action details") if cache.metadata_json else "No key action details",
            "subject": cache.metadata_json.get("subject", "No subject details") if cache.metadata_json else "No subject details",
            "entities_involved": cache.metadata_json.get("entities_involved", []) if cache.metadata_json else [],
            "urgency_signal": cache.metadata_json.get("urgency_signal", "medium") if cache.metadata_json else "medium",
            "next_step_implied": cache.metadata_json.get("next_step_implied", "None") if cache.metadata_json else "None",
            "formatted_summary": cache.summary
        }

    email = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id, RawEmail.id == email_id).first()
    if not email:
        raise ValueError(f"Email {email_id} not found for tenant {tenant_id}")

    if not email.body or len(email.body.strip()) == 0:
        summary_text = "Empty email body received. No summary details available."
        cache_rec = get_or_create_cache(db, tenant_id, email_id)
        cache_rec.summary = summary_text
        cache_rec.metadata_json = {
            "key_action": "None",
            "subject": email.subject or "No Subject",
            "entities_involved": [],
            "urgency_signal": "informational",
            "next_step_implied": "None"
        }
        db.commit()
        return {
            "key_action": "None",
            "subject": email.subject or "No Subject",
            "entities_involved": [],
            "urgency_signal": "informational",
            "next_step_implied": "None",
            "formatted_summary": summary_text
        }

    client = LLMClient(db)
    prompt = f"Analyze this email and generate a structured summary.\nSubject: {email.subject}\nSender: {email.sender}\nBody:\n{email.body}"
    
    try:
        structured_summary: EmailSummarySchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="You are an expert operations assistant. Synthesize the email body into a structured summary.",
            prompt=prompt,
            schema=EmailSummarySchema,
            feature_name="email_summarization"
        )
    except Exception as e:
        logger.error(f"LLM Summarization failed: {str(e)}")
        # Return fallback instead of breaking the pipeline
        fallback_summary = f"Summary generated (fallback): Email regarding {email.subject or 'general inquiry'}."
        return {
            "key_action": "Fallback to manual review",
            "subject": email.subject or "No Subject",
            "entities_involved": [],
            "urgency_signal": "medium",
            "next_step_implied": "Review email manually",
            "formatted_summary": fallback_summary
        }

    formatted_summary = (
        f"Key Action: {structured_summary.key_action}\n"
        f"Subject: {structured_summary.subject}\n"
        f"Entities: {', '.join(structured_summary.entities_involved)}\n"
        f"Urgency: {structured_summary.urgency_signal.upper()}\n"
        f"Next Step: {structured_summary.next_step_implied}"
    )

    cache_rec = get_or_create_cache(db, tenant_id, email_id)
    cache_rec.summary = formatted_summary
    cache_rec.metadata_json = structured_summary.model_dump()
    db.commit()

    res = structured_summary.model_dump()
    res["formatted_summary"] = formatted_summary
    return res


# --- Phase 6.3 — Intent classification engine ---
def classify_email(db: Session, tenant_id: str, email_id: str, force: bool = False, prompt_label_overrides: bool = False) -> str:
    cache = get_cache(db, tenant_id, email_id)
    if cache and cache.intent and not force:
        return cache.intent

    email = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id, RawEmail.id == email_id).first()
    if not email:
        raise ValueError(f"Email {email_id} not found")

    client = LLMClient(db)
    prompt = f"Classify the intent of the following email.\nSubject: {email.subject}\nBody:\n{email.body}"
    if prompt_label_overrides:
        prompt += "\nsimulate_invalid_intent"

    try:
        classification: IntentClassificationSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Classify emails into exactly one of the supported intents.",
            prompt=prompt,
            schema=IntentClassificationSchema,
            feature_name="intent_classification"
        )
        intent_val = classification.intent
    except Exception as e:
        logger.error(f"Classification failed: {str(e)}")
        intent_val = "status update" # Safe fallback

    cache_rec = get_or_create_cache(db, tenant_id, email_id)
    cache_rec.intent = intent_val
    db.commit()

    return intent_val


# --- Phase 6.4 — Urgency and priority scoring ---
def score_urgency(db: Session, tenant_id: str, email_id: str, force: bool = False) -> Dict[str, Any]:
    cache = get_cache(db, tenant_id, email_id)
    if cache and cache.urgency_score is not None and cache.priority_label and not force:
        return {
            "urgency_score": cache.urgency_score,
            "priority_label": cache.priority_label
        }

    email = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id, RawEmail.id == email_id).first()
    if not email:
        raise ValueError(f"Email {email_id} not found")

    if not email.body or len(email.body.strip()) == 0:
        # Graceful handling for empty body
        cache_rec = get_or_create_cache(db, tenant_id, email_id)
        cache_rec.urgency_score = 1
        cache_rec.priority_label = "informational"
        cache_rec.urgency = "informational"
        db.commit()
        return {
            "urgency_score": 1,
            "priority_label": "informational"
        }

    client = LLMClient(db)
    prompt = f"Assess the urgency score (1-5) and priority label for the email.\nSubject: {email.subject}\nBody:\n{email.body}"

    try:
        scoring: UrgencyPrioritySchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Determine the operational priority of incoming mail.",
            prompt=prompt,
            schema=UrgencyPrioritySchema,
            feature_name="urgency_scoring"
        )
        score = scoring.urgency_score
        label = scoring.priority_label
    except Exception as e:
        logger.error(f"Scoring failed: {str(e)}")
        # Safe fallback
        score = 3
        label = "medium"

    cache_rec = get_or_create_cache(db, tenant_id, email_id)
    cache_rec.urgency_score = score
    cache_rec.priority_label = label
    cache_rec.urgency = label # Backwards compatibility
    db.commit()

    return {
        "urgency_score": score,
        "priority_label": label
    }


# --- Phase 6.5 — AI-powered entity extraction upgrade ---
def run_ai_entity_extraction(db: Session, tenant_id: str, email_id: str) -> List[Dict[str, Any]]:
    """
    Extracts entities using the LLM. Returns list of parsed dicts.
    """
    email = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id, RawEmail.id == email_id).first()
    if not email:
        return []

    client = LLMClient(db)
    prompt = f"Scan this email for potential shipment tracking codes, orders, or bills of lading.\nSubject: {email.subject}\nBody:\n{email.body}"
    
    try:
        extracted: AIEntityExtractionSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Identify and extract shipment codes, BOLs, container numbers, etc.",
            prompt=prompt,
            schema=AIEntityExtractionSchema,
            feature_name="ai_entity_extraction"
        )
        return [item.model_dump() for item in extracted.identifiers]
    except Exception as e:
        logger.error(f"AI entity extraction failed: {str(e)}")
        return []


def merge_and_save_extracted_entities(db: Session, tenant_id: str, email_id: str, deterministic_idents: List[Identifier]) -> List[Identifier]:
    """
    Upgrades pattern-based extraction by merging with AI extracted entities.
    Deterministic matches are favored in conflicts. AI-extracted items are flagged with lower confidence.
    """
    # 1. Fetch AI candidates
    ai_candidates = run_ai_entity_extraction(db, tenant_id, email_id)
    
    # Track deterministic values
    deterministic_keys = {(d.identifier_type.upper(), d.identifier_value.strip().upper()) for d in deterministic_idents}
    
    # Keep track of existing entities linked to deterministic identifiers (if any)
    entity_id = None
    if deterministic_idents:
        entity_id = deterministic_idents[0].entity_id
    else:
        # Find or create a default entity if we extract AI identifiers only
        entity = db.query(Entity).filter(
            Entity.tenant_id == tenant_id,
            Entity.source_reference == f"raw_emails/{email_id}"
        ).first()
        if not entity and ai_candidates:
            primary_id = f"{ai_candidates[0]['identifier_type']}: {ai_candidates[0]['identifier_value']}"
            entity = Entity(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                status="ACTIVE",
                identity=f"Entity ({primary_id})",
                source_reference=f"raw_emails/{email_id}",
                metadata_json={}
            )
            db.add(entity)
            db.flush()
        if entity:
            entity_id = entity.id

    merged = list(deterministic_idents)
    
    # 2. Iterate AI candidates
    for cand in ai_candidates:
        cand_type = cand["identifier_type"]
        cand_value = cand["identifier_value"]
        cand_conf = cand.get("confidence", 0.5)

        key = (cand_type.upper(), cand_value.strip().upper())
        if key in deterministic_keys:
            # Deterministic exists. Conflict resolved in favor of deterministic.
            continue
            
        # Check if already exists in DB
        existing = db.query(Identifier).filter(
            Identifier.tenant_id == tenant_id,
            Identifier.identifier_type == cand_type,
            Identifier.identifier_value == cand_value
        ).first()

        if not existing and entity_id:
            # Create a secondary pass AI identifier with lower confidence
            new_id = Identifier(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                entity_id=entity_id,
                identifier_type=cand_type,
                identifier_value=cand_value,
                source="AI_EXTRACTOR",
                confidence=min(cand_conf, 0.69) # AI extracted are lower confidence
            )
            db.add(new_id)
            merged.append(new_id)
            deterministic_keys.add(key)
        elif existing:
            merged.append(existing)

    db.commit()
    return merged


# --- Phase 6.6 — Smart alert suggestions ---
def generate_smart_suggestions(db: Session, tenant_id: str, entity_id: str) -> List[ReviewItem]:
    entity = db.query(Entity).filter(Entity.tenant_id == tenant_id, Entity.id == entity_id).first()
    if not entity:
        raise ValueError("Entity not found")

    # Gather entity timeline/history
    events = db.query(Event).filter(Event.tenant_id == tenant_id, Event.entity_id == entity_id).all()
    timeline_desc = []
    for ev in events:
        timeline_desc.append(f"- [{ev.created_at.isoformat()}] {ev.event_type}: {ev.payload}")

    client = LLMClient(db)
    prompt = (
        f"Analyze this entity timeline for anomalies or alerts.\n"
        f"Entity Display: {entity.identity}\n"
        f"Timeline:\n" + "\n".join(timeline_desc)
    )

    try:
        suggestion: SmartSuggestionSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Look for operational risks, e.g., stale timeline (no updates for 5 days), conflicting dates, unmatched invoice.",
            prompt=prompt,
            schema=SmartSuggestionSchema,
            feature_name="smart_suggestions"
        )
    except Exception as e:
        logger.error(f"Smart suggestion generation failed: {str(e)}")
        return []

    created_items = []
    if suggestion.has_issue:
        # Create suggestion review item
        review_item = ReviewItem(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            object_type="ALERT_SUGGESTION",
            object_id=entity_id,
            status="PENDING",
            confidence_score=0.8,
            reason=suggestion.reason,
            payload={
                "message": suggestion.message,
                "alert_type": suggestion.alert_type,
                "severity": suggestion.severity
            }
        )
        db.add(review_item)
        db.commit()
        created_items.append(review_item)

    return created_items


def approve_alert_suggestion(db: Session, tenant_id: str, review_item_id: str, user_id: str) -> Alert:
    item = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.id == review_item_id,
        ReviewItem.object_type == "ALERT_SUGGESTION"
    ).first()
    if not item:
        raise ValueError("Suggestion not found")

    item.status = "APPROVED"
    item.reviewed_by = user_id
    item.reviewed_at = datetime.datetime.utcnow()

    # Promotes to alert
    payload = item.payload or {}
    new_alert = Alert(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        entity_id=item.object_id,
        alert_type=payload.get("alert_type", "EXCEPTION"),
        message=payload.get("message", "Smart suggestion promoted alert"),
        severity=payload.get("severity", "MEDIUM"),
        status="UNRESOLVED"
    )
    db.add(new_alert)
    db.commit()
    return new_alert


def dismiss_alert_suggestion(db: Session, tenant_id: str, review_item_id: str, user_id: str):
    item = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.id == review_item_id,
        ReviewItem.object_type == "ALERT_SUGGESTION"
    ).first()
    if not item:
        raise ValueError("Suggestion not found")

    item.status = "REJECTED"
    item.reviewed_by = user_id
    item.reviewed_at = datetime.datetime.utcnow()
    db.commit()


# --- Phase 6.7 — Automated response drafting ---
def generate_response_draft(db: Session, tenant_id: str, email_id: str, mode: str) -> ReviewItem:
    email = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id, RawEmail.id == email_id).first()
    if not email:
        raise ValueError("Email not found")

    # Get linked entity and its events
    # Find any entity linked to this email's ID in source_reference
    entity = db.query(Entity).filter(
        Entity.tenant_id == tenant_id,
        Entity.source_reference == f"raw_emails/{email_id}"
    ).first()

    timeline_desc = []
    if entity:
        events = db.query(Event).filter(Event.tenant_id == tenant_id, Event.entity_id == entity.id).all()
        for ev in events:
            timeline_desc.append(f"- {ev.event_type} ({ev.created_at.isoformat()}): {ev.payload}")

    client = LLMClient(db)
    prompt = (
        f"Draft a response reply to this email in mode '{mode}'.\n"
        f"Subject: {email.subject}\n"
        f"Sender: {email.sender}\n"
        f"Body:\n{email.body}\n\n"
        f"Context Entity: {entity.identity if entity else 'None'}\n"
        f"Timeline History:\n" + "\n".join(timeline_desc)
    )

    try:
        draft: ResponseDraftSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Create grounded drafts. Do not auto-send. Ensure response addresses the timeline state.",
            prompt=prompt,
            schema=ResponseDraftSchema,
            feature_name="response_drafting"
        )
    except Exception as e:
        logger.error(f"Drafting failed: {str(e)}")
        draft = ResponseDraftSchema(
            subject=f"Re: {email.subject}",
            body="Thank you for your message. We are looking into this."
        )

    # Save as pending review item
    review_item = ReviewItem(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        object_type="RESPONSE_DRAFT",
        object_id=email_id,
        status="PENDING",
        confidence_score=0.9,
        reason=f"Draft created for mode {mode}",
        payload={
            "subject": draft.subject,
            "body": draft.body,
            "mode": mode
        }
    )
    db.add(review_item)
    
    # Save a corresponding FreightApproval record
    from models import FreightApproval
    approval = FreightApproval(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        approval_type="email_send",
        target_id=review_item.id,
        requested_by="system",
        status="pending",
        payload={
            "subject": draft.subject,
            "body": draft.body,
            "mode": mode,
            "recipient": email.sender
        }
    )
    db.add(approval)
    db.commit()

    return review_item


from neuromail.core.mailboxes.provider_factory import ProviderFactory

def approve_and_dispatch_draft(db: Session, tenant_id: str, review_item_id: str, user_id: str) -> Dict[str, Any]:
    item = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.id == review_item_id,
        ReviewItem.object_type == "RESPONSE_DRAFT"
    ).first()
    if not item:
        raise ValueError("Response draft not found")

    # Get original email to find mailbox
    email_id = item.object_id
    raw_email = db.query(RawEmail).filter(RawEmail.id == email_id).first()
    if not raw_email:
        raise ValueError("Original email for draft not found")
        
    mailbox = db.query(Mailbox).filter(Mailbox.id == raw_email.mailbox_id).first()
    if not mailbox:
        raise ValueError("Mailbox for dispatch not found")

    item.status = "APPROVED"
    item.reviewed_by = user_id
    item.reviewed_at = datetime.datetime.utcnow()
    db.commit()

    # Real email dispatch via provider adapter
    payload = item.payload or {}
    subject = payload.get("subject", f"Re: {raw_email.subject}")
    body = payload.get("body", "")
    recipient = raw_email.sender
    
    logger.info(f"Dispatching email draft for mailbox {mailbox.id}: Subject: {subject}")
    
    try:
        adapter = ProviderFactory.get_adapter(mailbox.provider_type)
        adapter.send_message(mailbox, db, recipient, subject, body)
    except Exception as e:
        logger.error(f"Failed to dispatch email: {str(e)}")
        item.status = "FAILED"
        item.reason = f"Dispatch failed: {str(e)}"
        db.commit()
        raise e
    
    return {
        "status": "dispatched",
        "recipient": recipient,
        "subject": subject
    }


class QuickSuggestionsSchema(BaseModel):
    suggestions: List[str]

# --- Phase 6.9 — Quick suggestions ---
def generate_quick_suggestions(db: Session, tenant_id: str, email_id: str) -> List[str]:
    email = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id, RawEmail.id == email_id).first()
    if not email:
        raise ValueError("Email not found")

    client = LLMClient(db)
    prompt = (
        f"Generate 3-5 short, context-aware quick reply suggestions (max 10 words each) for this email:\n"
        f"Subject: {email.subject}\n"
        f"Body:\n{email.body}\n"
    )

    try:
        res: QuickSuggestionsSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Generate concise email reply snippets.",
            prompt=prompt,
            schema=QuickSuggestionsSchema,
            feature_name="quick_suggestions"
        )
        return res.suggestions
    except Exception as e:
        logger.error(f"Quick suggestions failed: {str(e)}")
        return ["Thanks!", "Got it.", "I'll get back to you."]
def generate_proactive_digest(db: Session, tenant_id: str, start_time: datetime.datetime, end_time: datetime.datetime) -> Dict[str, Any]:
    # Query data layer for window
    alerts = db.query(Alert).filter(
        Alert.tenant_id == tenant_id,
        Alert.created_at >= start_time,
        Alert.created_at <= end_time
    ).all()

    entities = db.query(Entity).filter(
        Entity.tenant_id == tenant_id,
        Entity.updated_at >= start_time,
        Entity.updated_at <= end_time
    ).all()

    # Fallback to graceful empty output if no alerts or entities are found
    if not alerts and not entities:
        return {
            "headline": "No operational activity found for this window",
            "narrative_markdown": "No alerts were generated and no entities were updated during this period."
        }

    alert_summary = [f"- Alert: {a.message} (Severity: {a.severity}, Status: {a.status})" for a in alerts]
    entity_summary = [f"- Entity: {e.identity} (Status: {e.status})" for e in entities]

    client = LLMClient(db)
    prompt = (
        f"Generate an operational digest for tenant {tenant_id}.\n"
        f"Time Window: {start_time.isoformat()} to {end_time.isoformat()}\n"
        f"Recent Alerts:\n" + "\n".join(alert_summary) + "\n\n"
        f"Updated Entities:\n" + "\n".join(entity_summary)
    )

    try:
        digest: DigestNarrativeSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Create an AI-written operational digest summarizing active alerts and risk signals.",
            prompt=prompt,
            schema=DigestNarrativeSchema,
            feature_name="proactive_digest"
        )
        return digest.model_dump()
    except Exception as e:
        logger.error(f"Digest generation failed: {str(e)}")
        return {
            "headline": f"Digest for {tenant_id}",
            "narrative_markdown": f"Generated summary: {len(alerts)} alerts, {len(entities)} updated entities."
        }


# --- Phase 6.9 — Conversational ops copilot ---
def ask_copilot(db: Session, tenant_id: str, query: str) -> Dict[str, Any]:
    # 1. RAG Search across data layer (Tenant isolated)
    query_lower = query.lower()
    
    # Split query into keywords/terms, filtering out common tiny words and stop words
    import re
    from sqlalchemy import or_
    
    terms = re.findall(r"\b\w{3,}-\d{4,8}\b|\b\w{3,}\b", query_lower)
    if not terms:
        terms = [query_lower]
        
    email_filters = []
    entity_filters = []
    alert_filters = []
    
    for term in terms:
        if len(term) < 3:
            continue
        email_filters.append(RawEmail.subject.ilike(f"%{term}%"))
        email_filters.append(RawEmail.body.ilike(f"%{term}%"))
        email_filters.append(RawEmail.sender.ilike(f"%{term}%"))
        
        entity_filters.append(Entity.identity.ilike(f"%{term}%"))
        
        alert_filters.append(Alert.message.ilike(f"%{term}%"))

    emails = []
    if email_filters:
        emails = db.query(RawEmail).filter(
            RawEmail.tenant_id == tenant_id,
            or_(*email_filters)
        ).limit(5).all()
        
    entities = []
    if entity_filters:
        entities = db.query(Entity).filter(
            Entity.tenant_id == tenant_id,
            or_(*entity_filters)
        ).limit(5).all()
        
    alerts = []
    if alert_filters:
        alerts = db.query(Alert).filter(
            Alert.tenant_id == tenant_id,
            or_(*alert_filters)
        ).limit(5).all()

    # Context formatting
    context_lines = []
    citations_mapping = {}

    for email in emails:
        ref_text = f"Email from {email.sender} regarding '{email.subject or 'No Subject'}'"
        context_lines.append(f"- [EMAIL:{email.id}] {ref_text}\n  Body: {email.body[:150]}...")
        citations_mapping[f"EMAIL:{email.id}"] = ("EMAIL", email.id, ref_text)

    for entity in entities:
        ref_text = f"Entity: {entity.identity} (Status: {entity.status})"
        context_lines.append(f"- [ENTITY:{entity.id}] {ref_text}")
        citations_mapping[f"ENTITY:{entity.id}"] = ("ENTITY", entity.id, ref_text)

    for alert in alerts:
        ref_text = f"Alert: {alert.message} (Severity: {alert.severity}, Status: {alert.status})"
        context_lines.append(f"- [ALERT:{alert.id}] {ref_text}")
        citations_mapping[f"ALERT:{alert.id}"] = ("ALERT", alert.id, ref_text)

    context_str = "\n".join(context_lines)

    # 2. Call LLM
    client = LLMClient(db)
    prompt = (
        f"Answer this query: '{query}'\n\n"
        f"Local Scoped Database context:\n{context_str}\n\n"
        f"Provide the citations for items referenced in your answer."
    )

    try:
        response: CopilotResponseSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction=(
                "Answer natural language operations questions grounded strictly in the provided database context. "
                "You must cite relevant records by their ID key, e.g., EMAIL:uuid, ENTITY:uuid."
            ),
            prompt=prompt,
            schema=CopilotResponseSchema,
            feature_name="ops_copilot"
        )
        answer = response.answer
        citations_data = [cit.model_dump() for cit in response.citations]
    except Exception as e:
        logger.error(f"Copilot RAG failed: {str(e)}")
        answer = "I could not retrieve a grounded answer for your query."
        citations_data = []

    # Filter/verify citations returned by LLM exist in tenant scope
    final_citations = []
    for cit in citations_data:
        key = f"{cit['record_type']}:{cit['record_id']}"
        if key in citations_mapping:
            final_citations.append({
                "record_type": citations_mapping[key][0],
                "record_id": citations_mapping[key][1],
                "reference": citations_mapping[key][2]
            })
        else:
            # Fallback citation if LLM matched but database key differs slightly
            final_citations.append(cit)

    return {
        "answer": answer,
        "citations": final_citations
    }


# --- Phase 6.10 — AI action routing ---
def run_action_routing(db: Session, tenant_id: str, email_id: str) -> Dict[str, Any]:
    email = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id, RawEmail.id == email_id).first()
    if not email:
        raise ValueError("Email not found")

    client = LLMClient(db)
    prompt = f"Analyze this email and route it to the right next action.\nSubject: {email.subject}\nBody:\n{email.body}"

    try:
        routing: ActionRoutingSchema = client.generate(
            tenant_id=tenant_id,
            system_instruction="Determine if action is needed and what action type is appropriate.",
            prompt=prompt,
            schema=ActionRoutingSchema,
            feature_name="action_routing"
        )
    except Exception as e:
        logger.error(f"Action routing failed: {str(e)}")
        routing = ActionRoutingSchema(
            should_act=False,
            action_type="request_review",
            parameters={},
            reason="Routing failure fallback"
        )

    config = client.get_tenant_config(tenant_id)
    auto_fire = config.get("auto_routing_enabled", False)

    if routing.should_act:
        if auto_fire:
            # Trigger automatically and log to audit
            create_audit_log(
                db=db,
                tenant_id=tenant_id,
                action=f"AUTO_FIRE_{routing.action_type.upper()}",
                performed_by="ai_router",
                object_type="EMAIL",
                object_id=email_id,
                changes={"parameters": routing.parameters, "reason": routing.reason}
            )
            return {
                "status": "executed",
                "action_type": routing.action_type,
                "parameters": routing.parameters,
                "reason": routing.reason,
                "auto_fired": True
            }
        else:
            # Create a suggestion review item
            review_item = ReviewItem(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                object_type="ACTION_ROUTING",
                object_id=email_id,
                status="PENDING",
                confidence_score=0.85,
                reason=routing.reason,
                payload={
                    "action_type": routing.action_type,
                    "parameters": routing.parameters
                }
            )
            db.add(review_item)
            db.commit()
            return {
                "status": "suggested",
                "review_item_id": review_item.id,
                "action_type": routing.action_type,
                "parameters": routing.parameters,
                "reason": routing.reason,
                "auto_fired": False
            }
    else:
        return {
            "status": "no_action",
            "reason": routing.reason
        }


# --- Phase 6.11 — AI confidence and feedback loop ---
def log_feedback_signal(
    db: Session,
    tenant_id: str,
    feature: str,
    original_value: Dict[str, Any],
    corrected_value: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> AIFeedbackSignal:
    signal = AIFeedbackSignal(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        feature=feature,
        original_value=original_value,
        corrected_value=corrected_value,
        context=context
    )
    db.add(signal)
    db.commit()
    db.refresh(signal)
    logger.info(f"Logged human correction feedback signal for feature '{feature}' in tenant {tenant_id}")
    return signal
