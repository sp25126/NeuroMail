import unittest
import os
import sys
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure API path is in import search path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import Base, get_db
from models import (
    Tenant, User, FreightShipment, FreightShipmentIdentifier,
    FreightEvent, FreightCarrierSnapshot, FreightSyncRun,
    FreightAlert, FreightAlertEvent, FreightTenantConfig, FreightNotificationLog
)
from neuromail.core.mailboxes.carrier_adapter import carrier_registry
from services.rules_engine import RuleContext, evaluate_rules, ArrivalNoticeRule, EtaBreachRule, NoUpdateRule, StorageRiskRule, EtaChangedRule
from services.alert_lifecycle import (
    get_or_create_alert, acknowledge_alert, snooze_alert, resolve_alert, process_expired_snoozes
)
from services.notification_dispatch import dispatch_notifications, is_in_mute_window
from services.tracking_service import run_tracking_sync, sync_single_shipment

# Use an isolated SQLite memory database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

class TestFreightTracking(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        
        db = TestingSessionLocal()
        # Seed test tenants
        cls.tenant1 = Tenant(id="tenant-tracking-1", name="Tracking Tenant One")
        cls.tenant2 = Tenant(id="tenant-tracking-2", name="Tracking Tenant Two")
        
        # Seed test users
        cls.user1 = User(id="user-t1", email="user1@tracking1.com", name="User T1", tenant_id="tenant-tracking-1", role="operator")
        cls.user2 = User(id="user-t2", email="user2@tracking2.com", name="User T2", tenant_id="tenant-tracking-2", role="operator")
        
        db.add(cls.tenant1)
        db.add(cls.tenant2)
        db.add(cls.user1)
        db.add(cls.user2)
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self.headers_t1 = {"X-Tenant-ID": "tenant-tracking-1", "X-User-ID": "user-t1"}
        self.headers_t2 = {"X-Tenant-ID": "tenant-tracking-2", "X-User-ID": "user-t2"}
        
        # Clear dynamic data tables before each test
        db = TestingSessionLocal()
        db.query(FreightShipment).delete()
        db.query(FreightShipmentIdentifier).delete()
        db.query(FreightCarrierSnapshot).delete()
        db.query(FreightSyncRun).delete()
        db.query(FreightAlert).delete()
        db.query(FreightAlertEvent).delete()
        db.query(FreightTenantConfig).delete()
        db.query(FreightNotificationLog).delete()
        db.query(FreightEvent).delete()
        db.commit()
        db.close()

    def test_carrier_adapter_registry(self):
        # Resolve Project44 with bill_of_lading
        a1 = carrier_registry.resolve("Maersk", "bill_of_lading")
        self.assertEqual(a1.carrier_name, "Project44")

        # Resolve Terminal49 with container_id
        a2 = carrier_registry.resolve("MSC", "container_id")
        self.assertEqual(a2.carrier_name, "Terminal49")

        # Resolve Fallback with other refs
        a3 = carrier_registry.resolve("UnknownCarrier", "primary_reference")
        self.assertEqual(a3.carrier_name, "Fallback")

    def test_sync_runs_and_snapshots(self):
        db = TestingSessionLocal()
        
        shipment = FreightShipment(
            id="sh-sync-run",
            tenant_id="tenant-tracking-1",
            primary_reference="BOL-transit",
            carrier="Maersk",
            last_known_status="UNKNOWN",
            is_closed=False
        )
        db.add(shipment)
        
        ident = FreightShipmentIdentifier(
            id="ident-sync-run",
            tenant_id="tenant-tracking-1",
            shipment_id="sh-sync-run",
            identifier_type="bill_of_lading",
            identifier_value="BOL-transit",
            source="email"
        )
        db.add(ident)
        db.commit()

        # Run tracking sync
        run_tracking_sync(db, "tenant-tracking-1", run_type="manual")

        # Verify sync runs table entry
        runs = db.query(FreightSyncRun).all()
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0].total_shipments, 1)
        self.assertEqual(runs[0].succeeded, 1)
        self.assertEqual(runs[0].failed, 0)
        self.assertEqual(runs[0].run_type, "manual")

        # Verify carrier snapshots table entry
        snapshots = db.query(FreightCarrierSnapshot).all()
        self.assertEqual(len(snapshots), 1)
        self.assertEqual(snapshots[0].carrier_adapter, "Project44")
        self.assertEqual(snapshots[0].carrier_status, "IN_TRANSIT")
        self.assertFalse(snapshots[0].is_arrived)

        db.close()

    def test_rules_evaluation_suite(self):
        db = TestingSessionLocal()
        now = datetime.datetime.utcnow()

        # Create mock configurations
        config = FreightTenantConfig(
            id="cfg-t1",
            tenant_id="tenant-tracking-1",
            no_update_threshold_hours=24,
            storage_risk_days=3
        )
        db.add(config)

        # 1. ARRIVAL_NOTICE rule test
        sh_arrived = FreightShipment(
            id="sh-arrived", tenant_id="tenant-tracking-1", primary_reference="BOL-arrive", carrier="Maersk", is_closed=False
        )
        snap_arrived = FreightCarrierSnapshot(
            id="snap-arr", tenant_id="tenant-tracking-1", shipment_id="sh-arrived", carrier_adapter="Project44",
            reference_used="BOL-arrive", carrier_status="ARRIVED_PORT", is_arrived=True, is_delayed=False, synced_at=now
        )
        ctx_arrived = RuleContext(
            tenant_id="tenant-tracking-1", shipment=sh_arrived, latest_snapshot=snap_arrived,
            previous_snapshot=None, tenant_config=config, existing_alerts=[], now=now
        )
        matches = evaluate_rules(ctx_arrived)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].rule_type, "ARRIVAL_NOTICE")

        # 2. ETA_BREACH rule test
        sh_breached = FreightShipment(
            id="sh-breached", tenant_id="tenant-tracking-1", primary_reference="BOL-transit", carrier="Maersk",
            eta=now - datetime.timedelta(hours=2), last_known_status="IN_TRANSIT", is_closed=False
        )
        snap_breached = FreightCarrierSnapshot(
            id="snap-br", tenant_id="tenant-tracking-1", shipment_id="sh-breached", carrier_adapter="Project44",
            reference_used="BOL-transit", carrier_status="IN_TRANSIT", is_arrived=False, is_delayed=False, synced_at=now
        )
        ctx_breached = RuleContext(
            tenant_id="tenant-tracking-1", shipment=sh_breached, latest_snapshot=snap_breached,
            previous_snapshot=None, tenant_config=config, existing_alerts=[], now=now
        )
        matches = evaluate_rules(ctx_breached)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].rule_type, "ETA_BREACH")

        # 3. NO_UPDATE rule test
        sh_stale = FreightShipment(
            id="sh-stale", tenant_id="tenant-tracking-1", primary_reference="BOL-transit", carrier="Maersk",
            last_status_at=now - datetime.timedelta(hours=25), last_known_status="IN_TRANSIT", is_closed=False
        )
        ctx_stale = RuleContext(
            tenant_id="tenant-tracking-1", shipment=sh_stale, latest_snapshot=None,
            previous_snapshot=None, tenant_config=config, existing_alerts=[], now=now
        )
        matches = evaluate_rules(ctx_stale)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].rule_type, "NO_UPDATE")

        # 4. STORAGE_RISK rule test
        sh_storage = FreightShipment(
            id="sh-storage", tenant_id="tenant-tracking-1", primary_reference="BOL-pickup", carrier="Maersk",
            last_status_at=now - datetime.timedelta(days=4), last_known_status="AVAILABLE_PICKUP", is_closed=False
        )
        snap_storage = FreightCarrierSnapshot(
            id="snap-st", tenant_id="tenant-tracking-1", shipment_id="sh-storage", carrier_adapter="Project44",
            reference_used="BOL-pickup", carrier_status="AVAILABLE_PICKUP", is_arrived=True, is_delayed=False, synced_at=now
        )
        ctx_storage = RuleContext(
            tenant_id="tenant-tracking-1", shipment=sh_storage, latest_snapshot=snap_storage,
            previous_snapshot=None, tenant_config=config,
            existing_alerts=[
                FreightAlert(rule_type="ARRIVAL_NOTICE", tenant_id="tenant-tracking-1", shipment_id="sh-storage"),
                FreightAlert(rule_type="NO_UPDATE", tenant_id="tenant-tracking-1", shipment_id="sh-storage")
            ],
            now=now
        )
        matches = evaluate_rules(ctx_storage)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].rule_type, "STORAGE_RISK")

        # 5. ETA_CHANGED rule test
        sh_changed = FreightShipment(
            id="sh-changed", tenant_id="tenant-tracking-1", primary_reference="BOL-transit", carrier="Maersk", is_closed=False
        )
        snap_prev = FreightCarrierSnapshot(
            id="snap-p", tenant_id="tenant-tracking-1", shipment_id="sh-changed", carrier_adapter="Project44",
            reference_used="BOL-transit", carrier_status="IN_TRANSIT", eta=now + datetime.timedelta(days=5), synced_at=now - datetime.timedelta(days=1)
        )
        snap_curr = FreightCarrierSnapshot(
            id="snap-c", tenant_id="tenant-tracking-1", shipment_id="sh-changed", carrier_adapter="Project44",
            reference_used="BOL-transit", carrier_status="IN_TRANSIT", eta=now + datetime.timedelta(days=8), synced_at=now
        )
        ctx_changed = RuleContext(
            tenant_id="tenant-tracking-1", shipment=sh_changed, latest_snapshot=snap_curr,
            previous_snapshot=snap_prev, tenant_config=config, existing_alerts=[], now=now
        )
        matches = evaluate_rules(ctx_changed)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].rule_type, "ETA_CHANGED")

        db.close()

    def test_alert_deduplication(self):
        db = TestingSessionLocal()
        now = datetime.datetime.utcnow()

        # Trigger first alert
        alert1 = get_or_create_alert(db, "tenant-tracking-1", "sh-test", "ARRIVAL_NOTICE", "high", "Arrived", "Desc", now)
        self.assertIsNotNone(alert1)

        # Trigger second alert within the same window (should deduplicate/skip)
        alert2 = get_or_create_alert(db, "tenant-tracking-1", "sh-test", "ARRIVAL_NOTICE", "high", "Arrived", "Desc", now)
        self.assertIsNone(alert2)

        # Resolve first alert
        resolve_alert(db, "tenant-tracking-1", alert1.id, actor="operator")

        # Trigger again (should reopen the resolved alert)
        reopened = get_or_create_alert(db, "tenant-tracking-1", "sh-test", "ARRIVAL_NOTICE", "high", "Arrived", "Desc", now)
        self.assertIsNotNone(reopened)
        self.assertEqual(reopened.id, alert1.id)
        self.assertEqual(reopened.status, "open")

        db.close()

    def test_alert_lifecycle_and_snooze(self):
        db = TestingSessionLocal()
        now = datetime.datetime.utcnow()

        alert = get_or_create_alert(db, "tenant-tracking-1", "sh-life", "ETA_BREACH", "high", "Breached", "Desc", now)
        self.assertEqual(alert.status, "open")

        # Acknowledge
        acknowledge_alert(db, "tenant-tracking-1", alert.id, actor="operator-1", note="Investigating")
        db.refresh(alert)
        self.assertEqual(alert.status, "acknowledged")

        # Snooze
        snoozed_until = datetime.datetime.utcnow() + datetime.timedelta(hours=2)
        snooze_alert(db, "tenant-tracking-1", alert.id, actor="operator-1", snoozed_until=snoozed_until)
        db.refresh(alert)
        self.assertEqual(alert.status, "snoozed")

        # Resolve
        resolve_alert(db, "tenant-tracking-1", alert.id, actor="operator-1")
        db.refresh(alert)
        self.assertEqual(alert.status, "resolved")

        # Verification of Audit Events
        events = db.query(FreightAlertEvent).filter(FreightAlertEvent.alert_id == alert.id).all()
        actions = [e.action for e in events]
        self.assertIn("created", actions)
        self.assertIn("acknowledged", actions)
        self.assertIn("snoozed", actions)
        self.assertIn("resolved", actions)

        db.close()

    def test_snooze_expiration(self):
        db = TestingSessionLocal()
        now = datetime.datetime.utcnow()

        alert = get_or_create_alert(db, "tenant-tracking-1", "sh-life", "ETA_BREACH", "high", "Breached", "Desc", now)
        
        # Snooze with past expiration (already expired)
        snoozed_until = now - datetime.timedelta(seconds=1)
        snooze_alert(db, "tenant-tracking-1", alert.id, actor="operator-1", snoozed_until=snoozed_until)
        
        # Trigger snooze processor
        reopened_count = process_expired_snoozes(db, "tenant-tracking-1")
        self.assertEqual(reopened_count, 1)

        db.refresh(alert)
        self.assertEqual(alert.status, "open")

        db.close()

    def test_notification_dispatch_and_mute_window(self):
        db = TestingSessionLocal()
        now = datetime.datetime.utcnow()

        # Create config with Slack and Email
        config = FreightTenantConfig(
            id="cfg-notif",
            tenant_id="tenant-tracking-1",
            slack_webhook_url="https://hooks.slack.com/services/test",
            notification_email_addresses=["ops@tenant1.com"],
            alert_severity_threshold="medium",
            mute_start_hour=23,
            mute_end_hour=7
        )
        db.add(config)
        db.commit()

        # Create alert
        alert = get_or_create_alert(db, "tenant-tracking-1", "sh-notif", "ETA_BREACH", "high", "Breached", "Desc", now)

        # Mute window calculations
        self.assertTrue(is_in_mute_window(23, 23, 7))
        self.assertTrue(is_in_mute_window(4, 23, 7))
        self.assertFalse(is_in_mute_window(12, 23, 7))

        # Perform dispatch inside a muted hour (mocking now.hour = 23)
        muted_time = datetime.datetime(2026, 6, 2, 23, 15, 0)
        # Helper call to dispatch_notifications (will check current utc hour, which is 23 here)
        # We temporarily mock datetime in the module or pass inside check
        # Instead, let's test is_in_mute_window directly, and mock the config hour for dispatch
        config.mute_start_hour = now.hour # Current hour is muted
        config.mute_end_hour = (now.hour + 2) % 24
        db.add(config)
        db.commit()

        res_muted = dispatch_notifications(db, "tenant-tracking-1", alert)
        self.assertEqual(res_muted["status"], "suppressed")
        
        # Verify suppression log exists in DB
        logs = db.query(FreightNotificationLog).all()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].status, "suppressed")
        self.assertEqual(logs[0].destination, "suppressed_mute_window")

        db.close()

    def test_sync_engine_isolation(self):
        db = TestingSessionLocal()
        
        s1 = FreightShipment(
            id="sh-tenant1", tenant_id="tenant-tracking-1", primary_reference="BOL-transit", carrier="Maersk", is_closed=False, last_known_status="UNKNOWN"
        )
        s2 = FreightShipment(
            id="sh-tenant2", tenant_id="tenant-tracking-2", primary_reference="BOL-transit", carrier="MSC", is_closed=False, last_known_status="UNKNOWN"
        )
        db.add(s1)
        db.add(s2)
        
        ident1 = FreightShipmentIdentifier(
            id="ident-t1",
            tenant_id="tenant-tracking-1",
            shipment_id="sh-tenant1",
            identifier_type="bill_of_lading",
            identifier_value="BOL-transit",
            source="email"
        )
        ident2 = FreightShipmentIdentifier(
            id="ident-t2",
            tenant_id="tenant-tracking-2",
            shipment_id="sh-tenant2",
            identifier_type="bill_of_lading",
            identifier_value="BOL-transit",
            source="email"
        )
        db.add(ident1)
        db.add(ident2)
        db.commit()

        # Run manual bulk sync for Tenant 1 only
        run_tracking_sync(db, "tenant-tracking-1", run_type="manual")

        # Tenant 1 shipment should have snapshot and carrier_api status
        snapshots_t1 = db.query(FreightCarrierSnapshot).filter(FreightCarrierSnapshot.tenant_id == "tenant-tracking-1").all()
        self.assertEqual(len(snapshots_t1), 1)
        self.assertEqual(s1.last_known_status, "IN_TRANSIT")
        self.assertEqual(s1.status_source, "carrier_api")

        # Tenant 2 shipment should be untouched
        snapshots_t2 = db.query(FreightCarrierSnapshot).filter(FreightCarrierSnapshot.tenant_id == "tenant-tracking-2").all()
        self.assertEqual(len(snapshots_t2), 0)
        self.assertEqual(s2.last_known_status, "UNKNOWN")
        self.assertEqual(s2.status_source, "email")

        db.close()

if __name__ == "__main__":
    unittest.main()
