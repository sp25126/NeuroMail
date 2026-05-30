import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from models import RawEmail, Entity, Event, Alert, Rule, ReviewItem

def search_all_objects(
    db: Session,
    tenant_id: str,
    query_str: Optional[str] = None,
    object_types: Optional[List[str]] = None,
    start_date: Optional[datetime.datetime] = None,
    end_date: Optional[datetime.datetime] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Search and filter cross-object service covering emails, entities, events, rules, and alerts.
    Enforces strict tenant scoping.
    """
    results = {}
    
    if not object_types:
        object_types = ["emails", "entities", "events", "alerts", "rules", "reviews"]

    # 1. Search Raw Emails
    if "emails" in object_types:
        q = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id)
        if query_str:
            q = q.filter(or_(
                RawEmail.sender.ilike(f"%{query_str}%"),
                RawEmail.subject.ilike(f"%{query_str}%"),
                RawEmail.body.ilike(f"%{query_str}%")
            ))
        if start_date:
            q = q.filter(RawEmail.received_at >= start_date)
        if end_date:
            q = q.filter(RawEmail.received_at <= end_date)
        emails = q.order_by(RawEmail.received_at.desc()).limit(50).all()
        results["emails"] = [
            {
                "id": e.id,
                "sender": e.sender,
                "subject": e.subject,
                "received_at": e.received_at.isoformat(),
                "thread_id": e.thread_id,
                "message_id": e.provider_message_id
            }
            for e in emails
        ]

    # 2. Search Entities
    if "entities" in object_types:
        q = db.query(Entity).filter(Entity.tenant_id == tenant_id)
        if query_str:
            q = q.filter(Entity.identity.ilike(f"%{query_str}%"))
        if status:
            q = q.filter(Entity.status == status)
        if start_date:
            q = q.filter(Entity.created_at >= start_date)
        if end_date:
            q = q.filter(Entity.created_at <= end_date)
        entities = q.order_by(Entity.created_at.desc()).limit(50).all()
        results["entities"] = [
            {
                "id": ent.id,
                "identity": ent.identity,
                "status": ent.status,
                "source_reference": ent.source_reference,
                "created_at": ent.created_at.isoformat()
            }
            for ent in entities
        ]

    # 3. Search Alerts
    if "alerts" in object_types:
        q = db.query(Alert).filter(Alert.tenant_id == tenant_id)
        if query_str:
            q = q.filter(or_(
                Alert.alert_type.ilike(f"%{query_str}%"),
                Alert.message.ilike(f"%{query_str}%")
            ))
        if status:
            q = q.filter(Alert.status == status)
        if severity:
            q = q.filter(Alert.severity == severity)
        if start_date:
            q = q.filter(Alert.created_at >= start_date)
        if end_date:
            q = q.filter(Alert.created_at <= end_date)
        alerts = q.order_by(Alert.created_at.desc()).limit(50).all()
        results["alerts"] = [
            {
                "id": a.id,
                "entity_id": a.entity_id,
                "rule_id": a.rule_id,
                "alert_type": a.alert_type,
                "message": a.message,
                "status": a.status,
                "severity": a.severity,
                "occurrence_count": a.occurrence_count,
                "created_at": a.created_at.isoformat()
            }
            for a in alerts
        ]

    # 4. Search Events
    if "events" in object_types:
        q = db.query(Event).filter(Event.tenant_id == tenant_id)
        if query_str:
            q = q.filter(Event.event_type.ilike(f"%{query_str}%"))
        if start_date:
            q = q.filter(Event.created_at >= start_date)
        if end_date:
            q = q.filter(Event.created_at <= end_date)
        events = q.order_by(Event.created_at.desc()).limit(50).all()
        results["events"] = [
            {
                "id": ev.id,
                "entity_id": ev.entity_id,
                "event_type": ev.event_type,
                "source": ev.source,
                "created_by": ev.created_by,
                "created_at": ev.created_at.isoformat()
            }
            for ev in events
        ]

    # 5. Search Rules
    if "rules" in object_types:
        q = db.query(Rule).filter(Rule.tenant_id == tenant_id)
        if query_str:
            q = q.filter(Rule.name.ilike(f"%{query_str}%"))
        rules = q.limit(50).all()
        results["rules"] = [
            {
                "id": r.id,
                "name": r.name,
                "is_active": r.is_active,
                "created_at": r.created_at.isoformat()
            }
            for r in rules
        ]

    # 6. Search Review Items
    if "reviews" in object_types:
        q = db.query(ReviewItem).filter(ReviewItem.tenant_id == tenant_id)
        if status:
            q = q.filter(ReviewItem.status == status)
        if query_str:
            q = q.filter(ReviewItem.reason.ilike(f"%{query_str}%"))
        reviews = q.order_by(ReviewItem.created_at.desc()).limit(50).all()
        results["reviews"] = [
            {
                "id": rv.id,
                "object_type": rv.object_type,
                "object_id": rv.object_id,
                "status": rv.status,
                "confidence_score": rv.confidence_score,
                "reason": rv.reason,
                "created_at": rv.created_at.isoformat()
            }
            for rv in reviews
        ]

    return results
