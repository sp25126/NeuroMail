import urllib.parse
import requests
from config import settings

GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"

# REQUIRED Gmail API scopes: gmail.readonly, gmail.modify, gmail.send, gmail.labels
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels"
]

def get_authorization_url(state: str) -> str:
    params = {
        "client_id": settings.GMAIL_CLIENT_ID,
        "redirect_uri": settings.GMAIL_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state
    }
    return f"{GMAIL_AUTH_URL}?{urllib.parse.urlencode(params)}"

def exchange_code_for_tokens(code: str) -> dict:
    data = {
        "code": code,
        "client_id": settings.GMAIL_CLIENT_ID,
        "client_secret": settings.GMAIL_CLIENT_SECRET,
        "redirect_uri": settings.GMAIL_REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    res = requests.post(GMAIL_TOKEN_URL, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to exchange Google OAuth code: {res.text}")
    
    return res.json()

def refresh_access_token(refresh_token: str) -> dict:
    data = {
        "refresh_token": refresh_token,
        "client_id": settings.GMAIL_CLIENT_ID,
        "client_secret": settings.GMAIL_CLIENT_SECRET,
        "grant_type": "refresh_token"
    }
    res = requests.post(GMAIL_TOKEN_URL, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to refresh Google OAuth token: {res.text}")
    
    return res.json()
