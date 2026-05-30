import os
import sys
import time
import json
import redis
import logging

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] Worker: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("Worker")

def load_dotenv():
    env_paths = [".env", "apps/api/.env"]
    for path in env_paths:
        if os.path.exists(path):
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        key, val = line.split("=", 1)
                        val = val.strip().strip("'").strip('"')
                        os.environ[key.strip()] = val

load_dotenv()

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379")
QUEUE_NAME = "neuromail_jobs"

client = None

def get_redis_client():
    global client
    if client is None:
        logger.info(f"Connecting to Redis queue: {REDIS_URL}")
        try:
            client = redis.from_url(REDIS_URL)
            # Ping checks connectivity
            client.ping()
            logger.info("Connected to Redis successfully!")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            # Fail fast if Redis is missing
            sys.exit(1)
    return client

def process_job(job_data: dict):
    task_name = job_data.get("task")
    args = job_data.get("args", [])
    logger.info(f"Received task: {task_name} with args: {args}")
    
    if task_name == "dummy_task":
        result = f"Hello {args[0]}!"
        logger.info(f"Processing dummy task completed. Result: {result}")
        return result
    elif task_name == "poll_inboxes":
        try:
            import sys
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/workers/neuromail/tasks")
            from inbox_poll import poll_all_connected_mailboxes
            res = poll_all_connected_mailboxes()
            logger.info(f"Polling check completed: {res}")
            return res
        except Exception as e:
            logger.error(f"Failed to execute poll_inboxes task: {str(e)}")
            return "failed"
    else:
        logger.warning(f"Unknown task: {task_name}")
        return "unknown"

import threading
def run_scheduler():
    logger.info("Scheduler thread started.")
    # Wait for the worker to warm up
    time.sleep(5)
    rc = get_redis_client()
    while True:
        try:
            # Poll every 30 seconds
            time.sleep(30)
            logger.info("Scheduler pushing 'poll_inboxes' task to queue...")
            job = {"task": "poll_inboxes", "args": []}
            rc.rpush(QUEUE_NAME, json.dumps(job))
        except Exception as e:
            logger.error(f"Error in scheduler thread: {str(e)}")
            time.sleep(10)

def start_worker():
    rc = get_redis_client()
    
    # Start scheduler thread
    scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    
    logger.info(f"Worker listening on queue '{QUEUE_NAME}'...")
    while True:
        try:
            # Block and check for new jobs
            result = rc.blpop(QUEUE_NAME, timeout=5)
            if result:
                queue, payload = result
                job_data = json.loads(payload.decode('utf-8'))
                process_job(job_data)
        except KeyboardInterrupt:
            logger.info("Worker shutting down gracefully.")
            break
        except Exception as e:
            logger.error(f"Error in worker process loop: {str(e)}")
            time.sleep(2)


if __name__ == "__main__":
    start_worker()
