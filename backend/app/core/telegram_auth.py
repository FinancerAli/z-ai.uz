import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

# auth_date maksimal yoshi — 24 soat (Telegram tavsiyasi bo'yicha)
# Bu Mini App ochilgandan keyin 10 daqiqa ichida user hech narsa qilmasa
# 401 olishini oldini oladi. HMAC tekshiruvi initData'ni qalbakilashtirishni
# imkonsiz qiladi, shuning uchun katta oyna xavfsiz.
AUTH_DATE_MAX_AGE_SECONDS = 86400


def validate_telegram_data(init_data: str, bot_token: str) -> dict | None:
    """
    Telegram Mini App initData'ni HMAC-SHA256 orqali tekshiradi.

    Telegram spetsifikatsiyasi (https://core.telegram.org/bots/webapps#validating-data):
        secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
        hash       = HMAC_SHA256(key=secret_key,   msg=data_check_string)

    Qaytaradi: tekshirilgan ma'lumotlar dict yoki None (xato bo'lsa).
    """
    try:
        # Bo'sh init_data — development bypass uchun ham None qaytaradi
        if not init_data:
            return None

        parsed_data = dict(parse_qsl(init_data, strict_parsing=False))
        if "hash" not in parsed_data:
            return None

        received_hash = parsed_data.pop("hash")

        # auth_date tekshiruvi
        auth_date_str = parsed_data.get("auth_date", "0")
        auth_date = int(auth_date_str) if auth_date_str.isdigit() else 0

        if not auth_date:
            return None

        now = int(time.time())

        # Kelajakdan kelgan so'rov (5 daqiqa skew ruxsat)
        if auth_date > now + 300:
            return None

        # Eskirgan so'rov — 10 daqiqadan eski
        if now - auth_date > AUTH_DATE_MAX_AGE_SECONDS:
            return None

        # Data-check-string: barcha maydonlar alfavit tartibida, "\n" bilan ajratilgan
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(parsed_data.items())
        )

        # TO'G'RI argument tartibi (Telegram spetsifikatsiyasi bo'yicha):
        #   1. secret_key = HMAC_SHA256(key=b"WebAppData", msg=bot_token)
        #   2. hash       = HMAC_SHA256(key=secret_key,   msg=data_check_string)
        secret_key = hmac.new(
            key=b"WebAppData",
            msg=bot_token.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()

        calculated_hash = hmac.new(
            key=secret_key,
            msg=data_check_string.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).hexdigest()

        # Timing-safe solishtirish
        if not hmac.compare_digest(calculated_hash, received_hash):
            return None

        # user maydoni JSON string — parse qilish
        if "user" in parsed_data:
            parsed_data["user"] = json.loads(parsed_data["user"])

        return parsed_data

    except Exception:
        return None
