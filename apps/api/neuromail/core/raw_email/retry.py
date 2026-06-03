import time
import functools
import logging
from typing import Tuple, Type

logger = logging.getLogger("RetryDecorator")

def retry(exceptions: Tuple[Type[Exception], ...], tries: int = 3, delay: float = 0.5, backoff: float = 2.0):
    """
    Retry calling the decorated function using an exponential backoff.
    
    :param exceptions: The exception(s) to check. Can be a tuple of exceptions.
    :param tries: Number of times to try before giving up.
    :param delay: Initial delay between retries in seconds.
    :param backoff: Backoff multiplier (e.g. value of 2 will double the delay each retry).
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            mtries, mdelay = tries, delay
            while mtries > 1:
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    logger.warning(f"Exception '{str(e)}' caught. Retrying '{func.__name__}' in {mdelay}s... ({mtries-1} attempts left)")
                    time.sleep(mdelay)
                    mtries -= 1
                    mdelay *= backoff
            # Last try
            return func(*args, **kwargs)
        return wrapper
    return decorator
