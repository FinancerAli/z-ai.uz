from fastapi import APIRouter, HTTPException, Depends, Request
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
from app.core.limiter import limiter
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


class TelegramAuthRequest(BaseModel):
    init_data: str


class AuthResponse(BaseModel):
    token: str
    user: dict
    is_new_user: bool


@router.post("/telegram", response_model=AuthResponse)
@limiter.limit("10/minute")
async def authenticate_telegram_user(
    request: Request,
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
            is_premium=tg_user.get("is_premium", False),
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
        user.last_seen_at = datetime.now(timezone.utc)
        user.is_premium = tg_user.get("is_premium", False)
        await db.commit()

    # JWT token yaratish
    token = create_access_token({"sub": user.id, "tg_id": user.telegram_id})

    # Subscription ma'lumotlari
    sub_result = await db.execute(
        select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.created_at.desc())
    )
    sub = sub_result.scalars().first()

    # Bugun ishlatilgan task'lar (UserAgent.tasks_used_today summasi + Subscription.used_count fallback)
    # Trial foydalanuvchi uchun kunlik limit Subscription.monthly_limit'da kuniga = 10 ta deb saqlangan.
    # used_today'ni Task jadvalidan bugungi sana bo'yicha sanaymiz.
    from app.models import Task, UserAgent, Agent
    from sqlalchemy import func, and_
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    used_today_result = await db.execute(
        select(func.count(Task.id)).where(
            and_(Task.user_id == user.id, Task.created_at >= today_start)
        )
    )
    used_today = int(used_today_result.scalar() or 0)

    # Plan label: subscription yo'q lekin aktiv agent bor bo'lsa — "active"
    # Agar sub.status == "expired" — trial tugagan, aktiv agent bormi tekshiramiz
    if sub and sub.status == "active":
        plan_label = sub.plan
    elif sub and sub.status == "expired":
        active_count = await db.scalar(
            select(func.count(UserAgent.id)).where(
                and_(UserAgent.user_id == user.id, UserAgent.status == "active"),
            )
        )
        plan_label = "active" if (active_count or 0) > 0 else "none"
    elif sub:
        plan_label = sub.plan
    else:
        active_count = await db.scalar(
            select(func.count(UserAgent.id)).where(
                and_(UserAgent.user_id == user.id, UserAgent.status == "active"),
            )
        )
        plan_label = "active" if (active_count or 0) > 0 else "none"

    # Daily limit: sub bo'lsa sub.monthly_limit, aks holda Agent.daily_limit dan max
    daily_limit = sub.monthly_limit if sub else 0
    if not daily_limit:
        ua_max = await db.scalar(
            select(func.max(Agent.daily_limit))
            .select_from(UserAgent)
            .join(Agent, Agent.id == UserAgent.agent_id)
            .where(
                and_(UserAgent.user_id == user.id, UserAgent.status == "active"),
            )
        )
        daily_limit = int(ua_max or 0)

    # Super admin tekshiruvi
    is_super_admin = user.telegram_id == settings.admin_telegram_id

    user_data = {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "first_name": user.first_name,
        "username": user.username,
        "plan": plan_label,
        "trial_expires_at": sub.expires_at.isoformat() if sub and sub.expires_at else None,
        "daily_limit": daily_limit,
        "used_today": used_today,
        "is_premium": user.is_premium,
        "is_admin": user.is_admin or is_super_admin,
    }

    return AuthResponse(token=token, user=user_data, is_new_user=is_new_user)


@router.get("/me/usage")
async def my_usage(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Hozirgi foydalanuvchi bugungi usage'ini qaytaradi.
    Frontend Create sahifasida limit indikatorini ko'rsatish uchun ishlatadi.
    """
    sub_result = await db.execute(
        select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.created_at.desc())
    )
    sub = sub_result.scalars().first()

    from app.models import Task, UserAgent, Agent
    from sqlalchemy import func, and_
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    used_today_result = await db.execute(
        select(func.count(Task.id)).where(
            and_(Task.user_id == user.id, Task.created_at >= today_start)
        )
    )
    used_today = int(used_today_result.scalar() or 0)

    # Daily limit hisoblash:
    #  - Agar subscription bor bo'lsa — sub.monthly_limit
    #  - Aks holda, mavjud aktiv UserAgent'lardan eng yuqori Agent.daily_limit
    daily_limit = sub.monthly_limit if sub else 0
    if not daily_limit:
        ua_result = await db.execute(
            select(func.max(Agent.daily_limit))
            .select_from(UserAgent)
            .join(Agent, Agent.id == UserAgent.agent_id)
            .where(
                and_(UserAgent.user_id == user.id, UserAgent.status == "active"),
            )
        )
        daily_limit = int(ua_result.scalar() or 0)

    # Premium bonus: Hardening Faza 4 — 1.5x limit
    if user.is_premium and daily_limit > 0:
        daily_limit = int(daily_limit * 1.5)

    # Plan label: agar sub yo'q lekin aktiv agent bor bo'lsa "active" deb ko'rsatamiz
    # Agar sub.status == "expired" bo'lsa — trial tugagan, "trial" emas "none" qaytaramiz
    # (agar aktiv agent bor bo'lsa "active" qaytaramiz).
    if sub and sub.status == "active":
        plan_label = sub.plan
    elif sub and sub.status == "expired":
        # Trial expired — aktiv agent bormi tekshiramiz
        active_count_result = await db.execute(
            select(func.count(UserAgent.id)).where(
                and_(UserAgent.user_id == user.id, UserAgent.status == "active"),
            )
        )
        plan_label = "active" if (active_count_result.scalar() or 0) > 0 else "none"
    elif sub:
        plan_label = sub.plan
    else:
        active_count_result = await db.execute(
            select(func.count(UserAgent.id)).where(
                and_(UserAgent.user_id == user.id, UserAgent.status == "active"),
            )
        )
        plan_label = "active" if (active_count_result.scalar() or 0) > 0 else "none"

    return {
        "plan": plan_label,
        "trial_expires_at": sub.expires_at.isoformat() if sub and sub.expires_at else None,
        "daily_limit": daily_limit,
        "used_today": used_today,
        "remaining": max(0, daily_limit - used_today),
        "is_premium": user.is_premium,
    }
