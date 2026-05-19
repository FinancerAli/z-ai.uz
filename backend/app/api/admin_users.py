"""ZAI — Admin User Management Router"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc, asc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.audit import log_audit
from app.database import get_db
from app.models import (
    User, Subscription, UserAgent, Agent, Task, PaymentTransaction,
)

router = APIRouter(prefix="/admin/users", tags=["admin"])


# ─── Pydantic Schemas ───────────────────────────────────────

class UserListItem(BaseModel):
    id: str
    telegram_id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    is_admin: bool
    is_premium: bool
    status: str
    balance: float
    created_at: datetime | None = None
    last_seen_at: datetime | None = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: list[UserListItem]
    total: int
    limit: int
    offset: int


class BlockRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class ExtendTrialRequest(BaseModel):
    days: int = Field(..., ge=1, le=30)


class SetDailyLimitRequest(BaseModel):
    limit: int = Field(..., ge=1, le=10000)


# ─── Endpoints ──────────────────────────────────────────────

@router.get("")
async def list_users(
    request: Request,
    search: str | None = None,
    status: str | None = None,
    plan: str | None = None,
    has_premium: bool | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    sort: str = "created_at",
    order: str = "desc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Foydalanuvchilar ro'yxati — qidirish, filter, pagination."""
    query = select(User)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                User.username.ilike(search_term),
                User.first_name.ilike(search_term),
                User.last_name.ilike(search_term),
                User.telegram_id == (int(search) if search.isdigit() else -1),
            )
        )

    if status:
        query = query.where(User.status == status)

    if has_premium is not None:
        query = query.where(User.is_premium == has_premium)

    if created_after:
        query = query.where(User.created_at >= created_after)

    if created_before:
        query = query.where(User.created_at <= created_before)

    if plan:
        query = query.join(Subscription).where(Subscription.plan == plan)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Sort
    sort_column = {
        "created_at": User.created_at,
        "last_seen_at": User.last_seen_at,
        "balance": User.balance,
    }.get(sort, User.created_at)

    query = query.order_by(desc(sort_column) if order == "desc" else asc(sort_column))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "items": [UserListItem.model_validate(u).model_dump() for u in users],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{user_id}")
async def user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Foydalanuvchi to'liq ma'lumoti."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    # Subscription
    sub_result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(desc(Subscription.created_at))
    )
    subscription = sub_result.scalars().first()

    # User Agents
    ua_result = await db.execute(
        select(UserAgent, Agent)
        .join(Agent, UserAgent.agent_id == Agent.id)
        .where(UserAgent.user_id == user_id)
    )
    agents = [
        {
            "id": ua.id,
            "slug": a.slug,
            "name": a.name,
            "status": ua.status,
            "plan_type": ua.plan_type,
            "expires_at": ua.expires_at.isoformat() if ua.expires_at else None,
            "tasks_used_today": ua.tasks_used_today,
        }
        for ua, a in ua_result.all()
    ]

    # Task stats
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.user_id == user_id)
    ) or 0
    today_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.user_id == user_id, Task.created_at >= today)
    ) or 0
    failed_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.user_id == user_id, Task.status == "failed")
    ) or 0

    # Payments
    payments_result = await db.execute(
        select(PaymentTransaction)
        .where(PaymentTransaction.user_id == user_id)
        .order_by(desc(PaymentTransaction.created_at))
        .limit(20)
    )
    payments = [
        {
            "id": p.id,
            "amount": p.amount,
            "currency": p.currency,
            "payment_method": p.payment_method,
            "status": p.status,
            "plan_type": p.plan_type,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in payments_result.scalars().all()
    ]

    return {
        "user": {
            "id": user.id,
            "telegram_id": user.telegram_id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "is_admin": user.is_admin,
            "is_premium": user.is_premium,
            "status": user.status,
            "balance": user.balance,
            "language_code": user.language_code,
            "blocked_reason": user.blocked_reason,
            "blocked_at": user.blocked_at.isoformat() if user.blocked_at else None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_seen_at": user.last_seen_at.isoformat() if user.last_seen_at else None,
        },
        "subscription": {
            "id": subscription.id,
            "plan": subscription.plan,
            "status": subscription.status,
            "monthly_limit": subscription.monthly_limit,
            "used_count": subscription.used_count,
            "started_at": subscription.started_at.isoformat() if subscription and subscription.started_at else None,
            "expires_at": subscription.expires_at.isoformat() if subscription and subscription.expires_at else None,
        } if subscription else None,
        "agents": agents,
        "task_stats": {
            "total": total_tasks,
            "today": today_tasks,
            "failed": failed_tasks,
        },
        "payments": payments,
    }


@router.post("/{user_id}/block")
async def block_user(
    user_id: str,
    req: BlockRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Foydalanuvchini bloklash."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    now = datetime.now(timezone.utc)
    user.status = "blocked"
    user.blocked_reason = req.reason
    user.blocked_at = now
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="block_user",
        target_type="user",
        target_id=user_id,
        payload={"reason": req.reason},
        request=request,
    )

    return {"message": "Foydalanuvchi bloklandi", "user_id": user_id}


@router.post("/{user_id}/unblock")
async def unblock_user(
    user_id: str,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Foydalanuvchini blokdan chiqarish."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    user.status = "active"
    user.blocked_reason = None
    user.blocked_at = None
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="unblock_user",
        target_type="user",
        target_id=user_id,
        request=request,
    )

    return {"message": "Foydalanuvchi blokdan chiqarildi", "user_id": user_id}


@router.post("/{user_id}/extend-trial")
async def extend_trial(
    user_id: str,
    req: ExtendTrialRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trial muddatini uzaytirish (sub yo'q bo'lsa yaratiladi)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    sub_result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(desc(Subscription.created_at))
    )
    subscription = sub_result.scalars().first()

    now = datetime.now(timezone.utc)
    if not subscription:
        # Sub yo'q — yangi trial yaratamiz (P1.1 fix)
        subscription = Subscription(
            user_id=user_id,
            plan="trial",
            status="active",
            started_at=now,
            expires_at=now + timedelta(days=req.days),
            monthly_limit=10,
            used_count=0,
        )
        db.add(subscription)
    else:
        # Mavjud sub — expires_at uzaytiramiz va plan/status'ni "trial active" ga o'tkazamiz
        # P0.1 fix: tasks.py `sub.plan == "trial" AND sub.status == "active"` ni talab qiladi
        if subscription.expires_at:
            base = subscription.expires_at if subscription.expires_at > now else now
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
            subscription.expires_at = base + timedelta(days=req.days)
        else:
            subscription.expires_at = now + timedelta(days=req.days)
        subscription.plan = "trial"
        subscription.status = "active"

    await db.commit()
    await db.refresh(subscription)

    await log_audit(
        admin_id=admin.id,
        action="extend_trial",
        target_type="user",
        target_id=user_id,
        payload={
            "days": req.days,
            "new_expires_at": str(subscription.expires_at),
            "plan": subscription.plan,
            "status": subscription.status,
        },
        request=request,
    )

    return {
        "message": f"Trial {req.days} kunga uzaytirildi",
        "expires_at": subscription.expires_at.isoformat(),
        "plan": subscription.plan,
        "status": subscription.status,
    }


@router.post("/{user_id}/reset-trial")
async def reset_trial(
    user_id: str,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trial qayta boshlash — yangi 3 kunlik trial yaratish.
    Eski active subscription'lar 'expired' deb belgilanadi (multiple active sub muammosini oldini olish).
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    now = datetime.now(timezone.utc)

    # P1.3 himoya: eski "active" subscription'larni "expired" qilamiz
    # — keyinchalik agent_engine.scalar_one_or_none() MultipleResultsFound bermasligi uchun
    old_subs_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
        )
    )
    for old_sub in old_subs_result.scalars().all():
        old_sub.status = "expired"

    new_sub = Subscription(
        user_id=user_id,
        plan="trial",  # P0.2 fix: "free_beta" → "trial" (tasks.py shartiga mos)
        status="active",
        started_at=now,
        expires_at=now + timedelta(days=3),
        monthly_limit=10,  # 50 → 10 (tasks.py daily limit standartiga mos)
        used_count=0,
    )
    db.add(new_sub)
    await db.commit()
    await db.refresh(new_sub)

    await log_audit(
        admin_id=admin.id,
        action="reset_trial",
        target_type="user",
        target_id=user_id,
        payload={"new_subscription_id": new_sub.id, "plan": "trial"},
        request=request,
    )

    return {
        "message": "Trial qayta boshlandi (3 kun)",
        "subscription_id": new_sub.id,
        "expires_at": new_sub.expires_at.isoformat() if new_sub.expires_at else None,
    }


@router.post("/{user_id}/set-daily-limit")
async def set_daily_limit(
    user_id: str,
    req: SetDailyLimitRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Subscription monthly_limit o'zgartirish."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    sub_result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(desc(Subscription.created_at))
    )
    subscription = sub_result.scalars().first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription topilmadi")

    old_limit = subscription.monthly_limit
    subscription.monthly_limit = req.limit
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="set_daily_limit",
        target_type="user",
        target_id=user_id,
        payload={"old_limit": old_limit, "new_limit": req.limit},
        request=request,
    )

    return {"message": f"Limit {req.limit} ga o'zgartirildi", "old_limit": old_limit, "new_limit": req.limit}


@router.post("/{user_id}/expire-trial")
async def expire_trial(
    user_id: str,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trial muddatini tugatish — subscription expired qilinadi va expires_at = now().
    Paid (monthly/weekly) UserAgent'larga tegmaydi."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    sub_result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(desc(Subscription.created_at))
    )
    subscription = sub_result.scalars().first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription topilmadi")

    now = datetime.now(timezone.utc)

    # Trial subscription'ni tugatish
    subscription.status = "expired"
    subscription.expires_at = now  # Frontend getTrialDaysLeft() = 0 bo'lishi uchun

    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="trial_cancelled",
        target_type="user",
        target_id=user_id,
        payload={
            "reason": "Admin tomonidan trial tugatildi",
            "old_plan": subscription.plan,
            "old_status": "active",
        },
        request=request,
    )

    return {"message": "Trial muddati tugatildi", "user_id": user_id}
