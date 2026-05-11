from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timedelta, timezone
import json

from app.database import get_db
from app.models import User, Subscription
from app.core.telegram_auth import validate_telegram_data
from app.core.security import create_access_token
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


class TelegramAuthRequest(BaseModel):
    init_data: str


class AuthResponse(BaseModel):
    token: str
    user: dict
    is_new_user: bool


@router.post("/telegram", response_model=AuthResponse)
async def authenticate_telegram_user(
    req: TelegramAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user via Telegram initData (HMAC validated)."""
    parsed_data = validate_telegram_data(req.init_data, settings.telegram_bot_token)

    if not parsed_data or "user" not in parsed_data:
        raise HTTPException(status_code=401, detail="Noto'g'ri Telegram ma'lumotlari")

    tg_user = parsed_data["user"]
    tg_id = tg_user.get("id")

    if not tg_id:
        raise HTTPException(status_code=401, detail="User ID topilmadi")

    # Bazada foydalanuvchini tekshirish
    result = await db.execute(select(User).where(User.telegram_id == tg_id))
    user = result.scalars().first()

    is_new_user = False

    if not user:
        is_new_user = True
        user = User(
            telegram_id=tg_id,
            username=tg_user.get("username", ""),
            first_name=tg_user.get("first_name", ""),
            last_name=tg_user.get("last_name", ""),
            language_code=tg_user.get("language_code", "uz"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # 3 kunlik trial obuna
        now = datetime.now(timezone.utc)
        subscription = Subscription(
            user_id=user.id,
            plan="trial",
            status="active",
            monthly_limit=10,  # kuniga 10 ta
            used_count=0,
            started_at=now,
            expires_at=now + timedelta(days=3),
        )
        db.add(subscription)
        await db.commit()
    else:
        user.username = tg_user.get("username", user.username)
        user.first_name = tg_user.get("first_name", user.first_name)
        user.last_name = tg_user.get("last_name", user.last_name)
        await db.commit()

    # JWT token yaratish
    token = create_access_token({"sub": user.id, "tg_id": user.telegram_id})

    # Subscription ma'lumotlari
    sub_result = await db.execute(
        select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.created_at.desc())
    )
    sub = sub_result.scalars().first()

    user_data = {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "first_name": user.first_name,
        "username": user.username,
        "plan": sub.plan if sub else "none",
        "trial_expires_at": sub.expires_at.isoformat() if sub and sub.expires_at else None,
        "daily_limit": sub.monthly_limit if sub else 0,
    }

    return AuthResponse(token=token, user=user_data, is_new_user=is_new_user)
