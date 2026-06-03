import time
import logging
import random
import redis
from typing import Callable, Any
from config import settings

class RateLimitError(Exception):
    """Custom exception raised when rate limit is exceeded."""
    pass

logger = logging.getLogger("Mailboxes.RateLimiter")

# Local in-memory fallback for rate limiting if Redis is down
_local_buckets = {}

# Redis Lua script for atomic token bucket
ACQUIRE_LUA_SCRIPT = """
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket = redis.call('get', key)
local tokens, last_update

if bucket then
    local split = {}
    for s in string.gmatch(bucket, "([^:]+)") do
        table.insert(split, s)
    end
    tokens = tonumber(split[1])
    last_update = tonumber(split[2])
    
    local elapsed = math.max(0, now - last_update)
    tokens = math.min(capacity, tokens + elapsed * rate)
else
    tokens = capacity
    last_update = now
end

if tokens >= requested then
    tokens = tokens - requested
    redis.call('setex', key, 60, tokens .. ":" .. now)
    return 1
else
    return 0
end
"""

class TokenBucket:
    def __init__(self, mailbox_id: str, rate: float = 5.0, capacity: float = 10.0):
        """
        rate: tokens per second
        capacity: max tokens in bucket
        """
        self.mailbox_id = mailbox_id
        self.rate = rate
        self.capacity = capacity
        
        # Redis connection
        self.redis_client = None
        self._script = None
        if settings.REDIS_URL:
            try:
                self.redis_client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
                self._script = self.redis_client.register_script(ACQUIRE_LUA_SCRIPT)
            except Exception as e:
                logger.warning(f"Could not connect to Redis for rate limiting, using memory fallback: {str(e)}")

    def _acquire_redis(self) -> bool:
        """
        Acquire 1 token from the Redis token bucket atomically via Lua script.
        """
        key = f"rate_limit:mailbox:{self.mailbox_id}"
        now = time.time()
        try:
            # Returns 1 for success, 0 for failure
            res = self._script(keys=[key], args=[self.rate, self.capacity, now, 1.0])
            return bool(res)
        except Exception as e:
            logger.error(f"Redis rate limit Lua execution failed, falling back to memory: {str(e)}")
            return self._acquire_memory()

    def _acquire_memory(self) -> bool:
        """
        Acquire 1 token from the in-memory fallback bucket.
        """
        now = time.time()
        bucket = _local_buckets.get(self.mailbox_id)
        if not bucket:
            bucket = {"tokens": self.capacity, "last_update": now}
            _local_buckets[self.mailbox_id] = bucket

        # Fill bucket
        elapsed = now - bucket["last_update"]
        bucket["tokens"] = min(self.capacity, bucket["tokens"] + elapsed * self.rate)
        bucket["last_update"] = now

        if bucket["tokens"] >= 1.0:
            bucket["tokens"] -= 1.0
            return True
        return False

    def acquire(self) -> bool:
        if self.redis_client:
            try:
                return self._acquire_redis()
            except Exception:
                return self._acquire_memory()
        return self._acquire_memory()

def wait_for_token(mailbox_id: str, rate: float = 5.0, capacity: float = 10.0, timeout: float = 15.0) -> bool:
    bucket = TokenBucket(mailbox_id, rate, capacity)
    start_time = time.time()
    while time.time() - start_time < timeout:
        if bucket.acquire():
            return True
        # Sleep for a short interval before retrying
        time.sleep(0.1)
    return False

def execute_with_rate_limit(
    mailbox_id: str,
    fn: Callable[..., Any],
    *args,
    rate: float = 5.0,
    capacity: float = 10.0,
    max_retries: int = 5,
    initial_backoff: float = 1.0,
    max_wait: float = 30.0,
    fail_on_timeout: bool = False,
    **kwargs
) -> Any:
    # 1. Acquire token
    if not wait_for_token(mailbox_id, rate, capacity, timeout=max_wait):
        if fail_on_timeout:
            logger.error(f"Rate limiter timeout for mailbox {mailbox_id}. Aborting request.")
            raise TimeoutError(f"Rate limit acquisition timeout for mailbox {mailbox_id}")
        logger.warning(f"Rate limiter timeout waiting for token for mailbox {mailbox_id}. Proceeding anyway to prevent lockup.")
    
    # 2. Execute with backoff/retry
    retries = 0
    backoff = initial_backoff
    
    while True:
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            # Detect 429 or 503 or corresponding status code from exception
            status_code = None
            response_headers = {}
            
            # Check requests or HTTP exception shape
            if hasattr(e, "response") and e.response is not None:
                status_code = e.response.status_code
                response_headers = e.response.headers
            elif hasattr(e, "status_code"):
                status_code = e.status_code
            
            # If status code is 429 or 503, retry
            if status_code in (429, 503) and retries < max_retries:
                retries += 1
                
                # Check for Retry-After header (seconds)
                retry_after_str = response_headers.get("Retry-After", "")
                if retry_after_str.isdigit():
                    sleep_time = int(retry_after_str)
                else:
                    # Exponential backoff + jitter
                    sleep_time = backoff * (1.5 ** retries) + random.uniform(0, 0.5)
                
                logger.warning(
                    f"Quota event: HTTP {status_code} received for mailbox {mailbox_id}. "
                    f"Backing off for {sleep_time:.2f}s (retry {retries}/{max_retries}). Error: {str(e)}"
                )
                time.sleep(sleep_time)
                continue
            
            # If not 429/503 or max retries exceeded, raise error
            if retries >= max_retries:
                logger.error(f"Sustained 429/503 for mailbox {mailbox_id}. Max retries exceeded ({max_retries}).")
            raise e
