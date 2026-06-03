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
    Upgraded AI enrichment hook.
    Summarizes emails, tags intent and urgency using LLM Client via ai_service.
    Failures do not block ingestion.
    """
    if not AI_ENRICHMENT_ENABLED:
        logger.info("AI enrichment is disabled. Skipping hook.")
        return None

    try:
        from services import ai_service
        
        # 1. Summarize
        summary_data = ai_service.summarize_email(db, tenant_id, raw_email.id)
        
        # 2. Classify
        intent = ai_service.classify_email(db, tenant_id, raw_email.id)
        
        # 3. Score
        scores = ai_service.score_urgency(db, tenant_id, raw_email.id)
        
        # Check cache record for metadata JSON
        cached = db.query(AIEnrichmentCache).filter(
            AIEnrichmentCache.tenant_id == tenant_id,
            AIEnrichmentCache.raw_email_id == raw_email.id
        ).first()
        
        meta = dict(cached.metadata_json) if cached and cached.metadata_json else {}
        meta["urgency_score"] = scores.get("urgency_score")
        
        return {
            "summary": summary_data.get("formatted_summary"),
            "intent": intent,
            "urgency": scores.get("priority_label"),
            "metadata": meta
        }
    except Exception as e:
        logger.error(f"AI enrichment service encountered an error (API timeout/failure): {str(e)}")
        return None

