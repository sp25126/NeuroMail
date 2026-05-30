import re
import uuid
import logging
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from models import Entity, Identifier, ReviewItem
from neuromail.core.raw_email.parser import CanonicalParsedRecord
from services import entity_service, identifier_service

logger = logging.getLogger("RawEmail.ExtractionPipeline")

# Default pattern configurations per tenant/vertical
# Configurable dynamically, falls back to default freight/shipment vertical patterns
DEFAULT_PATTERNS = {
    "SHIPMENT_ID": r"\b(SHIP-\d{4,8})\b",
    "ORDER_NUMBER": r"\b(ORD-\d{4,8})\b",
    "TICKET_ID": r"\b(TKT-\d{4,8})\b",
    "BOL": r"\b(BOL-\d{4,8})\b",
    "CONTAINER_ID": r"\b(CONT-\d{4,8})\b"
}

# In a multi-vertical environment, tenant-scoped configurations override defaults
TENANT_CONFIGURATIONS = {}

def get_patterns_for_tenant(tenant_id: str) -> Dict[str, str]:
    return TENANT_CONFIGURATIONS.get(tenant_id, DEFAULT_PATTERNS)

def set_tenant_patterns(tenant_id: str, patterns: Dict[str, str]):
    TENANT_CONFIGURATIONS[tenant_id] = patterns

def extract_identifiers_from_text(text: str, patterns: Dict[str, str]) -> List[Tuple[str, str]]:
    """
    Extracts all matches of configured patterns from text.
    Returns a list of tuples: (identifier_type, identifier_value)
    """
    extracted = []
    seen = set()
    for id_type, regex in patterns.items():
        matches = re.findall(regex, text)
        for val in matches:
            if isinstance(val, tuple):
                val = val[0]
            val_clean = val.strip()
            if (id_type, val_clean) not in seen:
                extracted.append((id_type, val_clean))
                seen.add((id_type, val_clean))
    return extracted

def run_entity_extraction(
    db: Session,
    tenant_id: str,
    parsed_record: CanonicalParsedRecord
) -> Tuple[Optional[Entity], List[Identifier], bool]:
    """
    Runs entity extraction pipeline on parsed email record.
    1. Extracts identifiers based on tenant regex patterns.
    2. Resolves database records to link to existing entities.
    3. Handles conflicts by routing to human review queue (returns is_ambiguous=True).
    4. Safe to rerun (idempotent).
    """
    patterns = get_patterns_for_tenant(tenant_id)
    content_to_scan = f"{parsed_record.subject}\n{parsed_record.body_text}"
    
    extracted_idents = extract_identifiers_from_text(content_to_scan, patterns)
    if not extracted_idents:
        logger.info(f"No entities extracted for raw_email: {parsed_record.raw_email_id}")
        return None, [], False

    logger.info(f"Extracted {len(extracted_idents)} identifier candidates: {extracted_idents}")

    # Map identifier candidates to existing database entities
    matching_entities = {}
    for id_type, id_val in extracted_idents:
        # Check if this identifier value already exists for this tenant
        existing_ident = db.query(Identifier).filter(
            Identifier.tenant_id == tenant_id,
            Identifier.identifier_type == id_type,
            Identifier.identifier_value == id_val
        ).first()
        if existing_ident:
            matching_entities[existing_ident.entity_id] = existing_ident.entity

    entity_ids = list(matching_entities.keys())

    # Case 1: Multiple conflicting entities matched!
    if len(entity_ids) > 1:
        logger.warning(f"Conflict: multiple entities matched {entity_ids} in raw_email: {parsed_record.raw_email_id}. Routing to review queue.")
        # Create a ReviewItem for the conflict
        review_item = ReviewItem(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            object_type="RAW_EMAIL",
            object_id=parsed_record.raw_email_id,
            status="PENDING",
            confidence_score=0.3,
            reason=f"Conflicting entities matched: {entity_ids}",
            payload={
                "extracted_identifiers": [{"type": t, "value": v} for t, v in extracted_idents],
                "matching_entity_ids": entity_ids
            }
        )
        db.add(review_item)
        db.commit()
        return None, [], True

    # Case 2: Exactly one entity matched
    elif len(entity_ids) == 1:
        target_entity = matching_entities[entity_ids[0]]
        logger.info(f"Linking identifiers to existing entity: {target_entity.id}")
    
    # Case 3: No entity matched, create a new one
    else:
        # Choose the first identifier as identity display
        primary_id = f"{extracted_idents[0][0]}: {extracted_idents[0][1]}"
        target_entity = Entity(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            status="ACTIVE",
            identity=f"Entity ({primary_id})",
            source_reference=f"raw_emails/{parsed_record.raw_email_id}",
            metadata_json={}
        )
        db.add(target_entity)
        db.flush() # Populate ID
        logger.info(f"Created new entity: {target_entity.id} for primary identifier: {primary_id}")

    # Upsert identifiers for target_entity
    created_identifiers = []
    for id_type, id_val in extracted_idents:
        existing_ident = db.query(Identifier).filter(
            Identifier.tenant_id == tenant_id,
            Identifier.identifier_type == id_type,
            Identifier.identifier_value == id_val
        ).first()
        
        if not existing_ident:
            new_ident = Identifier(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                entity_id=target_entity.id,
                identifier_type=id_type,
                identifier_value=id_val,
                source="EMAIL_PARSER"
            )
            db.add(new_ident)
            created_identifiers.append(new_ident)
        else:
            created_identifiers.append(existing_ident)

    db.commit()
    return target_entity, created_identifiers, False
