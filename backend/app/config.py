"""ZAI Platform — Configuration"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Telegram
    telegram_bot_token: str
    admin_telegram_id: int

    # JWT (alohida maxfiy kalit — bot token EMAS)
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 kun

    # AI API (OpenAI-compatible)
    ai_api_key: str = ""
    ai_base_url: str = "https://api.krouter.net/v1"
    ai_model: str = "cx/gpt-5.5-xhigh"

    # Database
    database_url: str = "sqlite+aiosqlite:///./zai.db"

    # App
    app_name: str = "ZAI"
    app_env: str = "development"
    debug: bool = False  # PRODUCTION: False

    # TON Blockchain Payments
    toncenter_api_key: str = ""          # https://t.me/tonapibot — bepul API key
    ton_wallet_address: str = "UQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg6sdiohIwg5jL"
    ton_testnet_mode: bool = True        # True=testnet (dev), False=mainnet (prod)
    ton_webhook_secret: str = ""         # Webhook xavfsizligi uchun

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"



@lru_cache()
def get_settings() -> Settings:
    return Settings()
