import datetime
import logging
from typing import List, Optional
import requests
from sqlalchemy.orm import Session

from models import Mailbox
from neuromail.core.auth.token_store import encrypt_token, decrypt_token
from neuromail.core.auth import outlook_oauth
from neuromail.core.mailboxes.base_adapter import MailProviderAdapter
from neuromail.core.mailboxes.rate_limiter import execute_with_rate_limit

logger = logging.getLogger("Mailboxes.OutlookAdapter")

class OutlookAdapter(MailProviderAdapter):
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
            logger.info(f"Outlook access token expired or expiring soon for mailbox {mailbox.id}. Refreshing...")
            self.refresh_token(mailbox, db)
            
        return decrypt_token(mailbox.encrypted_access_token, mailbox.tenant_id)

    def refresh_token(self, mailbox: Mailbox, db: Session) -> str:
        if not mailbox.encrypted_refresh_token:
            raise ValueError(f"No refresh token available for mailbox {mailbox.id}")
            
        refresh_token_raw = decrypt_token(mailbox.encrypted_refresh_token, mailbox.tenant_id)
        try:
            tokens = outlook_oauth.refresh_access_token(refresh_token_raw)
        except Exception as e:
            # Detect revocation in Graph (invalid_grant is common for revoked tokens)
            if "invalid_grant" in str(e).lower() or "revoked" in str(e).lower():
                logger.error(f"Outlook refresh token revoked for mailbox {mailbox.id}. Marking DISCONNECTED.")
                mailbox.connection_status = "DISCONNECTED"
                mailbox.error_state = "Authentication revoked by provider."
                db.commit()
            raise e
        
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)
        
        mailbox.encrypted_access_token = encrypt_token(access_token, mailbox.tenant_id)
        if refresh_token:
            mailbox.encrypted_refresh_token = encrypt_token(refresh_token, mailbox.tenant_id)
            
        mailbox.access_token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
        mailbox.connection_status = "CONNECTED"
        mailbox.error_state = None
        mailbox.updated_at = datetime.datetime.utcnow()
        
        db.commit()
        db.refresh(mailbox)
        logger.info(f"Outlook access token refreshed successfully for mailbox {mailbox.id}")
        return access_token

    def fetch_messages(self, mailbox: Mailbox, db: Session, since_time: Optional[datetime.datetime] = None) -> dict:
        """
        Fetch new messages and return them in a standard format.
        Returns: {"messages": List[dict]}
        """
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        params = {
            "$top": 20,
            "$select": "id,conversationId,subject,body,from,receivedDateTime,hasAttachments"
        }
        if since_time:
            # Graph OData filter: receivedDateTime ge YYYY-MM-DDTHH:MM:SSZ
            time_str = since_time.strftime("%Y-%m-%dT%H:%M:%SZ")
            params["$filter"] = f"receivedDateTime ge {time_str}"
            
        list_url = "https://graph.microsoft.com/v1.0/me/messages"
        
        def _get_list():
            res = requests.get(list_url, headers=headers, params=params, timeout=10)
            res.raise_for_status()
            return res.json()
            
        try:
            list_res = execute_with_rate_limit(mailbox.id, _get_list)
        except Exception as e:
            logger.error(f"Failed to list Outlook messages for mailbox {mailbox.id}: {str(e)}")
            raise e
            
        messages_val = list_res.get("value", [])
        normalized_messages = []
        
        for msg in messages_val:
            attachments = []
            if msg.get("hasAttachments"):
                msg_id = msg["id"]
                def _get_attachments():
                    att_url = f"https://graph.microsoft.com/v1.0/me/messages/{msg_id}/attachments"
                    res = requests.get(att_url, headers=headers, timeout=10)
                    res.raise_for_status()
                    return res.json()
                    
                try:
                    att_res = execute_with_rate_limit(mailbox.id, _get_attachments)
                    for att in att_res.get("value", []):
                        attachments.append({
                            "filename": att.get("name", "unnamed"),
                            "content_type": att.get("contentType", "application/octet-stream"),
                            "file_size": att.get("size", 0),
                            "attachment_id": att.get("id")
                        })
                except Exception as e:
                    logger.warning(f"Failed to fetch attachments for Outlook message {msg_id}: {str(e)}")
                    
            normalized = self._normalize_message(msg, attachments)
            normalized_messages.append(normalized)
            
        return {"messages": normalized_messages}

    def renew_subscription(self, mailbox: Mailbox, db: Session) -> dict:
        """
        Renews an existing Outlook subscription before it expires.
        """
        if not mailbox.webhook_subscription_id:
            return self.watch(mailbox, db)
            
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        sub_id = mailbox.webhook_subscription_id
        # Max extension is 4230 minutes
        expiration = datetime.datetime.utcnow() + datetime.timedelta(days=2)
        expiration_str = expiration.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        payload = {
            "expirationDateTime": expiration_str
        }
        
        def _renew():
            renew_url = f"https://graph.microsoft.com/v1.0/subscriptions/{sub_id}"
            res = requests.patch(renew_url, headers=headers, json=payload, timeout=10)
            res.raise_for_status()
            return res.json()
            
        try:
            renew_res = execute_with_rate_limit(mailbox.id, _renew)
            mailbox.webhook_subscription_expires_at = expiration
            db.commit()
            logger.info(f"Outlook subscription {sub_id} renewed for mailbox {mailbox.id}")
            return renew_res
        except Exception as e:
            # If 404, subscription might have been deleted/expired, recreate it
            if hasattr(e, "response") and e.response is not None and e.response.status_code == 404:
                logger.warning(f"Outlook subscription {sub_id} not found during renewal. Recreating...")
                return self.watch(mailbox, db)
            logger.error(f"Failed to renew Outlook subscription for mailbox {mailbox.id}: {str(e)}")
            raise e

    def send_message(self, mailbox: Mailbox, db: Session, recipient: str, subject: str, body: str) -> dict:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        payload = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "Text",
                    "content": body
                },
                "toRecipients": [
                    {
                        "emailAddress": {
                            "address": recipient
                        }
                    }
                ]
            }
        }
        
        def _send():
            send_url = "https://graph.microsoft.com/v1.0/me/sendMail"
            res = requests.post(send_url, headers=headers, json=payload, timeout=10)
            res.raise_for_status()
            return {"status": "success"}
            
        try:
            return execute_with_rate_limit(mailbox.id, _send)
        except Exception as e:
            logger.error(f"Failed to send Outlook message from mailbox {mailbox.id}: {str(e)}")
            raise e

    def watch(self, mailbox: Mailbox, db: Session) -> dict:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        # In a real environment, we'd use a public endpoint from settings/ngrok
        # For testing/mocking, we can use a dummy callback URL
        notification_url = "https://neuromail.example.com/webhooks/outlook"
        
        # Subscription expires in 4230 minutes max (2.9 days)
        expiration = datetime.datetime.utcnow() + datetime.timedelta(days=2)
        expiration_str = expiration.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        payload = {
            "changeType": "created",
            "notificationUrl": notification_url,
            "resource": "me/messages",
            "expirationDateTime": expiration_str,
            "clientState": mailbox.id
        }
        
        def _subscribe():
            sub_url = "https://graph.microsoft.com/v1.0/subscriptions"
            res = requests.post(sub_url, headers=headers, json=payload, timeout=10)
            res.raise_for_status()
            return res.json()
            
        try:
            sub_res = execute_with_rate_limit(mailbox.id, _subscribe)
            mailbox.webhook_subscription_id = sub_res.get("id")
            mailbox.webhook_subscription_expires_at = expiration
            db.commit()
            return sub_res
        except Exception as e:
            logger.error(f"Failed to create Outlook subscription for mailbox {mailbox.id}: {str(e)}")
            raise e

    def unwatch(self, mailbox: Mailbox, db: Session) -> dict:
        token = self._get_valid_access_token(mailbox, db)
        headers = self._get_headers(token)
        
        if not mailbox.webhook_subscription_id:
            return {"status": "success", "message": "No active subscription"}
            
        sub_id = mailbox.webhook_subscription_id
        
        def _delete_sub():
            del_url = f"https://graph.microsoft.com/v1.0/subscriptions/{sub_id}"
            res = requests.delete(del_url, headers=headers, timeout=10)
            if res.status_code != 204 and res.status_code != 200:
                res.raise_for_status()
            return {"status": "success"}
            
        try:
            res = execute_with_rate_limit(mailbox.id, _delete_sub)
            mailbox.webhook_subscription_id = None
            mailbox.webhook_subscription_expires_at = None
            db.commit()
            return res
        except Exception as e:
            logger.error(f"Failed to delete Outlook subscription for mailbox {mailbox.id}: {str(e)}")
            raise e

    def _normalize_message(self, msg: dict, attachments: list) -> dict:
        """
        Normalize Outlook (MS Graph) message JSON to standard schema format
        """
        sender_obj = msg.get("from", {}).get("emailAddress", {})
        sender = sender_obj.get("address") or sender_obj.get("name") or "unknown@sender.com"
        
        subject = msg.get("subject", "No Subject")
        
        body_obj = msg.get("body", {})
        body = body_obj.get("content", "")
        
        received_time_str = msg.get("receivedDateTime")
        if received_time_str:
            # Parse Graph received time format e.g. 2026-05-30T10:15:30Z
            try:
                # Graph time strings might end in Z or .0000000Z
                cleaned_time = received_time_str.split(".")[0].rstrip("Z")
                received_at = datetime.datetime.strptime(cleaned_time, "%Y-%m-%dT%H:%M:%S")
            except Exception:
                received_at = datetime.datetime.utcnow()
        else:
            received_at = datetime.datetime.utcnow()
            
        return {
            "provider_message_id": msg["id"],
            "thread_id": msg["conversationId"],
            "sender": sender,
            "subject": subject,
            "body": body,
            "received_at": received_at,
            "normalized_metadata": {
                "hasAttachments": msg.get("hasAttachments", False)
            },
            "attachments": attachments
        }
