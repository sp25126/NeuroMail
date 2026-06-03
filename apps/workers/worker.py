import os
import sys
import time
import json
import redis
import logging
import threading

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

REDIS_URL = os.environ.get("REDIS_URL", "")
QUEUE_NAME = "neuromail_jobs"

client = None

def get_redis_client():
    global client
    if client is None:
        if not REDIS_URL:
            logger.error("REDIS_URL is not set. Worker requires a real Redis instance.")
            sys.exit(1)
        logger.info(f"Connecting to Redis queue: {REDIS_URL}")
        try:
            client = redis.from_url(REDIS_URL)
            client.ping()
            logger.info("Connected to Redis successfully!")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
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
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/workers/neuromail/tasks")
            from inbox_poll import poll_all_connected_mailboxes
            res = poll_all_connected_mailboxes()
            logger.info(f"Polling check completed: {res}")
            return res
        except Exception as e:
            logger.error(f"Failed to execute poll_inboxes task: {str(e)}")
            return "failed"
    elif task_name == "generate_report":
        try:
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")
            from database import SessionLocal
            from models import ReportRun
            from neuromail.core.raw_email.report_engine import run_report_definition

            report_run_id = args[0]
            db = SessionLocal()
            try:
                run = db.query(ReportRun).filter(ReportRun.id == report_run_id).first()
                if run:
                    run_report_definition(db, run)
                    logger.info(f"Successfully generated report in background for run: {report_run_id}")
                    return "success"
                else:
                    logger.error(f"Report run not found: {report_run_id}")
                    return "not_found"
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to generate report in worker task: {str(e)}")
            return "failed"
    elif task_name == "summarize_email":
        try:
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")
            from database import SessionLocal
            from services.ai_service import summarize_email
            
            email_id = args[0]
            tenant_id = args[1]
            db = SessionLocal()
            try:
                summarize_email(db, tenant_id, email_id, force=True)
                logger.info(f"Asynchronously summarized email: {email_id}")
                return "success"
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to summarize email in worker task: {str(e)}")
            return "failed"
    elif task_name == "classify_email":
        try:
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")
            from database import SessionLocal
            from services.ai_service import classify_email
            
            email_id = args[0]
            tenant_id = args[1]
            db = SessionLocal()
            try:
                classify_email(db, tenant_id, email_id, force=True)
                logger.info(f"Asynchronously classified email: {email_id}")
                return "success"
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to classify email in worker task: {str(e)}")
            return "failed"
    elif task_name == "freight_ingest_emails":
        try:
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")
            from database import SessionLocal
            from services.freight_service import freight_ingest_emails
            
            tenant_id = args[0]
            db = SessionLocal()
            try:
                count = freight_ingest_emails(db, tenant_id)
                logger.info(f"Asynchronously ran freight ingestion for tenant {tenant_id}: {count} emails processed")
                return "success"
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to run freight ingestion in worker task: {str(e)}")
            return "failed"
    elif task_name == "freight_sync_tracking":
        try:
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")
            from database import SessionLocal
            from services.tracking_service import run_tracking_sync
            
            tenant_id = args[0]
            db = SessionLocal()
            try:
                count = run_tracking_sync(db, tenant_id)
                logger.info(f"Asynchronously ran tracking sync for tenant {tenant_id}: {count} shipments synced")
                return "success"
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to run tracking sync in worker task: {str(e)}")
            return "failed"
    elif task_name == "freight_process_scheduled_reports":
        try:
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")
            import datetime
            from database import SessionLocal
            from services.report_service import generate_report
            from models import FreightReportSchedule
            
            tenant_id = args[0]
            schedule_id = args[1]
            db = SessionLocal()
            try:
                # Concurrency lock
                rc_client = get_redis_client()
                lock_key = f"lock:freight_report_schedule:{tenant_id}:{schedule_id}"
                acquired = rc_client.set(lock_key, "locked", ex=300, nx=True)
                if not acquired:
                    logger.warning(f"Scheduled report run already in progress for schedule {schedule_id}. Skipping.")
                    return "skipped"
                    
                try:
                    sched = db.query(FreightReportSchedule).filter(
                        FreightReportSchedule.id == schedule_id,
                        FreightReportSchedule.tenant_id == tenant_id
                    ).first()
                    
                    if not sched or not sched.enabled:
                        return "skipped"
                        
                    # Execute generation with retry once
                    try:
                        generate_report(db, tenant_id, sched.report_type, sched.format, {"schedule_id": schedule_id})
                        sched.last_run_at = datetime.datetime.utcnow()
                        db.add(sched)
                        db.commit()
                        logger.info(f"Successfully generated scheduled report for schedule {schedule_id}")
                    except Exception as run_err:
                        logger.warning(f"Report run failed for schedule {schedule_id}. Retrying once. Error: {str(run_err)}")
                        try:
                            generate_report(db, tenant_id, sched.report_type, sched.format, {"schedule_id": schedule_id})
                            sched.last_run_at = datetime.datetime.utcnow()
                            db.add(sched)
                            db.commit()
                            logger.info(f"Successfully generated scheduled report on retry for schedule {schedule_id}")
                        except Exception as retry_err:
                            logger.error(f"Retry report run failed for schedule {schedule_id}: {str(retry_err)}")
                            raise retry_err
                finally:
                    rc_client.delete(lock_key)
                    
                return "success"
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to process scheduled report task in worker: {str(e)}")
            return "failed"
    else:
        logger.warning(f"Unknown task: {task_name}")
        return "unknown"

def run_scheduler():
    logger.info("Scheduler thread started.")
    # Wait for the worker to warm up
    time.sleep(5)
    rc = get_redis_client()
    while True:
        try:
            sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")
            from database import SessionLocal
            from models import ReportDefinition, ReportRun, Tenant, FreightReportSchedule
            import uuid
            import datetime
            
            db = SessionLocal()
            try:
                now = datetime.datetime.utcnow()
                
                # 1. Report Definitions
                try:
                    defs = db.query(ReportDefinition).filter(ReportDefinition.is_active == True).all()
                    for d in defs:
                        if d.schedule:
                            run = ReportRun(
                                id=str(uuid.uuid4()),
                                tenant_id=d.tenant_id,
                                report_definition_id=d.id,
                                status="PENDING",
                                parameters=d.config
                            )
                            db.add(run)
                            db.commit()
                            
                            job = {"task": "generate_report", "args": [run.id]}
                            rc.rpush(QUEUE_NAME, json.dumps(job))
                            logger.info(f"Scheduler queued report {run.id} for active definition {d.name}")
                except Exception as db_err:
                    logger.error(f"Database query error in scheduler (ReportDefinitions): {str(db_err)}")

                # 2. Freight Report Schedules
                try:
                    schedules = db.query(FreightReportSchedule).filter(FreightReportSchedule.enabled == True).all()
                    for sched in schedules:
                        due = False
                        if sched.interval_minutes:
                            due = (sched.last_run_at is None) or (now - sched.last_run_at >= datetime.timedelta(minutes=sched.interval_minutes))
                        elif sched.cron_expression:
                            cron = sched.cron_expression.lower()
                            if "hourly" in cron or "0 * * * *" in cron:
                                due = (sched.last_run_at is None) or (sched.last_run_at.hour != now.hour or (now - sched.last_run_at).total_seconds() >= 3600)
                            elif "daily" in cron or "0 8 * * *" in cron:
                                due = (sched.last_run_at is None) or (sched.last_run_at.date() != now.date())
                            elif "weekly" in cron or "0 0 * * 0" in cron:
                                due = (sched.last_run_at is None) or ((now - sched.last_run_at).days >= 7)
                            else:
                                due = (sched.last_run_at is None) or (now - sched.last_run_at >= datetime.timedelta(days=1))
                        else:
                            due = (sched.last_run_at is None)
                            
                        if due:
                            job_r = {"task": "freight_process_scheduled_reports", "args": [sched.tenant_id, sched.id]}
                            rc.rpush(QUEUE_NAME, json.dumps(job_r))
                            logger.info(f"Scheduler queued scheduled report {sched.report_type} for schedule {sched.id} tenant {sched.tenant_id}")
                except Exception as sched_err:
                    logger.error(f"Error checking FreightReportSchedules in scheduler: {str(sched_err)}")

                # 3. Schedule inbox polling
                logger.info("Scheduler pushing 'poll_inboxes' task to queue...")
                job = {"task": "poll_inboxes", "args": []}
                rc.rpush(QUEUE_NAME, json.dumps(job))

                # 4. Schedule freight ingestion for all tenants
                try:
                    tenants = db.query(Tenant).all()
                    for tenant in tenants:
                        job_f = {"task": "freight_ingest_emails", "args": [tenant.id]}
                        rc.rpush(QUEUE_NAME, json.dumps(job_f))
                        logger.info(f"Scheduler queued freight ingestion for tenant {tenant.id}")
                        
                        job_t = {"task": "freight_sync_tracking", "args": [tenant.id]}
                        rc.rpush(QUEUE_NAME, json.dumps(job_t))
                        logger.info(f"Scheduler queued tracking sync for tenant {tenant.id}")
                except Exception as tenant_err:
                    logger.error(f"Error queuing freight ingestion / tracking sync in scheduler: {str(tenant_err)}")
                    
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in scheduler thread loop: {str(e)}")
        
        # Poll/schedule check every 30 seconds
        time.sleep(30)

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
