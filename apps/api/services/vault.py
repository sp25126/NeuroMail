import base64
from config import settings

# In-memory secure credential store simulating a key vault
_vault = {}

def encrypt_token(raw_token: str) -> str:
    key = settings.SECRET_KEY or "default_secret_key"
    key_bytes = key.encode()
    token_bytes = raw_token.encode()
    encrypted_bytes = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(token_bytes))
    return base64.b64encode(encrypted_bytes).decode()

def decrypt_token(encrypted_token: str) -> str:
    key = settings.SECRET_KEY or "default_secret_key"
    key_bytes = key.encode()
    encrypted_bytes = base64.b64decode(encrypted_token.encode())
    decrypted_bytes = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(encrypted_bytes))
    return decrypted_bytes.decode()

def store_token(token_ref: str, raw_token: str):
    _vault[token_ref] = encrypt_token(raw_token)

def retrieve_token(token_ref: str) -> str:
    encrypted = _vault.get(token_ref)
    if not encrypted:
        raise ValueError("Token reference not found in vault")
    return decrypt_token(encrypted)
