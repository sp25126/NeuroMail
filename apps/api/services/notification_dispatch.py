import uuid
from datetime import datetime
import time
import httpx
import logging
from typing import Optional, List
from sqlalchemy.orm import Session

from models import FreightAlert, FreightTenantConfig, FreightNotificationLog

logger = logging.getLogger("Freight.NotificationDispatch")

def is_in_mute_window(hour: int, start: Optional[int], end: Optional[int]) -> bool:
    """
    Checks if the given hour is inside the mute window.
    Handles mute windows that cross midnight (e.g. 23:00 to 07:00).
    """
    if start is None or end is None:
        return False
        
    if start <= end:
        return start <= hour < end
    else: # Crosses midnight
        return hour >= start or hour < end

def send_slack_webhook(url: str, alert: FreightAlert) -> bool:
    payload = {
        "text": f"*[{alert.severity.upper()}] {alert.title}*\n{alert.description}\nShipment ID: {alert.shipment_id}"
    }
    response = httpx.post(url, json=payload, timeout=5.0)
    response.raise_for_status()
    return True

def send_external_webhook(url: str, alert: FreightAlert) -> bool:
    payload = {
        "alert_id": str(alert.id),
        "shipment_id": str(alert.shipment_id),
        "rule_type": alert.rule_type,
        "severity": alert.severity,
        "title": alert.title,
        "description": alert.description,
        "created_at": alert.created_at.isoformat()
    }
    response = httpx.post(url, json=payload, timeout=5.0)
    response.raise_for_status()
    return True

def send_email_alert(emails: List[str], alert: FreightAlert) -> bool:
    # Render basic HTML or text body
    subject = f"[{alert.severity.upper()}] {alert.title}"
    body = (
        f"Alert: {alert.title}\n"
        f"Severity: {alert.severity.upper()}\n"
        f"Rule triggered: {alert.rule_type}\n"
        f"Description: {alert.description}\n"
        f"Shipment ID: {alert.shipment_id}\n"
    )
    # Simulated SMTP send logic
    logger.info(f"Simulating email send to {emails} - Subject: {subject}")
    # In a real environment, smtplib would be used.
    return True

def dispatch_notifications(db: Session, tenant_id: str, alert: FreightAlert) -> dict:
    """
    Main dispatch service that checks tenant config, validates mute windows,
    makes channel calls with retries, and registers logs.
    """
    now = datetime.utcnow()
    
    # 1. Fetch tenant config
    config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    if not config:
        logger.info(f"No FreightTenantConfig found for tenant {tenant_id}. Skipping notifications.")
        return {"status": "no_config"}
        
    # 2. Check severity threshold
    severities = ["low", "medium", "high", "critical"]
    try:
        config_idx = severities.index(config.alert_severity_threshold.lower())
        alert_idx = severities.index(alert.severity.lower())
    except ValueError:
        config_idx = 0
        alert_idx = 0
        
    if alert_idx < config_idx:
        logger.info(f"Alert severity {alert.severity} is below tenant threshold {config.alert_severity_threshold}. Skipping.")
        return {"status": "below_threshold"}

    # 3. Check Mute Window
    current_hour = now.hour
    if is_in_mute_window(current_hour, config.mute_start_hour, config.mute_end_hour):
        logger.info(f"Current hour {current_hour} is inside the mute window ({config.mute_start_hour}-{config.mute_end_hour}). Suppressing dispatch.")
        # Log as suppressed
        log = FreightNotificationLog(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            alert_id=alert.id,
            channel="all",
            destination="suppressed_mute_window",
            status="suppressed",
            created_at=now,
            updated_at=now
        )
        db.add(log)
        db.commit()
        return {"status": "suppressed"}

    channels_dispatched = []

    # 4. Dispatch to Slack Webhook
    if config.slack_webhook_url:
        channels_dispatched.append("slack")
        _dispatch_channel_with_retry(
            db=db,
            tenant_id=tenant_id,
            alert=alert,
            channel="slack",
            destination=config.slack_webhook_url,
            send_func=lambda: send_slack_webhook(config.slack_webhook_url, alert)
        )

    # 5. Dispatch to External Webhook
    if config.external_webhook_url:
        channels_dispatched.append("webhook")
        _dispatch_channel_with_retry(
            db=db,
            tenant_id=tenant_id,
            alert=alert,
            channel="webhook",
            destination=config.external_webhook_url,
            send_func=lambda: send_external_webhook(config.external_webhook_url, alert)
        )

    # 6. Dispatch to Email
    if config.notification_email_addresses:
        channels_dispatched.append("email")
        dest_str = ", ".join(config.notification_email_addresses)
        _dispatch_channel_with_retry(
            db=db,
            tenant_id=tenant_id,
            alert=alert,
            channel="email",
            destination=dest_str,
            send_func=lambda: send_email_alert(config.notification_email_addresses, alert)
        )

    return {"status": "dispatched", "channels": channels_dispatched}

def _dispatch_channel_with_retry(
    db: Session,
    tenant_id: str,
    alert: FreightAlert,
    channel: str,
    destination: str,
    send_func
):
    """
    Executes a single channel dispatch helper with 3 retries and exponential backoff.
    """
    max_retries = 3
    retry_count = 0
    error_msg = None
    success = False
    
    while retry_count < max_retries:
        try:
            send_func()
            success = True
            break
        except Exception as e:
            retry_count += 1
            error_msg = str(e)
            logger.warning(f"Failed to send on channel {channel} (attempt {retry_count}): {str(e)}")
            if retry_count < max_retries:
                # Exponential backoff: 1s, 2s, 4s...
                time.sleep(2 ** (retry_count - 1))
                
    # Log attempt result in the database
    log = FreightNotificationLog(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        channel=channel,
        destination=destination[:255] if destination else None,
        status="sent" if success else "failed",
        error_message=error_msg,
        retry_count=retry_count - 1 if retry_count > 0 else 0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()
