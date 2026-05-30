import unittest
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from worker import process_job

class TestWorkerQueue(unittest.TestCase):
    def test_dummy_task_execution(self):
        """
        Verify that dummy_task parses inputs and outputs a hello greeting message.
        """
        payload = {
            "task": "dummy_task",
            "args": ["Saumya"]
        }
        res = process_job(payload)
        self.assertEqual(res, "Hello Saumya!")

    def test_unknown_task(self):
        """
        Verify that unknown task shapes are identified as unknown and logged.
        """
        payload = {
            "task": "non_existent_task",
            "args": []
        }
        res = process_job(payload)
        self.assertEqual(res, "unknown")

if __name__ == "__main__":
    unittest.main()
