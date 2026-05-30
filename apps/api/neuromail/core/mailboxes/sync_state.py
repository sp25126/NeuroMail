import datetime
from sqlalchemy.orm import Session
from models import Mailbox

def get_last_sync_time(db: Session, mailbox_id: str) -> datetime.datetime:
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id).first()
    if not mailbox:
        raise ValueError("Mailbox not found")
    return mailbox.last_sync_time

def update_last_sync_time(db: Session, mailbox_id: str, sync_time: datetime.datetime):
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id).first()
    if not mailbox:
        raise ValueError("Mailbox not found")
    mailbox.last_sync_time = sync_time
    mailbox.updated_at = datetime.datetime.utcnow()
    db.commit()
