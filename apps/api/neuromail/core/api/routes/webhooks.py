from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session
from typing import Optional
import json
import logging

from database import get_db
from neuromail.core.mailboxes.gmail_webhook import process_gmail_webhook_payload
from neuromail.core.mailboxes.outlook_webhook import process_outlook_webhook_payload

from config import settings
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

logger = logging.getLogger("API.Webhooks")

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

def validate_webhook_secret(token: Optional[str] = Query(None)):
    if settings.WEBHOOK_SECRET and token != settings.WEBHOOK_SECRET:
        logger.warning(f"Invalid webhook secret provided: {token}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook secret"
        )

def validate_gmail_signature(request: Request):
    """
    Validates the Google ID Token in the Authorization header.
    Only active if GCP_PROJECT_ID is set.
    """
    if not settings.GCP_PROJECT_ID:
        return
        
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning("Missing or invalid Authorization header in Gmail webhook")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Google signature"
        )
        
    token = auth_header.split(" ")[1]
    try:
        # The audience is usually the URL of the webhook
        id_token.verify_oauth2_token(token, google_requests.Request())
    except Exception as e:
        logger.error(f"Gmail webhook signature verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Invalid Google signature: {str(e)}"
        )

@router.post("/gmail")
def gmail_webhook(
    payload: dict, 
    request: Request,
    db: Session = Depends(get_db),
    _secret_auth = Depends(validate_webhook_secret),
    _sig_auth = Depends(validate_gmail_signature)
):
    """
    Gmail Pub/Sub push notification webhook.
    """
    logger.info(f"Received Gmail webhook payload: {payload}")
    try:
        res = process_gmail_webhook_payload(payload, db)
        return res
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as e:
        logger.error(f"Gmail webhook execution error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/outlook")
def outlook_webhook(
    request: Request,
    validationToken: str = Query(None),
    token: str = Query(None),
    db: Session = Depends(get_db)
):
    """
    Microsoft Graph change notification webhook.
    Handles validation challenge and parses push notifications.
    """
    # 1. Validation Challenge: MS Graph sends validationToken as query param
    if validationToken:
        logger.info(f"Received Outlook validation challenge: {validationToken}")
        return Response(content=validationToken, media_type="text/plain")
        
    # 2. Secret validation
    validate_webhook_secret(token)
        
    try:
        payload = request.state.json_body if hasattr(request.state, 'json_body') else {}
    except Exception:
        payload = {}
        
    # Standard FastAPI reading payload from request body
    async def get_body():
        try:
            body = await request.body()
            return json.loads(body.decode())
        except Exception:
            return {}
            
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    if not payload:
        if loop.is_running():
            payload = request.scope.get("_json_payload", {})
        else:
            payload = loop.run_until_complete(get_body())
            
    logger.info(f"Received Outlook webhook payload: {payload}")
    
    value_list = payload.get("value", [])
    if not value_list:
        # Return 202 accepted per MS Graph docs even for invalid payload to prevent retry loops
        return Response(status_code=202)
        
    try:
        process_outlook_webhook_payload(payload, db)
    except Exception as e:
        logger.error(f"Outlook webhook execution error: {str(e)}")
        
    return Response(status_code=202)
