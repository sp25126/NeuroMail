from sqlalchemy.orm import Session
from typing import List, Dict, Any
from models import RawEmail

def get_thread_by_id(db: Session, tenant_id: str, thread_id: str) -> Dict[str, Any]:
    """
    Retrieves all messages in a thread for a specific tenant,
    returning a normalized thread representation.
    """
    emails = db.query(RawEmail).filter(
        RawEmail.tenant_id == tenant_id,
        RawEmail.thread_id == thread_id
    ).order_by(RawEmail.received_at.asc()).all()
    
    if not emails:
        return {}
        
    return {
        "thread_id": thread_id,
        "subject": emails[0].subject,
        "mailbox_id": emails[0].mailbox_id,
        "message_count": len(emails),
        "last_message_at": emails[-1].received_at,
        "messages": [
            {
                "id": email.id,
                "provider_message_id": email.provider_message_id,
                "sender": email.sender,
                "subject": email.subject,
                "received_at": email.received_at,
                "snippet": (email.body[:150] + "...") if email.body and len(email.body) > 150 else (email.body or "")
            }
            for email in emails
        ]
    }

def list_threads(db: Session, tenant_id: str) -> List[Dict[str, Any]]:
    """
    Lists unique threads for a tenant by grouping raw emails.
    """
    # Group in python or use SQL query group by thread_id
    # To keep it simple and database-agnostic:
    all_emails = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id).all()
    threads_map = {}
    for email in all_emails:
        t_id = email.thread_id
        if t_id not in threads_map:
            threads_map[t_id] = []
        threads_map[t_id].append(email)
        
    threads = []
    for t_id, emails in threads_map.items():
        emails.sort(key=lambda x: x.received_at)
        threads.append({
            "thread_id": t_id,
            "subject": emails[0].subject,
            "mailbox_id": emails[0].mailbox_id,
            "message_count": len(emails),
            "last_message_at": emails[-1].received_at
        })
    return sorted(threads, key=lambda x: x["last_message_at"], reverse=True)
