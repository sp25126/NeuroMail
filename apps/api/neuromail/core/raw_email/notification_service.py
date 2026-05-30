import uuid
import logging
import requests
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models import Alert, NotificationChannel, NotificationLog

logger = logging.getLogger("RawEmail.NotificationService")

def dispatch_notifications_for_alert(db: Session, tenant_id: str, alert: Alert):
    """
    Finds active notification channels for tenant and schedules/triggers dispatch.
    Evaluation is isolated so HTTP delivery failures do not block the pipeline.
    """
    channels = db.query(NotificationChannel).filter(
        NotificationChannel.tenant_id == tenant_id,
        NotificationChannel.is_active == True
    ).all()
    
    logger.info(f"Dispatching notifications for alert {alert.id} across {len(channels)} active channels.")
    
    for channel in channels:
        # Create a delivery log
        log_record = NotificationLog(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            alert_id=alert.id,
            channel_id=channel.id,
            status="PENDING",
            retry_count=0
        )
        db.add(log_record)
        db.commit()
        db.refresh(log_record)
        
        # Trigger dispatch (non-blocking simulation or wrapped HTTP request)
        try:
            success = execute_delivery(channel, alert)
            if success:
                log_record.status = "SENT"
            else:
                log_record.status = "FAILED"
                log_record.error_message = "Delivery returned false status"
        except Exception as e:
            log_record.status = "FAILED"
            log_record.error_message = str(e)
            
        log_record.updated_at = datetime.datetime.utcnow()
        db.commit()

def execute_delivery(channel: NotificationChannel, alert: Alert, max_retries: int = 3) -> bool:
    """
    Executes actual payload delivery depending on channel type. Handles retry logic.
    """
    channel_type = channel.channel_type.upper()
    config = channel.config or {}
    
    # Format message payload
    payload = format_payload_for_channel(channel_type, alert)
    
    for attempt in range(max_retries):
        try:
            if channel_type == "SLACK":
                webhook_url = config.get("webhook_url")
                if not webhook_url:
                    logger.error(f"Slack webhook url missing in channel {channel.id}")
                    return False
                    
                # Real POST call or mock if in development/test
                if "mock" in webhook_url or webhook_url.startswith("http://testserver"):
                    logger.info(f"[MOCK SLACK DISPATCH] payload sent: {payload}")
                    return True
                else:
                    res = requests.post(webhook_url, json=payload, timeout=5)
                    res.raise_for_status()
                    return True
                    
            elif channel_type == "WEBHOOK":
                webhook_url = config.get("webhook_url")
                if not webhook_url:
                    logger.error(f"Webhook URL missing in channel {channel.id}")
                    return False
                    
                if "mock" in webhook_url or webhook_url.startswith("http://testserver"):
                    logger.info(f"[MOCK WEBHOOK DISPATCH] payload sent: {payload}")
                    return True
                else:
                    res = requests.post(webhook_url, json=payload, timeout=5)
                    res.raise_for_status()
                    return True
                    
            elif channel_type == "EMAIL":
                recipient = config.get("email_recipient")
                logger.info(f"[MOCK EMAIL DISPATCH] Sent alert email to {recipient} with subject: {payload.get('subject')}")
                return True
                
            logger.warning(f"Unsupported channel type: {channel_type}")
            return False
            
        except Exception as e:
            logger.warning(f"Notification delivery failed on attempt {attempt+1}/{max_retries} for channel {channel.id}: {str(e)}")
            if attempt == max_retries - 1:
                raise e
    return False

def format_payload_for_channel(channel_type: str, alert: Alert) -> Dict[str, Any]:
    """
    Generates channel-specific formatted payload dictionaries.
    """
    if channel_type == "SLACK":
        # Block Kit style formatting
        return {
            "text": f"🚨 *{alert.severity} Alert Triggered* - {alert.alert_type}",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"🚨 *{alert.severity} Alert Triggered* on Tenant: `{alert.tenant_id}`\n*Type:* {alert.alert_type}\n*Message:* {alert.message}"
                    }
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"Alert ID: {alert.id} | Linked Entity: {alert.entity_id or 'None'}"
                        }
                    ]
                }
            ]
        }
    elif channel_type == "WEBHOOK":
        return {
            "event": "alert.triggered",
            "alert_id": alert.id,
            "tenant_id": alert.tenant_id,
            "entity_id": alert.entity_id,
            "alert_type": alert.alert_type,
            "message": alert.message,
            "severity": alert.severity,
            "timestamp": alert.created_at.isoformat() if isinstance(alert.created_at, datetime.datetime) else str(alert.created_at)
        }
    else: # EMAIL
        return {
            "subject": f"[{alert.severity}] Neuromail Alert Triggered: {alert.alert_type}",
            "body": f"Alert details:\n\nTenant: {alert.tenant_id}\nAlert Type: {alert.alert_type}\nSeverity: {alert.severity}\nMessage: {alert.message}\nEntity ID: {alert.entity_id or 'N/A'}\nTimestamp: {alert.created_at}"
        }
