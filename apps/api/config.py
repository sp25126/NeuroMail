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
    LOG_LEVEL: str = Field(default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO"))
    
    # Gmail OAuth
    GMAIL_CLIENT_ID: str = Field(default_factory=lambda: os.environ.get("GMAIL_CLIENT_ID", "mock_gmail_client_id"))
    GMAIL_CLIENT_SECRET: str = Field(default_factory=lambda: os.environ.get("GMAIL_CLIENT_SECRET", "mock_gmail_client_secret"))
    GMAIL_REDIRECT_URI: str = Field(default_factory=lambda: os.environ.get("GMAIL_REDIRECT_URI", "http://localhost:8000/auth/gmail/callback"))
    
    # Outlook OAuth
    OUTLOOK_CLIENT_ID: str = Field(default_factory=lambda: os.environ.get("OUTLOOK_CLIENT_ID", "mock_outlook_client_id"))
    OUTLOOK_CLIENT_SECRET: str = Field(default_factory=lambda: os.environ.get("OUTLOOK_CLIENT_SECRET", "mock_outlook_client_secret"))
    OUTLOOK_REDIRECT_URI: str = Field(default_factory=lambda: os.environ.get("OUTLOOK_REDIRECT_URI", "http://localhost:8000/auth/outlook/callback"))

    def validate_required(self):
        errors = []
        if not self.DATABASE_URL:
            errors.append("DATABASE_URL is missing")
        if not self.SECRET_KEY:
            errors.append("SECRET_KEY is missing")
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
