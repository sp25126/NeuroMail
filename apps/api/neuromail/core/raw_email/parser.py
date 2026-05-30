import logging
import datetime
from typing import List, Dict, Any, Optional
from models import RawEmail

logger = logging.getLogger("RawEmail.Parser")

class CanonicalParsedRecord:
    def __init__(
        self,
        raw_email_id: str,
        sender: str,
        recipients: List[str],
        cc: List[str],
        bcc: List[str],
        subject: str,
        body_text: str,
        received_at: datetime.datetime,
        thread_id: str,
        message_id: str,
        attachments: List[Dict[str, Any]],
        metadata: Dict[str, Any]
    ):
        self.raw_email_id = raw_email_id
        self.sender = sender
        self.recipients = recipients
        self.cc = cc
        self.bcc = bcc
        self.subject = subject
        self.body_text = body_text
        self.received_at = received_at
        self.thread_id = thread_id
        self.message_id = message_id
        self.attachments = attachments
        self.metadata = metadata

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_email_id": self.raw_email_id,
            "sender": self.sender,
            "recipients": self.recipients,
            "cc": self.cc,
            "bcc": self.bcc,
            "subject": self.subject,
            "body_text": self.body_text,
            "received_at": self.received_at.isoformat() if isinstance(self.received_at, datetime.datetime) else self.received_at,
            "thread_id": self.thread_id,
            "message_id": self.message_id,
            "attachments": self.attachments,
            "metadata": self.metadata
        }

def parse_raw_email(raw_email: RawEmail) -> CanonicalParsedRecord:
    """
    Deterministic, idempotent parser that converts a RawEmail DB record into a
    CanonicalParsedRecord structure. Safe to run multiple times.
    """
    if not raw_email:
        raise ValueError("Raw email cannot be None")

    metadata = raw_email.normalized_metadata or {}
    
    recipients = []
    cc = []
    bcc = []
    
    # 1. Parse recipients, cc, bcc from metadata (handling Gmail/Outlook variations)
    # Check Outlook-style recipients
    if "toRecipients" in metadata:
        for r in metadata["toRecipients"]:
            addr = r.get("emailAddress", {}).get("address")
            if addr:
                recipients.append(addr)
    elif "to" in metadata:
        if isinstance(metadata["to"], list):
            recipients.extend(metadata["to"])
        elif isinstance(metadata["to"], str):
            recipients.append(metadata["to"])

    if "ccRecipients" in metadata:
        for r in metadata["ccRecipients"]:
            addr = r.get("emailAddress", {}).get("address")
            if addr:
                cc.append(addr)
    elif "cc" in metadata:
        if isinstance(metadata["cc"], list):
            cc.extend(metadata["cc"])
        elif isinstance(metadata["cc"], str):
            cc.append(metadata["cc"])

    if "bccRecipients" in metadata:
        for r in metadata["bccRecipients"]:
            addr = r.get("emailAddress", {}).get("address")
            if addr:
                bcc.append(addr)
    elif "bcc" in metadata:
        if isinstance(metadata["bcc"], list):
            bcc.extend(metadata["bcc"])
        elif isinstance(metadata["bcc"], str):
            bcc.append(metadata["bcc"])

    # Fallback to parsing headers if available
    headers = metadata.get("headers", {})
    if isinstance(headers, list):
        # Convert headers list of dicts to flat dictionary
        headers = {h.get("name", "").lower(): h.get("value", "") for h in headers}

    if not recipients and "to" in headers:
        recipients = [r.strip() for r in headers["to"].split(",") if r.strip()]
    if not cc and "cc" in headers:
        cc = [r.strip() for r in headers["cc"].split(",") if r.strip()]
    if not bcc and "bcc" in headers:
        bcc = [r.strip() for r in headers["bcc"].split(",") if r.strip()]

    # Extract attachments metadata
    attachments = []
    if raw_email.attachments:
        for att in raw_email.attachments:
            attachments.append({
                "id": att.id,
                "filename": att.filename,
                "content_type": att.content_type,
                "file_size": att.file_size
            })
            
    # Compile remaining headers / technical metadata
    tech_metadata = {
        "history_id": metadata.get("historyId"),
        "label_ids": metadata.get("labelIds", []),
        "internet_message_id": headers.get("message-id"),
        "references": headers.get("references"),
        "in_reply_to": headers.get("in-reply-to")
    }

    return CanonicalParsedRecord(
        raw_email_id=raw_email.id,
        sender=raw_email.sender,
        recipients=recipients,
        cc=cc,
        bcc=bcc,
        subject=raw_email.subject or "",
        body_text=raw_email.body or "",
        received_at=raw_email.received_at,
        thread_id=raw_email.thread_id,
        message_id=raw_email.provider_message_id,
        attachments=attachments,
        metadata=tech_metadata
    )
