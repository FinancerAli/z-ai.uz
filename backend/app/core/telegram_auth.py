import hashlib
import hmac
import json
from urllib.parse import parse_qsl

def validate_telegram_data(init_data: str, bot_token: str) -> dict | None:
    """
    Validates data received from Telegram Mini App.
    Returns the parsed data dictionary if valid, otherwise None.
    """
    try:
        parsed_data = dict(parse_qsl(init_data))
        if "hash" not in parsed_data:
            return None
        
        hash_value = parsed_data.pop("hash")
        
        # auth_date check
        import time
        now = int(time.time())
        auth_date = int(parsed_data.get("auth_date", "0"))
        
        if not auth_date:
            return None
            
        if auth_date > now + 300: # future skew
            return None
            
        if now - auth_date > 86400: # max age 24h
            return None
        
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(parsed_data.items())
        )
        
        secret_key = hmac.new("WebAppData".encode(), bot_token.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        
        if calculated_hash == hash_value:
            # Parse user JSON if exists
            if "user" in parsed_data:
                parsed_data["user"] = json.loads(parsed_data["user"])
            return parsed_data
        return None
    except Exception:
        return None
