import urllib.parse
import requests
from config import settings

OUTLOOK_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
OUTLOOK_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

# REQUIRED Microsoft Graph delegated permissions
SCOPES = [
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
    "Calendars.Read",
    "offline_access"
]

def get_authorization_url(state: str) -> str:
    params = {
        "client_id": settings.OUTLOOK_CLIENT_ID,
        "redirect_uri": settings.OUTLOOK_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "response_mode": "query",
        "state": state
    }
    return f"{OUTLOOK_AUTH_URL}?{urllib.parse.urlencode(params)}"

def exchange_code_for_tokens(code: str) -> dict:
    data = {
        "client_id": settings.OUTLOOK_CLIENT_ID,
        "client_secret": settings.OUTLOOK_CLIENT_SECRET,
        "code": code,
        "redirect_uri": settings.OUTLOOK_REDIRECT_URI,
        "grant_type": "authorization_code",
        "scope": " ".join(SCOPES)
    }
    res = requests.post(OUTLOOK_TOKEN_URL, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to exchange Outlook OAuth code: {res.text}")
    return res.json()

def refresh_access_token(refresh_token: str) -> dict:
    data = {
        "client_id": settings.OUTLOOK_CLIENT_ID,
        "client_secret": settings.OUTLOOK_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "scope": " ".join(SCOPES)
    }
    res = requests.post(OUTLOOK_TOKEN_URL, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to refresh Outlook OAuth token: {res.text}")
    return res.json()
