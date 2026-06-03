import uuid
import logging
import requests
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models import Alert, NotificationChannel, NotificationLog, User, NotificationPreference

logger = logging.getLogger("RawEmail.NotificationService")

def is_in_mute_window(window: dict, current_time: datetime.time) -> bool:
    start_str = window.get("start")
    end_str = window.get("end")
    if not start_str or not end_str:
        return False
    try:
        start_t = datetime.time.fromisoformat(start_str)
        end_t = datetime.time.fromisoformat(end_str)
        if start_t <= end_t:
            return start_t <= current_time <= end_t
        else: # spans midnight
            return current_time >= start_t or current_time <= end_t
    except Exception:
        return False

def dispatch_notifications_for_alert(db: Session, tenant_id: str, alert: Alert):
    """
    Finds active notification channels for tenant, applies user preferences / mute windows,
    and schedules/triggers dispatch.
    """
    users = db.query(User).filter(User.tenant_id == tenant_id).all()
    
    severity_map = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
    alert_severity_num = severity_map.get(alert.severity.upper(), 2)

    allowed_channel_types = set()
    has_any_preferences = False
    current_utc_time = datetime.datetime.utcnow().time()

    for user in users:
        pref = db.query(NotificationPreference).filter(
            NotificationPreference.user_id == user.id,
            NotificationPreference.tenant_id == tenant_id
        ).first()
        
        if pref:
            has_any_preferences = True
            
            # Check severity threshold
            pref_severity_num = severity_map.get(pref.severity_threshold.upper(), 1)
            if alert_severity_num < pref_severity_num:
                continue
                
            # Check mute windows
            is_muted = False
            if pref.mute_windows:
                for window in pref.mute_windows:
                    if is_in_mute_window(window, current_utc_time):
                        is_muted = True
                        break
            if is_muted:
                continue
                
            for ch in pref.enabled_channels:
                allowed_channel_types.add(ch.upper())

    # Get all active channels for the tenant
    channels = db.query(NotificationChannel).filter(
        NotificationChannel.tenant_id == tenant_id,
        NotificationChannel.is_active == True
    ).all()

    if has_any_preferences:
        channels = [c for c in channels if c.channel_type.upper() in allowed_channel_types]
    
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
                    
                res = requests.post(webhook_url, json=payload, timeout=5)
                res.raise_for_status()
                return True
                    
            elif channel_type == "WEBHOOK":
                webhook_url = config.get("webhook_url")
                if not webhook_url:
                    logger.error(f"Webhook URL missing in channel {channel.id}")
                    return False
                    
                res = requests.post(webhook_url, json=payload, timeout=5)
                res.raise_for_status()
                return True
                    
            elif channel_type == "EMAIL":
                # Real SMTP dispatch should go here. 
                # For now, we log that dispatch is required, avoiding fake 'SENT' status.
                logger.warning(f"Email dispatch requested for {config.get('email_recipient')} but SMTP is not yet configured.")
                return False
                
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
