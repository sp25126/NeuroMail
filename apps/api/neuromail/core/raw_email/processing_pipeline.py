import time
import logging
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from models import RawEmail

from neuromail.core.raw_email.parser import parse_raw_email, CanonicalParsedRecord
from neuromail.core.raw_email.ai_enrichment import run_ai_enrichment
from neuromail.core.raw_email.extraction_pipeline import run_entity_extraction
from neuromail.core.raw_email.event_synthesis import synthesize_email_parsed_event
from neuromail.core.raw_email.rule_engine import run_rules_evaluation
from neuromail.core.raw_email.alert_service import create_or_deduplicate_alert
from neuromail.core.raw_email.notification_service import dispatch_notifications_for_alert
from neuromail.core.raw_email.observability import metrics_store

logger = logging.getLogger("RawEmail.ProcessingPipeline")

def process_email_pipeline(db: Session, tenant_id: str, raw_email_id: str) -> Dict[str, Any]:
    """
    Executes the entire Phase 4 intelligence loop for an incoming raw email.
    Chains parser -> AI enrichment -> entity mapping -> events -> rules -> alerts.
    Safe and idempotent to rerun.
    """
    # 1. Fetch raw email
    raw_email = db.query(RawEmail).filter(
        RawEmail.tenant_id == tenant_id,
        RawEmail.id == raw_email_id
    ).first()
    
    if not raw_email:
        raise ValueError(f"Raw email {raw_email_id} not found for tenant {tenant_id}")
        
    logger.info(f"Starting pipeline execution for raw_email: {raw_email.id}")
    
    # 2. AI Enrichment (optional, cached, fail-safe)
    ai_start = time.time()
    ai_data = run_ai_enrichment(db, tenant_id, raw_email)
    ai_elapsed_ms = (time.time() - ai_start) * 1000.0
    if ai_data:
        metrics_store.add_latency(ai_elapsed_ms)
        
    # 3. Canonical Parsing (deterministic, idempotent)
    try:
        parsed_record = parse_raw_email(raw_email)
        metrics_store.increment("parsed_emails_total")
    except Exception as e:
        metrics_store.increment("parsed_emails_failed")
        logger.error(f"Deterministic parsing failed for raw_email: {raw_email.id}. Error: {str(e)}")
        raise e

    # 4. Entity Extraction (identifies BOL, shipment IDs, handles conflicts)
    entity = None
    created_idents = []
    is_ambiguous = False
    
    try:
        entity, created_idents, is_ambiguous = run_entity_extraction(db, tenant_id, parsed_record)
        metrics_store.increment("entity_extractions_total")
    except Exception as e:
        metrics_store.increment("entity_extractions_failed")
        logger.error(f"Entity extraction failed for raw_email: {raw_email.id}. Error: {str(e)}")
        
    # If ambiguous, processing is halted for manual human review queue
    if is_ambiguous:
        logger.warning(f"Processing halted for raw_email {raw_email.id} due to entity mapping conflicts.")
        return {
            "status": "review_required",
            "reason": "Conflicting entity identifiers detected, routed to human review.",
            "parsed_record": parsed_record.to_dict()
        }

    # Link timeline event if entity exists
    if entity:
        synthesize_email_parsed_event(
            db=db,
            tenant_id=tenant_id,
            entity_id=entity.id,
            raw_email_id=raw_email.id,
            subject=parsed_record.subject,
            sender=parsed_record.sender
        )

    # 5. Rule Evaluation Engine
    outcomes = []
    alerts_triggered = []
    
    try:
        metrics_store.increment("rules_evaluated_total")
        outcomes = run_rules_evaluation(db, tenant_id, parsed_record, entity)
    except Exception as e:
        logger.error(f"Rules evaluation failed for raw_email {raw_email.id}. Error: {str(e)}")
        
    # 6. Outcome / Alert Generation & Deduplication & Notification Dispatch
    if outcomes:
        metrics_store.increment("rules_hit_total", len(outcomes))
        
        for outcome in outcomes:
            rule_id = outcome.get("rule_id")
            action_type = outcome.get("action")
            
            if action_type == "create_alert":
                alert_type = outcome.get("alert_type", "EXCEPTION")
                severity = outcome.get("severity", "MEDIUM")
                
                # Format templated message if template variables exist
                msg_template = outcome.get("message_template", "Alert triggered: {subject}")
                try:
                    msg = msg_template.format(
                        subject=parsed_record.subject,
                        sender=parsed_record.sender,
                        entity_id=entity.id if entity else "None"
                    )
                except Exception:
                    msg = msg_template
                    
                # Create/deduplicate
                alert = create_or_deduplicate_alert(
                    db=db,
                    tenant_id=tenant_id,
                    alert_type=alert_type,
                    message=msg,
                    severity=severity,
                    entity_id=entity.id if entity else None,
                    rule_id=rule_id
                )
                
                # Metric tracking for alerts
                if alert.occurrence_count == 1:
                    metrics_store.increment("alerts_created_total")
                else:
                    metrics_store.increment("alerts_deduplicated_total")
                    
                # Trigger dispatch notifications
                try:
                    dispatch_notifications_for_alert(db, tenant_id, alert)
                except Exception as e:
                    logger.error(f"Notification dispatch failed for alert {alert.id}: {str(e)}")
                    
                alerts_triggered.append(alert.id)

    return {
        "status": "success",
        "entity_id": entity.id if entity else None,
        "is_linked": entity is not None,
        "identifiers_count": len(created_idents),
        "alerts_count": len(alerts_triggered),
        "alerts": alerts_triggered,
        "ai_enrichment": ai_data is not None
    }
