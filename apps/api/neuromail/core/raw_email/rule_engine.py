import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from models import Rule, Entity, RawEmail
from neuromail.core.raw_email.parser import CanonicalParsedRecord

logger = logging.getLogger("RawEmail.RuleEngine")

def evaluate_condition(
    condition_type: str,
    condition_val: Any,
    record: CanonicalParsedRecord,
    entity: Optional[Entity],
    ai_data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Evaluates a single condition against a parsed email, optional entity, and optional AI data.
    """
    try:
        if condition_type == "sender_match":
            return bool(re.search(condition_val, record.sender, re.IGNORECASE))
        
        elif condition_type == "sender_contains":
            return condition_val.lower() in record.sender.lower()
            
        elif condition_type == "subject_match":
            return bool(re.search(condition_val, record.subject, re.IGNORECASE))
            
        elif condition_type == "subject_contains":
            return condition_val.lower() in record.subject.lower()
            
        elif condition_type == "body_match":
            return bool(re.search(condition_val, record.body_text, re.IGNORECASE))
            
        elif condition_type == "body_contains":
            return condition_val.lower() in record.body_text.lower()
            
        elif condition_type == "entity_status_match":
            if not entity:
                return False
            return entity.status.upper() == condition_val.upper()
            
        elif condition_type == "has_attachment":
            has_atts = len(record.attachments) > 0
            return has_atts == bool(condition_val)
            
        elif condition_type == "recipient_match":
            for r in record.recipients:
                if re.search(condition_val, r, re.IGNORECASE):
                    return True
            return False

        elif condition_type == "urgency_score_gte":
            if not ai_data or "metadata" not in ai_data:
                return False
            score = ai_data["metadata"].get("urgency_score")
            if score is None:
                return False
            return int(score) >= int(condition_val)

        elif condition_type == "priority_match":
            if not ai_data or not ai_data.get("urgency"):
                return False
            return ai_data.get("urgency", "").strip().lower() == str(condition_val).strip().lower()

        elif condition_type == "intent_match":
            if not ai_data or not ai_data.get("intent"):
                return False
            return ai_data.get("intent", "").strip().lower() == str(condition_val).strip().lower()

        logger.warning(f"Unknown condition type: {condition_type}")
        return False
    except Exception as e:
        logger.error(f"Error evaluating condition {condition_type}: {str(e)}")
        return False

def evaluate_rule_on_email(
    rule: Rule,
    record: CanonicalParsedRecord,
    entity: Optional[Entity],
    ai_data: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Evaluates all conditions in a rule against the parsed email and entity.
    Returns (is_match, outcome_data). All conditions must pass (AND behavior).
    """
    conditions = rule.conditions or {}
    if not conditions:
        return False, None
        
    for cond_type, cond_val in conditions.items():
        if not evaluate_condition(cond_type, cond_val, record, entity, ai_data):
            return False, None
            
    logger.info(f"Rule '{rule.name}' ({rule.id}) matched successfully.")
    return True, rule.outcome

def run_rules_evaluation(
    db: Session,
    tenant_id: str,
    record: CanonicalParsedRecord,
    entity: Optional[Entity],
    ai_data: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Runs all active rules for the given tenant against the parsed record.
    Returns a list of triggered outcomes.
    """
    active_rules = db.query(Rule).filter(
        Rule.tenant_id == tenant_id,
        Rule.is_active == True
    ).all()
    
    triggered_outcomes = []
    for rule in active_rules:
        is_match, outcome = evaluate_rule_on_email(rule, record, entity, ai_data)
        if is_match and outcome:
            # Bind rule_id to the outcome metadata
            outcome_copy = dict(outcome)
            outcome_copy["rule_id"] = rule.id
            outcome_copy["rule_name"] = rule.name
            triggered_outcomes.append(outcome_copy)
            
    return triggered_outcomes

