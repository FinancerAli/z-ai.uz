"""ZAI Platform — Configuration"""
from pydantic_settings import BaseSettings
from functools import lru_cache

# Default zaif JWT secret — production'da ishlatilmasligi kerak
_WEAK_JWT_SECRET = "zai-platform-jwt-secret-change-in-production"


class Settings(BaseSettings):
    # Telegram
    telegram_bot_token: str
    admin_telegram_id: int

    # JWT (alohida maxfiy kalit — bot token EMAS)
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    # Foydalanuvchi sessiyasi muddati (daqiqalarda)
    access_token_expire_minutes: int = 60  # 1 soat (eski: 7 kun — juda uzoq edi)

    # Telegram initData maksimal yoshi (soniyalarda)
    # 600 = 10 daqiqa — replay attack himoyasi
    auth_date_max_age_seconds: int = 600

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
    toncenter_api_key: str = ""
    ton_wallet_address: str = "EQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg6sdiohIwg5jL"
    ton_testnet_mode: bool = True        # True=testnet (dev), False=mainnet (prod)
    ton_webhook_secret: str = ""

    # TON narx konvertatsiyasi — UZS/TON kursi.
    # ⚠️ Bu vaqtinchalik fixed rate. Kelajakda admin panel orqali yoki tashqi
    # narx provider (CoinGecko/Cryptocompare) orqali dinamik o'rnatilishi kerak.
    # Hozirgi kurs (May 2026): 1 TON ≈ $2.35; 1 USD ≈ 12 200 UZS → 1 TON ≈ 28 670 UZS
    ton_uzs_rate: float = 28670.0   # 1 TON necha so'mga teng
    ton_payment_enabled: bool = True
    # Server-tomondan hisoblangan narx bilan blockchain summasi orasida
    # ruxsat etilgan farq. Kichik tolerans bo'lsin chunki TON oldindan
    # konvertatsiya qilinishi mumkin (oxirgi 1% farq).
    ton_amount_tolerance_pct: float = 1.0  # %

    # Click P2P Manual Payment
    click_p2p_url: str = ""
    click_receiver_name: str = "ZAI"
    click_payment_enabled: bool = True

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def jwt_secret_is_weak(self) -> bool:
        return not self.jwt_secret or self.jwt_secret == _WEAK_JWT_SECRET

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
