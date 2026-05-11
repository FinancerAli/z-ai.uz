"""
ZAI Platform — JWT Security
Alohida maxfiy kalit ishlatiladi (bot token EMAS).
"""
import secrets
import jwt
from datetime import datetime, timedelta, timezone
from app.config import get_settings

settings = get_settings()

# JWT_SECRET bo'sh bo'lsa, random generatsiya qilish (development uchun)
# PRODUCTION: .env faylda JWT_SECRET=... qo'yilishi SHART
SECRET_KEY = settings.jwt_secret or secrets.token_hex(32)
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.jwt_expire_minutes


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None  # token muddati o'tgan
    except jwt.PyJWTError:
        return None
