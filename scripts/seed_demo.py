import datetime
import uuid
import sys
import os

# Add apps/api to path
sys.path.insert(0, os.path.join(os.getcwd(), "apps", "api"))

from database import SessionLocal, engine, Base
import models
from services import (
    mailbox_service,
    email_service,
    entity_service,
    ai_service
)

DEMO_TENANT_ID = "demo-tenant"
DEMO_USER_ID = "demo-admin"

def seed_demo():
    print(f"🌱 Seeding demo data for tenant: {DEMO_TENANT_ID}")
    
    # Ensure tables exist
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Create Tenant
        tenant = db.query(models.Tenant).filter(models.Tenant.id == DEMO_TENANT_ID).first()
        if not tenant:
            tenant = models.Tenant(id=DEMO_TENANT_ID, name="Neuromail Demo Corp")
            db.add(tenant)
            db.commit()
            print(f"Created tenant: {DEMO_TENANT_ID}")
        
        # 2. Create User
        user = db.query(models.User).filter(models.User.id == DEMO_USER_ID).first()
        if not user:
            user = models.User(
                id=DEMO_USER_ID, 
                email="demo@neuromail.io", 
                name="Demo Admin", 
                tenant_id=DEMO_TENANT_ID,
                role="admin"
            )
            db.add(user)
            db.commit()
            print(f"Created user: {DEMO_USER_ID}")

        # 3. Create Mailbox
        mb_id = "demo-mailbox-gmail"
        mailbox = db.query(models.Mailbox).filter(models.Mailbox.id == mb_id).first()
        if not mailbox:
            mailbox = models.Mailbox(
                id=mb_id,
                tenant_id=DEMO_TENANT_ID,
                provider_type="GMAIL",
                connection_status="CONNECTED",
                last_sync_time=datetime.datetime.utcnow()
            )
            db.add(mailbox)
            db.commit()
            print(f"Created mailbox: {mb_id}")

        # 4. Create Rules
        rule_name = "Urgent Shipment Exception"
        rule = db.query(models.Rule).filter(models.Rule.tenant_id == DEMO_TENANT_ID, models.Rule.name == rule_name).first()
        if not rule:
            rule = models.Rule(
                id=str(uuid.uuid4()),
                tenant_id=DEMO_TENANT_ID,
                name=rule_name,
                conditions={"keywords": ["exception", "delayed", "port strike"], "sender_contains": "carrier"},
                outcome={"action": "CREATE_ALERT", "severity": "HIGH"},
                is_active=True
            )
            db.add(rule)
            db.commit()
            print(f"Created rule: {rule_name}")

        # 5. Create some Raw Emails & Parse them
        emails = [
            {
                "subject": "Shipment BOL-44901 Delayed",
                "body": "Your shipment BOL-44901 has been delayed at the port due to extreme weather. New ETA: June 10th.",
                "sender": "notifications@fast-carrier.com",
                "provider_id": "msg-001"
            },
            {
                "subject": "Invoice for Order #5520",
                "body": "Please find attached the invoice for your order #5520. Amount: $4,500.",
                "sender": "billing@office-supply.com",
                "provider_id": "msg-002"
            }
        ]

        for e_data in emails:
            email_exists = db.query(models.RawEmail).filter(
                models.RawEmail.tenant_id == DEMO_TENANT_ID,
                models.RawEmail.provider_message_id == e_data["provider_id"]
            ).first()
            
            if not email_exists:
                raw_email = models.RawEmail(
                    id=str(uuid.uuid4()),
                    tenant_id=DEMO_TENANT_ID,
                    mailbox_id=mb_id,
                    provider_message_id=e_data["provider_id"],
                    thread_id=f"thread-{e_data['provider_id']}",
                    sender=e_data["sender"],
                    subject=e_data["subject"],
                    body=e_data["body"],
                    received_at=datetime.datetime.utcnow() - datetime.timedelta(hours=2)
                )
                db.add(raw_email)
                db.commit()
                print(f"Seeded email: {e_data['subject']}")

                # Trigger processing pipeline manually (if possible) or just seed parsed data
                # For demo, we seed everything so it's ready
                parsed = models.ParsedEmail(
                    id=str(uuid.uuid4()),
                    tenant_id=DEMO_TENANT_ID,
                    raw_email_id=raw_email.id,
                    sender=raw_email.sender,
                    recipients=["demo@neuromail.io"],
                    subject=raw_email.subject,
                    body_text=raw_email.body,
                    received_at=raw_email.received_at,
                    thread_id=raw_email.thread_id,
                    provider_message_id=raw_email.provider_message_id
                )
                db.add(parsed)
                db.commit()

                # Extract entities (like BOL)
                if "BOL-" in raw_email.body:
                    import re
                    match = re.search(r"BOL-(\d+)", raw_email.body)
                    if match:
                        bol = match.group(0)
                        entity = models.Entity(
                            id=str(uuid.uuid4()),
                            tenant_id=DEMO_TENANT_ID,
                            status="ACTIVE",
                            identity=f"Shipment {bol}",
                            source_reference=f"raw_emails/{raw_email.id}"
                        )
                        db.add(entity)
                        db.commit()
                        
                        identifier = models.Identifier(
                            id=str(uuid.uuid4()),
                            tenant_id=DEMO_TENANT_ID,
                            entity_id=entity.id,
                            identifier_type="BOL",
                            identifier_value=bol,
                            source="DEMO_SEED"
                        )
                        db.add(identifier)
                        
                        event = models.Event(
                            id=str(uuid.uuid4()),
                            tenant_id=DEMO_TENANT_ID,
                            entity_id=entity.id,
                            event_type="SHIPMENT_DELAYED",
                            payload={"reason": "Weather", "bol": bol},
                            source="SYSTEM"
                        )
                        db.add(event)
                        
                        # Create Alert if matches rule
                        alert = models.Alert(
                            id=str(uuid.uuid4()),
                            tenant_id=DEMO_TENANT_ID,
                            entity_id=entity.id,
                            rule_id=rule.id,
                            alert_type="DELAY",
                            message=f"High Priority: {raw_email.subject}",
                            severity="HIGH",
                            status="UNRESOLVED"
                        )
                        db.add(alert)
                        db.commit()
                        print(f"Created entity and alert for BOL: {bol}")

        print("✅ Demo seeding complete.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_demo()
