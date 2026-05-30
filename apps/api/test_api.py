import unittest
import os
import sys
from fastapi.testclient import TestClient

# Ensure API path is in import search path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app
from config import Settings
from database import check_db_connectivity

class TestFastAPIBootstrap(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint(self):
        """
        GET /health returns 200 and process status metrics.
        """
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["version"], "1.0.0")

    def test_readiness_endpoint(self):
        """
        GET /ready returns 200 when database connectivity is healthy.
        """
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["db"], "ok")
        self.assertEqual(data["redis"], "ok")

    def test_database_ping(self):
        """
        Verifies database ping checks return True for valid connections.
        """
        self.assertTrue(check_db_connectivity())

    def test_config_fail_fast(self):
        """
        Verifies configuration flags error if critical options are omitted.
        """
        config = Settings(DATABASE_URL="", SECRET_KEY="")
        with self.assertRaises(ValueError):
            config.validate_required()

if __name__ == "__main__":
    unittest.main()
