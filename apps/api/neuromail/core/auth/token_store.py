import base64
import hashlib
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from config import settings

def _derive_fernet_key(tenant_id: str) -> bytes:
    """
    Derives a tenant-specific Fernet key using PBKDF2HMAC.
    Uses Phase 1 foundation standard: 100,000 iterations.
    """
    if not settings.SECRET_KEY:
        raise ValueError("SECRET_KEY must be set for token encryption/decryption")
        
    password = settings.SECRET_KEY.encode()
    salt = f"neuromail_token_salt_{tenant_id}".encode()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password))
    return key

def encrypt_token(raw_token: str, tenant_id: str) -> str:
    if not raw_token:
        return ""
    key = _derive_fernet_key(tenant_id)
    f = Fernet(key)
    return f.encrypt(raw_token.encode()).decode()

def decrypt_token(encrypted_token: str, tenant_id: str) -> str:
    if not encrypted_token:
        return ""
    key = _derive_fernet_key(tenant_id)
    f = Fernet(key)
    try:
        return f.decrypt(encrypted_token.encode()).decode()
    except Exception as e:
        raise ValueError(f"Failed to decrypt token for tenant {tenant_id}: {str(e)}")
