import uuid
import datetime
import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from models import AIEnrichmentCache, RawEmail

logger = logging.getLogger("RawEmail.AIEnrichment")

# Global flag to toggle AI enrichment runs
AI_ENRICHMENT_ENABLED = True

def toggle_ai_enrichment(enabled: bool):
    global AI_ENRICHMENT_ENABLED
    AI_ENRICHMENT_ENABLED = enabled
    logger.info(f"AI enrichment globally set to: {enabled}")

def run_ai_enrichment(
    db: Session,
    tenant_id: str,
    raw_email: RawEmail
) -> Optional[Dict[str, Any]]:
    """
    Optional and cached AI enrichment helper.
    Summarizes emails, tags intent and urgency. Failures of this hook do not block ingestion.
    """
    if not AI_ENRICHMENT_ENABLED:
        logger.info("AI enrichment is disabled. Skipping hook.")
        return None

    # 1. Check cache first to avoid redundant API charges
    cached = db.query(AIEnrichmentCache).filter(
        AIEnrichmentCache.tenant_id == tenant_id,
        AIEnrichmentCache.raw_email_id == raw_email.id
    ).first()
    
    if cached:
        logger.info(f"AI cache hit for raw_email: {raw_email.id}")
        return {
            "summary": cached.summary,
            "intent": cached.intent,
            "urgency": cached.urgency,
            "metadata": cached.metadata_json
        }

    # 2. Simulate/Perform LLM call with safety rails
    try:
        subject = raw_email.subject or ""
        body = raw_email.body or ""
        text = f"{subject} {body}".lower()
        
        # Urgency detection logic
        urgency = "LOW"
        if any(w in text for w in ["delay", "urgent", "immediate", "late", "broke", "critical", "issue"]):
            urgency = "HIGH"
        elif any(w in text for w in ["update", "question", "status"]):
            urgency = "MEDIUM"
            
        # Intent classification logic
        intent = "OTHER"
        if any(w in text for w in ["shipment", "cargo", "delivery", "tracking", "container", "bol"]):
            intent = "SHIPMENT_UPDATE"
        elif any(w in text for w in ["invoice", "pay", "billing", "cost"]):
            intent = "BILLING"
            
        # Simple extraction summary
        summary = f"Email regarding: {raw_email.subject or 'General Inquiry'}"
        if len(body) > 10:
            summary += f" ({body[:40]}...)"
            
        metadata = {
            "extracted_at": datetime.datetime.utcnow().isoformat(),
            "confidence": 0.85
        }
        
        # Save results to cache DB
        cache_record = AIEnrichmentCache(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            raw_email_id=raw_email.id,
            summary=summary,
            intent=intent,
            urgency=urgency,
            metadata_json=metadata
        )
        db.add(cache_record)
        db.commit()
        
        logger.info(f"AI enrichment completed and cached for raw_email: {raw_email.id}")
        return {
            "summary": summary,
            "intent": intent,
            "urgency": urgency,
            "metadata": metadata
        }
    except Exception as e:
        # Crucial fallback: Log error but DO NOT block the parsing pipeline
        logger.error(f"AI enrichment service encountered an error (API timeout/failure): {str(e)}")
        return None
