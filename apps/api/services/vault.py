import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from config import settings

# In-memory secure credential store simulating a key vault
_vault = {}

def _get_fernet() -> Fernet:
    """
    Derives a stable Fernet key from the application SECRET_KEY.
    """
    if not settings.SECRET_KEY:
        raise ValueError("SECRET_KEY must be set for token encryption/decryption")
        
    password = settings.SECRET_KEY.encode()
    salt = os.environ.get("VAULT_SALT", "neuromail_foundation_salt").encode()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password))
    return Fernet(key)

def encrypt_token(raw_token: str) -> str:
    if not raw_token:
        return ""
    f = _get_fernet()
    return f.encrypt(raw_token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    if not encrypted_token:
        return ""
    f = _get_fernet()
    try:
        return f.decrypt(encrypted_token.encode()).decode()
    except Exception as e:
        raise ValueError(f"Failed to decrypt token: {str(e)}")

def store_token(token_ref: str, raw_token: str):
    """
    Stores an encrypted token in the vault.
    Note: In production, this would interface with AWS KMS, HashiCorp Vault, or Azure Key Vault.
    """
    _vault[token_ref] = encrypt_token(raw_token)

def retrieve_token(token_ref: str) -> str:
    """
    Retrieves and decrypts a token from the vault.
    """
    encrypted = _vault.get(token_ref)
    if not encrypted:
        raise ValueError(f"Token reference '{token_ref}' not found in vault")
    return decrypt_token(encrypted)
