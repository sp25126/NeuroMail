import os
from pydantic import BaseModel, Field
from typing import Optional

def load_dotenv():
    # Simple zero-dependency .env loader
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
                        # Remove quotes if present
                        val = val.strip().strip("'").strip('"')
                        os.environ[key.strip()] = val

load_dotenv()

class Settings(BaseModel):
    APP_ENV: str = Field(default_factory=lambda: os.environ.get("APP_ENV", "development"))
    API_PORT: int = Field(default_factory=lambda: int(os.environ.get("API_PORT", "8000")))
    DATABASE_URL: str = Field(default_factory=lambda: os.environ.get("DATABASE_URL", ""))
    REDIS_URL: Optional[str] = Field(default_factory=lambda: os.environ.get("REDIS_URL"))
    SECRET_KEY: str = Field(default_factory=lambda: os.environ.get("SECRET_KEY", ""))
    WEBHOOK_SECRET: Optional[str] = Field(default_factory=lambda: os.environ.get("WEBHOOK_SECRET"))
    LOG_LEVEL: str = Field(default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO"))
    
    # Gmail OAuth
    GMAIL_CLIENT_ID: str = Field(default_factory=lambda: os.environ.get("GMAIL_CLIENT_ID", os.environ.get("GOOGLE_CLIENT_ID", "mock_gmail_client_id")))
    GMAIL_CLIENT_SECRET: str = Field(default_factory=lambda: os.environ.get("GMAIL_CLIENT_SECRET", os.environ.get("GOOGLE_CLIENT_SECRET", "mock_gmail_client_secret")))
    GMAIL_REDIRECT_URI: str = Field(default_factory=lambda: os.environ.get("GMAIL_REDIRECT_URI", os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/gmail/callback")))
    GOOGLE_OAUTH_SCOPES: str = Field(default_factory=lambda: os.environ.get("GOOGLE_OAUTH_SCOPES", "https://www.googleapis.com/auth/gmail.readonly"))
    GMAIL_PUB_SUB_TOPIC: Optional[str] = Field(default_factory=lambda: os.environ.get("GMAIL_PUB_SUB_TOPIC"))
    GCP_PROJECT_ID: Optional[str] = Field(default_factory=lambda: os.environ.get("GCP_PROJECT_ID", os.environ.get("GOOGLE_PROJECT_ID")))
    
    # TrackFlow redirect for OAuth
    TRACKFLOW_GMAIL_REDIRECT_URI: str = Field(default_factory=lambda: os.environ.get("TRACKFLOW_GMAIL_REDIRECT_URI", "http://localhost:8000/api/trackflow/mailboxes/gmail/callback"))

    # Outlook OAuth (Legacy)
    OUTLOOK_CLIENT_ID: str = Field(default_factory=lambda: os.environ.get("OUTLOOK_CLIENT_ID", "mock_outlook_client_id"))
    OUTLOOK_CLIENT_SECRET: str = Field(default_factory=lambda: os.environ.get("OUTLOOK_CLIENT_SECRET", "mock_outlook_client_secret"))
    OUTLOOK_REDIRECT_URI: str = Field(default_factory=lambda: os.environ.get("OUTLOOK_REDIRECT_URI", "http://localhost:8000/auth/outlook/callback"))

    # Microsoft / Outlook OAuth (Step 3)
    MICROSOFT_CLIENT_ID: Optional[str] = Field(default_factory=lambda: os.environ.get("MICROSOFT_CLIENT_ID"))
    MICROSOFT_CLIENT_SECRET: Optional[str] = Field(default_factory=lambda: os.environ.get("MICROSOFT_CLIENT_SECRET"))
    MICROSOFT_REDIRECT_URI: Optional[str] = Field(default_factory=lambda: os.environ.get("MICROSOFT_REDIRECT_URI", "http://localhost:8000/api/trackflow/mailboxes/outlook/callback"))
    MICROSOFT_TENANT_ID: str = Field(default_factory=lambda: os.environ.get("MICROSOFT_TENANT_ID", "common"))
    MICROSOFT_OAUTH_SCOPES: str = Field(default_factory=lambda: os.environ.get("MICROSOFT_OAUTH_SCOPES", "openid profile email offline_access User.Read Mail.Read"))

    # LLM Providers
    OPENAI_API_KEY: Optional[str] = Field(default_factory=lambda: os.environ.get("OPENAI_API_KEY"))
    ANTHROPIC_API_KEY: Optional[str] = Field(default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY"))
    GEMINI_API_KEY: Optional[str] = Field(default_factory=lambda: os.environ.get("GEMINI_API_KEY"))
    OPENROUTER_API_KEY: Optional[str] = Field(default_factory=lambda: os.environ.get("OPENROUTER_API_KEY"))
    OLLAMA_BASE_URL: str = Field(default_factory=lambda: os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"))

    def validate_required(self):
        errors = []
        if not self.DATABASE_URL:
            errors.append("DATABASE_URL is missing")
        if not self.SECRET_KEY:
            errors.append("SECRET_KEY is missing")
        
        # Enforce validation if Outlook integration is enabled (defined by client id presence or toggle)
        outlook_enabled = os.environ.get("OUTLOOK_INTEGRATION_ENABLED", "false").lower() == "true" or self.MICROSOFT_CLIENT_ID is not None
        if outlook_enabled:
            if not self.MICROSOFT_CLIENT_ID:
                errors.append("MICROSOFT_CLIENT_ID is missing")
            if not self.MICROSOFT_CLIENT_SECRET:
                errors.append("MICROSOFT_CLIENT_SECRET is missing")
            if not self.MICROSOFT_REDIRECT_URI:
                errors.append("MICROSOFT_REDIRECT_URI is missing")
                
        if errors:
            raise ValueError(f"Missing configuration variables: {', '.join(errors)}")

# Instantiate and validate config
settings = Settings()
try:
    settings.validate_required()
except Exception as e:
    # Fail fast at startup
    print(f"❌ Initialization Error: {str(e)}")
    import sys
    sys.exit(1)
