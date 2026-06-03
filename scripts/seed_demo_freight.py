import datetime
import uuid
import sys
import os

# Add apps/api to path
sys.path.insert(0, os.path.join(os.getcwd(), "apps", "api"))

from database import SessionLocal, engine
import models

def seed_freight_demo():
    print("Seeding rich Freight Automation demo data...")
    
    # Ensure tables exist
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Seed Tenant
        tenant = db.query(models.Tenant).filter(models.Tenant.id == "demo-tenant").first()
        if not tenant:
            tenant = models.Tenant(id="demo-tenant", name="Neuromail Demo Corp")
            db.add(tenant)
            db.commit()
            print("Created tenant: demo-tenant")
            
        # 2. Seed User
        user = db.query(models.User).filter(models.User.id == "demo-user").first()
        if not user:
            user = models.User(
                id="demo-user",
                email="user@example.com",
                name="Demo User",
                tenant_id="demo-tenant",
                role="admin"
            )
            db.add(user)
            db.commit()
            print("Created user: demo-user")

        # 3. Seed Mailbox
        mb_id = "demo-mailbox-gmail"
        mailbox = db.query(models.Mailbox).filter(models.Mailbox.id == mb_id).first()
        if not mailbox:
            mailbox = models.Mailbox(
                id=mb_id,
                tenant_id="demo-tenant",
                provider_type="GMAIL",
                connection_status="CONNECTED",
                last_sync_time=datetime.datetime.utcnow()
            )
            db.add(mailbox)
            db.commit()
            print("Created mailbox: demo-mailbox-gmail")

        # 4. Seed Freight config
        config = db.query(models.FreightTenantConfig).filter(models.FreightTenantConfig.tenant_id == "demo-tenant").first()
        if not config:
            config = models.FreightTenantConfig(
                id="cfg-demo",
                tenant_id="demo-tenant",
                sync_interval_minutes=30,
                no_update_threshold_hours=24,
                storage_risk_days=3,
                freight_subject_patterns=["shipment", "freight", "cargo", "delivery", "bol", "tracking"],
                freight_from_addresses=["carriers@delivery.com", "notify@shipper.org"],
                active_carriers=["project44", "terminal49", "maersk", "dhl"],
                notification_email_addresses=["ops-manager@company.com"],
                alert_severity_threshold="MEDIUM",
                mute_start_hour=22,
                mute_end_hour=6
            )
            db.add(config)
            db.commit()
            print("Created freight config for demo-tenant")

        # Clear existing dynamic freight tables to get a clean, predictable demo state
        db.query(models.FreightShipment).filter(models.FreightShipment.tenant_id == "demo-tenant").delete()
        db.query(models.FreightCarrierSnapshot).filter(models.FreightCarrierSnapshot.tenant_id == "demo-tenant").delete()
        db.query(models.FreightEvent).filter(models.FreightEvent.tenant_id == "demo-tenant").delete()
        db.query(models.FreightAlert).filter(models.FreightAlert.tenant_id == "demo-tenant").delete()
        db.query(models.FreightRawEmail).filter(models.FreightRawEmail.tenant_id == "demo-tenant").delete()
        db.query(models.FreightReportRun).filter(models.FreightReportRun.tenant_id == "demo-tenant").delete()
        db.query(models.FreightReportSchedule).filter(models.FreightReportSchedule.tenant_id == "demo-tenant").delete()
        db.commit()

        # 5. Seed Freight Shipments
        shipments_data = [
            {
                "id": "sh-01",
                "primary_reference": "KOTAK-99201",
                "carrier": "Maersk",
                "origin_port": "Shanghai",
                "destination_port": "Los Angeles",
                "last_known_status": "IN_TRANSIT",
                "eta": datetime.datetime.utcnow() + datetime.timedelta(days=5),
                "last_status_at": datetime.datetime.utcnow() - datetime.timedelta(hours=6)
            },
            {
                "id": "sh-02",
                "primary_reference": "DHL-FREIGHT-883",
                "carrier": "DHL",
                "origin_port": "Rotterdam",
                "destination_port": "New York",
                "last_known_status": "ARRIVED",
                "eta": datetime.datetime.utcnow() - datetime.timedelta(days=2),
                "last_status_at": datetime.datetime.utcnow() - datetime.timedelta(days=2)
            },
            {
                "id": "sh-03",
                "primary_reference": "PIL-STRIKE-440",
                "carrier": "PIL",
                "origin_port": "Singapore",
                "destination_port": "Oakland",
                "last_known_status": "DELAYED",
                "eta": datetime.datetime.utcnow() + datetime.timedelta(days=12),
                "last_status_at": datetime.datetime.utcnow() - datetime.timedelta(hours=1)
            },
            {
                "id": "sh-04",
                "primary_reference": "MSC-STALE-776",
                "carrier": "MSC",
                "origin_port": "Ningbo",
                "destination_port": "Seattle",
                "last_known_status": "IN_TRANSIT",
                "eta": datetime.datetime.utcnow() + datetime.timedelta(days=8),
                "last_status_at": datetime.datetime.utcnow() - datetime.timedelta(days=3)  # stale shipment
            }
        ]

        shipments = []
        for s_data in shipments_data:
            shipment = models.FreightShipment(
                id=s_data["id"],
                tenant_id="demo-tenant",
                primary_reference=s_data["primary_reference"],
                carrier=s_data["carrier"],
                origin_port=s_data["origin_port"],
                destination_port=s_data["destination_port"],
                last_known_status=s_data["last_known_status"],
                eta=s_data["eta"],
                last_status_at=s_data["last_status_at"],
                created_at=datetime.datetime.utcnow() - datetime.timedelta(days=10),
                is_closed=False
            )
            db.add(shipment)
            shipments.append(shipment)
        db.commit()
        print(f"Seeded {len(shipments)} shipments.")

        # 6. Seed Snapshots and Events (milestones)
        # sh-01 (In Transit Maersk)
        db.add(models.FreightCarrierSnapshot(
            id=str(uuid.uuid4()),
            tenant_id="demo-tenant",
            shipment_id="sh-01",
            carrier_adapter="Maersk",
            reference_used="KOTAK-99201",
            raw_response={"status": "Vessel departed Shanghai"},
            carrier_status="DEPARTED",
            location="Shanghai Port",
            is_arrived=False,
            is_delayed=False,
            synced_at=datetime.datetime.utcnow() - datetime.timedelta(days=2)
        ))
        db.add(models.FreightEvent(
            id=str(uuid.uuid4()),
            tenant_id="demo-tenant",
            shipment_id="sh-01",
            event_type="DEPARTURE",
            payload={"description": "Vessel departed origin port Shanghai", "source": "Maersk Adapter"},
            created_at=datetime.datetime.utcnow() - datetime.timedelta(days=2)
        ))

        # sh-02 (Arrived DHL - at risk of storage fees)
        db.add(models.FreightCarrierSnapshot(
            id=str(uuid.uuid4()),
            tenant_id="demo-tenant",
            shipment_id="sh-02",
            carrier_adapter="DHL",
            reference_used="DHL-FREIGHT-883",
            raw_response={"status": "Container discharged from vessel"},
            carrier_status="ARRIVED",
            location="New York Terminal 4",
            is_arrived=True,
            is_delayed=False,
            synced_at=datetime.datetime.utcnow() - datetime.timedelta(days=2)
        ))
        db.add(models.FreightEvent(
            id=str(uuid.uuid4()),
            tenant_id="demo-tenant",
            shipment_id="sh-02",
            event_type="ARRIVAL",
            payload={"description": "Vessel arrived, container discharged at New York Terminal 4", "source": "DHL Adapter"},
            created_at=datetime.datetime.utcnow() - datetime.timedelta(days=2)
        ))

        # sh-03 (Delayed Singapore)
        db.add(models.FreightCarrierSnapshot(
            id=str(uuid.uuid4()),
            tenant_id="demo-tenant",
            shipment_id="sh-03",
            carrier_adapter="PIL",
            reference_used="PIL-STRIKE-440",
            raw_response={"status": "Delayed due to weather strike"},
            carrier_status="DELAYED",
            location="Singapore Straits",
            is_arrived=False,
            is_delayed=True,
            synced_at=datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        ))
        db.add(models.FreightEvent(
            id=str(uuid.uuid4()),
            tenant_id="demo-tenant",
            shipment_id="sh-03",
            event_type="DELAY",
            payload={"description": "Severe weather delay in transit", "source": "PIL Adapter"},
            created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        ))

        # sh-04 (Stale MSC)
        db.add(models.FreightCarrierSnapshot(
            id=str(uuid.uuid4()),
            tenant_id="demo-tenant",
            shipment_id="sh-04",
            carrier_adapter="MSC",
            reference_used="MSC-STALE-776",
            raw_response={"status": "Vessel in transit"},
            carrier_status="IN_TRANSIT",
            location="Pacific Ocean",
            is_arrived=False,
            is_delayed=False,
            synced_at=datetime.datetime.utcnow() - datetime.timedelta(days=3)
        ))
        db.commit()
        print("Seeded milestones and snapshots.")

        # 7. Seed Alerts
        # Alert 1: Storage Risk on sh-02
        db.add(models.FreightAlert(
            id="al-01",
            tenant_id="demo-tenant",
            shipment_id="sh-02",
            rule_type="STORAGE_RISK",
            title="High Demurrage Risk: DHL-FREIGHT-883",
            description="Container DHL-FREIGHT-883 has been at New York Terminal 4 for 2 days. Free time expires in 24 hours.",
            severity="HIGH",
            status="open",
            dedup_key="storage_risk:sh-02",
            created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=12)
        ))
        # Alert 2: Delay alert on sh-03
        db.add(models.FreightAlert(
            id="al-02",
            tenant_id="demo-tenant",
            shipment_id="sh-03",
            rule_type="ETA_BREACH",
            title="Vessel Delay: PIL-STRIKE-440",
            description="Shipment PIL-STRIKE-440 ETA breached from original June 5th to June 15th.",
            severity="MEDIUM",
            status="open",
            dedup_key="eta_breach:sh-03",
            created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=2)
        ))
        # Alert 3: No-update warning on sh-04
        db.add(models.FreightAlert(
            id="al-03",
            tenant_id="demo-tenant",
            shipment_id="sh-04",
            rule_type="NO_UPDATE",
            title="No Signal: MSC-STALE-776",
            description="No carrier updates received for MSC-STALE-776 in over 72 hours.",
            severity="LOW",
            status="open",
            dedup_key="no_update:sh-04",
            created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=24)
        ))
        db.commit()
        print("Seeded alerts.")

        # 8. Seed Raw Emails (quarantine example)
        db.add(models.FreightRawEmail(
            id="em-quar-01",
            tenant_id="demo-tenant",
            mailbox_id=mb_id,
            provider="gmail",
            provider_message_id="gmail-msg-quar-1",
            subject="Urgent update regarding container shipment",
            from_address="ops@straitcarrier.com",
            raw_body="Hello Team, we have an update regarding the cargo. However the BOL reference is unreadable in our system.",
            parsing_status="quarantined",
            parsing_error="No valid shipment reference identifier could be extracted from subject or body.",
            received_at=datetime.datetime.utcnow() - datetime.timedelta(hours=4)
        ))
        db.add(models.FreightRawEmail(
            id="em-proc-01",
            tenant_id="demo-tenant",
            mailbox_id=mb_id,
            provider="gmail",
            provider_message_id="gmail-msg-proc-1",
            subject="Shipment Maersk KOTAK-99201 ETA Update",
            from_address="notifications@maersk.com",
            raw_body="Your shipment KOTAK-99201 is in transit. ETA is now June 8th.",
            parsing_status="processed",
            received_at=datetime.datetime.utcnow() - datetime.timedelta(hours=8)
        ))
        db.commit()
        print("Seeded emails.")

        # 9. Seed Report Schedules
        db.add(models.FreightReportSchedule(
            id="sch-daily-status",
            tenant_id="demo-tenant",
            report_type="shipment_status",
            cron_expression="0 8 * * *",
            interval_minutes=None,
            enabled=True,
            format="xlsx",
            recipients=["ops-manager@company.com", "import-team@company.com"],
            created_at=datetime.datetime.utcnow() - datetime.timedelta(days=5)
        ))
        db.add(models.FreightReportSchedule(
            id="sch-hourly-alerts",
            tenant_id="demo-tenant",
            report_type="aging_no_update",
            cron_expression=None,
            interval_minutes=60,
            enabled=True,
            format="csv",
            recipients=["alerts-on-duty@company.com"],
            created_at=datetime.datetime.utcnow() - datetime.timedelta(days=2)
        ))
        db.commit()
        print("Seeded report schedules.")

        # 10. Seed Report Runs
        db.add(models.FreightReportRun(
            id="run-01",
            tenant_id="demo-tenant",
            report_type="shipment_status",
            status="success",
            parameters={"format": "xlsx"},
            output_uri="/freight/reports/download/run-01",
            row_count=4,
            started_at=datetime.datetime.utcnow() - datetime.timedelta(days=1),
            completed_at=datetime.datetime.utcnow() - datetime.timedelta(days=1)
        ))
        db.add(models.FreightReportRun(
            id="run-02",
            tenant_id="demo-tenant",
            report_type="kpi_summary",
            status="success",
            parameters={"format": "csv"},
            output_uri="/freight/reports/download/run-02",
            row_count=1,
            started_at=datetime.datetime.utcnow() - datetime.timedelta(hours=2),
            completed_at=datetime.datetime.utcnow() - datetime.timedelta(hours=2)
        ))
        db.commit()
        print("Seeded report runs.")

        print("Seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Seeding failed: {str(e)}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_freight_demo()
