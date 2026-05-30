import base64
import hashlib
from cryptography.fernet import Fernet
from config import settings

def _derive_fernet_key(tenant_id: str) -> bytes:
    # Salt the secret key with tenant_id to derive a tenant-specific 32-byte key
    salt = tenant_id.encode()
    # We use PBKDF2-HMAC-SHA256 to derive the key
    key = hashlib.pbkdf2_hmac(
        'sha256',
        (settings.SECRET_KEY or "default_secret_key").encode(),
        salt,
        iterations=1000, # 1000 iterations for performance/simplicity in testing
        dklen=32
    )
    return base64.urlsafe_b64encode(key)

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
    return f.decrypt(encrypted_token.encode()).decode()
