import asyncio
from app.core.telegram_auth import validate_telegram_data
from app.config import get_settings

settings = get_settings()
print('Token:', settings.telegram_bot_token)
