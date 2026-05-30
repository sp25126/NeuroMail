from abc import ABC, abstractmethod
from typing import List, Optional
import datetime
from sqlalchemy.orm import Session
from models import Mailbox

class MailProviderAdapter(ABC):
    @abstractmethod
    def fetch_messages(self, mailbox: Mailbox, db: Session, since_time: Optional[datetime.datetime] = None) -> List[dict]:
        """
        Fetch new messages from the provider.
        Returns a list of dictionaries, normalized into the following shape:
        {
            "provider_message_id": str,
            "thread_id": str,
            "sender": str,
            "subject": str,
            "body": str,
            "received_at": datetime.datetime,
            "normalized_metadata": dict,
            "attachments": [
                {
                    "filename": str,
                    "content_type": str,
                    "file_size": int,
                    "attachment_id": str  # Provider specific attachment id if any
                }
            ]
        }
        """
        pass

    @abstractmethod
    def send_message(self, mailbox: Mailbox, db: Session, recipient: str, subject: str, body: str) -> dict:
        """
        Send an email via the provider.
        """
        pass

    @abstractmethod
    def refresh_token(self, mailbox: Mailbox, db: Session) -> str:
        """
        Refreshes the provider's access token, decrypting the refresh token, and saving the newly generated access token encrypted.
        Returns the new raw access token.
        """
        pass

    @abstractmethod
    def watch(self, mailbox: Mailbox, db: Session) -> dict:
        """
        Register a push notification subscription with the provider.
        """
        pass

    @abstractmethod
    def unwatch(self, mailbox: Mailbox, db: Session) -> dict:
        """
        Cancel the push notification subscription.
        """
        pass
