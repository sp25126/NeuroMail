import unittest
import os
import sys
import sqlite3
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from alembic.config import Config
from alembic import command

# Ensure API path is in import search path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import Base
from models import Tenant, User, Mailbox, RawEmail
from config import settings

TEST_DB_FILE = "test_phase0.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_FILE}"

class TestPhase0(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Remove existing test DB if any
        if os.path.exists(TEST_DB_FILE):
            os.remove(TEST_DB_FILE)
        
        # Set environment variable for Alembic to use our test DB
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        # Re-initialize settings to pick up the new env var (it might have been cached)
        # However, settings in config.py is instantiated at module level.
        # We might need to patch it or reload it.
        settings.DATABASE_URL = TEST_DATABASE_URL

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_FILE):
            os.remove(TEST_DB_FILE)

    def test_01_migrations_apply_cleanly(self):
        """
        Phase 0.1: Test that all migration files apply cleanly on a fresh database.
        """
        ini_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alembic.ini")
        alembic_cfg = Config(ini_path)
        # Ensure alembic uses our test URL
        alembic_cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
        
        try:
            command.upgrade(alembic_cfg, "head")
        except Exception as e:
            self.fail(f"Migrations failed to apply: {e}")

        # Verify tables exist
        engine = create_engine(TEST_DATABASE_URL)
        try:
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            
            expected_tables = [
                "tenants", "users", "mailboxes", "raw_emails", "entities", 
                "identifiers", "events", "alerts", "reports", "audit_logs"
            ]
            for table in expected_tables:
                self.assertIn(table, tables, f"Table {table} was not created by migrations")
        finally:
            engine.dispose()

    def test_02_tenant_isolation(self):
        """
        Phase 0.2: Test tenant isolation for tenant-scoped tables.
        """
        engine = create_engine(TEST_DATABASE_URL)
        Session = sessionmaker(bind=engine)
        db = Session()

        try:
            # Create two tenants
            t1 = Tenant(id="t1", name="Tenant 1")
            t2 = Tenant(id="t2", name="Tenant 2")
            db.add_all([t1, t2])
            db.commit()

            # Create a user for t1
            u1 = User(id="u1", email="u1@t1.com", tenant_id="t1")
            db.add(u1)
            db.commit()

            # Verify u1 is associated with t1 and NOT t2
            user = db.query(User).filter(User.id == "u1").first()
            self.assertEqual(user.tenant_id, "t1")
            
            # Simple query check (manual isolation check)
            t1_users = db.query(User).filter(User.tenant_id == "t1").all()
            t2_users = db.query(User).filter(User.tenant_id == "t2").all()
            
            self.assertEqual(len(t1_users), 1)
            self.assertEqual(len(t2_users), 0)
        finally:
            db.close()
            engine.dispose()

    def test_03_constraints_and_uniqueness(self):
        """
        Phase 0.3: Test required foreign keys and uniqueness rules.
        """
        engine = create_engine(TEST_DATABASE_URL)
        
        # Enable foreign keys for SQLite
        from sqlalchemy import event
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Session = sessionmaker(bind=engine)
        db = Session()

        try:
            # 1. Test Foreign Key constraint (User without Tenant)
            invalid_user = User(id="bad_user", email="bad@test.com", tenant_id="non_existent")
            db.add(invalid_user)
            with self.assertRaises(Exception): # Should fail on commit
                db.commit()
            db.rollback()

            # 2. Test Uniqueness (Duplicate User Email)
            t1 = Tenant(id="t1_unique", name="Tenant Unique")
            db.add(t1)
            db.commit()
            
            u1 = User(id="u1_unique", email="dup@test.com", tenant_id="t1_unique")
            db.add(u1)
            db.commit()
            
            u2 = User(id="u2_unique", email="dup@test.com", tenant_id="t1_unique")
            db.add(u2)
            with self.assertRaises(Exception): # Duplicate email
                db.commit()
            db.rollback()

            # 3. Test RawEmail uniqueness (mailbox_id, provider_message_id)
            m1 = Mailbox(id="m1", tenant_id="t1_unique", provider_type="GMAIL")
            db.add(m1)
            db.commit()

            e1 = RawEmail(
                id="e1", tenant_id="t1_unique", mailbox_id="m1", 
                provider_message_id="msg123", thread_id="t123",
                sender="test@test.com", received_at=text("CURRENT_TIMESTAMP")
            )
            db.add(e1)
            db.commit()

            e2 = RawEmail(
                id="e2", tenant_id="t1_unique", mailbox_id="m1", 
                provider_message_id="msg123", thread_id="t456",
                sender="test@test.com", received_at=text("CURRENT_TIMESTAMP")
            )
            db.add(e2)
            with self.assertRaises(Exception): # Duplicate provider_message_id for same mailbox
                db.commit()
            db.rollback()

        finally:
            db.close()
            engine.dispose()

if __name__ == "__main__":
    unittest.main()
