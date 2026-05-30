import datetime
import base64
from email.mime.text import MIMEText
import logging
from typing import List, Optional
import requests
from sqlalchemy.orm import Session

from models import Mailbox
from neuromail.core.auth.token_store import encrypt_token, decrypt_token
from neuromail.core.auth import gmail_oauth
from neuromail.core.mailboxes.base_adapter import MailProviderAdapter
from neuromail.core.mailboxes.rate_limiter import execute_with_rate_limit

logger = logging.getLogger("Mailboxes.GmailAdapter")

class GmailAdapter(MailProviderAdapter):
    def _get_headers(self, token: str) -> dict:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    def _get_valid_access_token(self, mailbox: Mailbox, db: Session) -> str:
        # Check if expired or expiring soon (within 5 minutes)
        now = datetime.datetime.utcnow()
        if (not mailbox.encrypted_access_token or 
            not mailbox.access_token_expires_at or 
            mailbox.access_token_expires_at - datetime.timedelta(minutes=5) < now):
            logger.info(f"Gmail access token expired or expiring soon for mailbox {mailbox.id}. Refreshing...")
            self.refresh_token(mailbox, db)
            
        return decrypt_token(mailbox.encrypted_access_token, mailbox.tenant_id)

    def refresh_token(self, mailbox: Mailbox, db: Session) -> str:
        if not mailbox.encrypted_refresh_token:
            raise ValueError(f"No refresh token available for mailbox {mailbox.id}")
        
        refresh_token_raw = decrypt_token(mailbox.encrypted_refresh_token, mailbox.tenant_id)
        tokens = gmail_oauth.refresh_access_token(refresh_token_raw)
        
        access_token = tokens.get("access_token")
        expires_in = tokens.get("expires_in", 3600)
        
        mailbox.encrypted_access_token = encrypt_token(access_token, mailbox.tenant_id)
        mailbox.access_token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
        mailbox.connection_status = "CONNECTED"
        mailbox.error_state = None
        mailbox.updated_at = datetime.datetime.utcnow()
        
        db.commit()
        db.refresh(mailbox)
        logger.info(f"Gmail access token refreshed successfully for mailbox {mailbox.id}")
        return access_token

    def fetch_messages(self, mailbox: Mailbox, db: Session, since_time: Optional[datetime.datetime] = None) -> List[dict]:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        # Build query query string
        params = {"maxResults": 20}
        if since_time:
            # query messages after UNIX timestamp
            params["q"] = f"after:{int(since_time.timestamp())}"
            
        list_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
        
        # We wrap HTTP requests in execute_with_rate_limit
        def _get_list():
            res = requests.get(list_url, headers=headers, params=params, timeout=10)
            res.raise_for_status()
            return res.json()
            
        try:
            list_res = execute_with_rate_limit(mailbox.id, _get_list)
        except Exception as e:
            logger.error(f"Failed to list Gmail messages for mailbox {mailbox.id}: {str(e)}")
            raise e
            
        messages_meta = list_res.get("messages", [])
        normalized_messages = []
        
        for msg_meta in messages_meta:
            msg_id = msg_meta["id"]
            
            def _get_detail():
                detail_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}"
                res = requests.get(detail_url, headers=headers, timeout=10)
                res.raise_for_status()
                return res.json()
                
            try:
                msg_detail = execute_with_rate_limit(mailbox.id, _get_detail)
            except Exception as e:
                logger.warning(f"Failed to fetch Gmail message details for {msg_id}: {str(e)}")
                continue
                
            normalized = self._normalize_message(msg_detail)
            normalized_messages.append(normalized)
            
        return normalized_messages

    def fetch_messages_by_history(self, mailbox: Mailbox, db: Session, history_id: str) -> List[dict]:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        url = "https://gmail.googleapis.com/gmail/v1/users/me/history"
        params = {
            "startHistoryId": history_id,
            "historyTypes": "messageAdded"
        }
        
        def _get_history():
            res = requests.get(url, headers=headers, params=params, timeout=10)
            res.raise_for_status()
            return res.json()
            
        try:
            history_res = execute_with_rate_limit(mailbox.id, _get_history)
        except Exception as e:
            # Check if 410 (History too old), if so fall back to normal fetch
            if hasattr(e, "response") and e.response is not None and e.response.status_code == 410:
                logger.warning(f"Gmail history ID {history_id} expired (410) for mailbox {mailbox.id}. Falling back to full sync.")
                return self.fetch_messages(mailbox, db, since_time=mailbox.last_sync_time)
            logger.error(f"Failed to fetch Gmail history for mailbox {mailbox.id}: {str(e)}")
            raise e
            
        history_records = history_res.get("history", [])
        message_ids = set()
        
        for record in history_records:
            messages_added = record.get("messagesAdded", [])
            for added in messages_added:
                msg = added.get("message", {})
                if msg.get("id"):
                    message_ids.add(msg["id"])
                    
        normalized_messages = []
        for msg_id in message_ids:
            def _get_detail():
                detail_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}"
                res = requests.get(detail_url, headers=headers, timeout=10)
                res.raise_for_status()
                return res.json()
                
            try:
                msg_detail = execute_with_rate_limit(mailbox.id, _get_detail)
                normalized = self._normalize_message(msg_detail)
                normalized_messages.append(normalized)
            except Exception as e:
                logger.warning(f"Failed to fetch Gmail message details for {msg_id}: {str(e)}")
                continue
                
        return normalized_messages

    def send_message(self, mailbox: Mailbox, db: Session, recipient: str, subject: str, body: str) -> dict:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        mime_message = MIMEText(body)
        mime_message["to"] = recipient
        mime_message["subject"] = subject
        raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()
        
        def _send():
            send_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
            res = requests.post(send_url, headers=headers, json={"raw": raw}, timeout=10)
            res.raise_for_status()
            return res.json()
            
        try:
            return execute_with_rate_limit(mailbox.id, _send)
        except Exception as e:
            logger.error(f"Failed to send Gmail message from mailbox {mailbox.id}: {str(e)}")
            raise e

    def watch(self, mailbox: Mailbox, db: Session) -> dict:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        # We point to a Pub/Sub topic configured in environment or default
        topic_name = "projects/mock-project/topics/neuromail-pubsub"
        payload = {
            "topicName": topic_name,
            "labelIds": ["INBOX"]
        }
        
        def _watch():
            watch_url = "https://gmail.googleapis.com/gmail/v1/users/me/watch"
            res = requests.post(watch_url, headers=headers, json=payload, timeout=10)
            res.raise_for_status()
            return res.json()
            
        try:
            watch_res = execute_with_rate_limit(mailbox.id, _watch)
            # Update history_id and subscription
            mailbox.last_history_id = watch_res.get("historyId")
            mailbox.webhook_subscription_id = topic_name
            # Gmail watch lasts for 7 days
            mailbox.webhook_subscription_expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)
            db.commit()
            return watch_res
        except Exception as e:
            logger.error(f"Failed to watch Gmail mailbox {mailbox.id}: {str(e)}")
            raise e

    def unwatch(self, mailbox: Mailbox, db: Session) -> dict:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        def _stop():
            stop_url = "https://gmail.googleapis.com/gmail/v1/users/me/stop"
            res = requests.post(stop_url, headers=headers, timeout=10)
            if res.status_code != 204 and res.status_code != 200:
                res.raise_for_status()
            return {"status": "success"}
            
        try:
            res = execute_with_rate_limit(mailbox.id, _stop)
            mailbox.webhook_subscription_id = None
            mailbox.webhook_subscription_expires_at = None
            db.commit()
            return res
        except Exception as e:
            logger.error(f"Failed to unwatch Gmail mailbox {mailbox.id}: {str(e)}")
            raise e

    def _normalize_message(self, msg: dict) -> dict:
        """
        Normalize Gmail response structure to standard format
        """
        payload = msg.get("payload", {})
        headers = payload.get("headers", [])
        
        # Extract metadata from headers
        headers_dict = {h["name"].lower(): h["value"] for h in headers}
        
        sender = headers_dict.get("from", "unknown@sender.com")
        subject = headers_dict.get("subject", "No Subject")
        
        # Extract body
        body = msg.get("snippet", "")
        # Parse payload parts if text/plain or text/html is present
        parts = payload.get("parts", [])
        if not parts and payload.get("body", {}).get("data"):
            # Simple message with no parts
            body_data = payload["body"]["data"]
            try:
                body = base64.urlsafe_b64decode(body_data).decode(errors="ignore")
            except Exception:
                pass
        else:
            # Complex multipart message
            flat_parts = []
            def collect_parts(pts):
                for p in pts:
                    if p.get("parts"):
                        collect_parts(p["parts"])
                    else:
                        flat_parts.append(p)
            collect_parts(parts)
            
            # Prefer text/html, fallback to text/plain
            html_part = next((p for p in flat_parts if p.get("mimeType") == "text/html"), None)
            plain_part = next((p for p in flat_parts if p.get("mimeType") == "text/plain"), None)
            
            pref_part = html_part or plain_part
            if pref_part and pref_part.get("body", {}).get("data"):
                try:
                    body = base64.urlsafe_b64decode(pref_part["body"]["data"]).decode(errors="ignore")
                except Exception:
                    pass

        # Parse date
        internal_date_str = msg.get("internalDate")
        if internal_date_str:
            received_at = datetime.datetime.utcfromtimestamp(int(internal_date_str) / 1000.0)
        else:
            received_at = datetime.datetime.utcnow()

        # Parse attachments
        attachments = []
        if parts:
            def find_attachments(pts):
                for p in pts:
                    if p.get("filename") and p.get("body", {}).get("attachmentId"):
                        attachments.append({
                            "filename": p["filename"],
                            "content_type": p["mimeType"],
                            "file_size": p["body"].get("size", 0),
                            "attachment_id": p["body"]["attachmentId"]
                        })
                    if p.get("parts"):
                        find_attachments(p["parts"])
            find_attachments(parts)

        return {
            "provider_message_id": msg["id"],
            "thread_id": msg["threadId"],
            "sender": sender,
            "subject": subject,
            "body": body,
            "received_at": received_at,
            "normalized_metadata": {
                "historyId": msg.get("historyId"),
                "labelIds": msg.get("labelIds", [])
            },
            "attachments": attachments
        }
