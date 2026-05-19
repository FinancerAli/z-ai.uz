"""Admin API for ZAI operations."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_db
from app.models import Agent, Task, User, UserAgent, Subscription, PaymentTransaction

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminStatsOut(BaseModel):
    total_users: int
    active_agents: int
    pending_purchases: int
    active_user_agents: int
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    today_tasks: int
    tokens_used: int
    cost: float
    trial_users: int
    expired_trials: int
    total_revenue: float


class AdminTaskOut(BaseModel):
    id: str
    user_id: str
    telegram_id: int
    username: str | None
    agent_id: str
    agent_name: str
    agent_slug: str
    input_text: str
    output_text: str | None
    status: str
    error_message: str | None
    tokens_used: int
    cost: float
    created_at: str
    completed_at: str | None


class AdminUserOut(BaseModel):
    id: str
    telegram_id: int
    username: str | None
    first_name: str | None
    plan: str
    status: str
    trial_expires_at: str | None
    tasks_count: int
    created_at: str


def _status_filter(status: str | None) -> list[str] | None:
    if not status:
        return None
    return {
        "queued": ["queued", "pending"],
        "running": ["running", "processing"],
        "completed": ["completed", "done"],
        "failed": ["failed"],
    }.get(status, [status])


@router.get("/stats", response_model=AdminStatsOut)
async def admin_stats(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    async def scalar(stmt, default=0):
        result = await db.execute(stmt)
        return result.scalar() or default

    return AdminStatsOut(
        total_users=await scalar(select(func.count(User.id))),
        active_agents=await scalar(select(func.count(Agent.id)).where(Agent.is_active == True)),
        pending_purchases=await scalar(select(func.count(UserAgent.id)).where(UserAgent.status == "pending")),
        active_user_agents=await scalar(select(func.count(UserAgent.id)).where(UserAgent.status == "active")),
        total_tasks=await scalar(select(func.count(Task.id))),
        completed_tasks=await scalar(select(func.count(Task.id)).where(Task.status.in_(["completed", "done"]))),
        failed_tasks=await scalar(select(func.count(Task.id)).where(Task.status == "failed")),
        today_tasks=await scalar(select(func.count(Task.id)).where(Task.created_at >= today)),
        tokens_used=await scalar(select(func.sum(Task.tokens_used))),
        cost=float(await scalar(select(func.sum(Task.cost)), 0.0)),
        trial_users=await scalar(select(func.count(Subscription.id)).where(
            Subscription.plan == "trial", Subscription.status == "active"
        )),
        expired_trials=await scalar(select(func.count(Subscription.id)).where(
            Subscription.plan == "trial", Subscription.status == "expired"
        )),
        total_revenue=float(await scalar(select(func.sum(PaymentTransaction.amount)).where(
            PaymentTransaction.status == "completed"
        ), 0.0)),
    )


@router.get("/tasks", response_model=list[AdminTaskOut])
async def admin_tasks(
    limit: int = 50,
    status: str | None = None,
    agent_slug: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    safe_limit = min(max(limit, 1), 200)
    query = (
        select(Task, Agent, User)
        .join(Agent, Task.agent_id == Agent.id)
        .join(User, Task.user_id == User.id)
        .order_by(desc(Task.created_at))
        .limit(safe_limit)
    )
    statuses = _status_filter(status)
    if statuses:
        query = query.where(Task.status.in_(statuses))
    if agent_slug:
        query = query.where(Agent.slug == agent_slug)

    result = await db.execute(query)
    return [
        AdminTaskOut(
            id=task.id,
            user_id=user.id,
            telegram_id=user.telegram_id,
            username=user.username,
            agent_id=agent.id,
            agent_name=agent.name,
            agent_slug=agent.slug,
            input_text=task.input_text,
            output_text=task.output_text,
            status=task.status,
            error_message=task.error_message,
            tokens_used=task.tokens_used or 0,
            cost=task.cost or 0.0,
            created_at=task.created_at.isoformat() if task.created_at else "",
            completed_at=task.completed_at.isoformat() if task.completed_at else None,
        )
        for task, agent, user in result.all()
    ]


# ============ FOYDALANUVCHILAR BOSHQARUVI ============

@router.get("/users-legacy", response_model=list[AdminUserOut])
async def admin_users_legacy(
    limit: int = 50,
    search: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[DEPRECATED] Eski format. Yangi panel /api/admin/users ishlatadi (admin_users.py)."""
    safe_limit = min(max(limit, 1), 200)

    # Query 1: task counts per user in a single GROUP BY aggregation
    task_count_subq = (
        select(Task.user_id, func.count(Task.id).label("tasks_count"))
        .group_by(Task.user_id)
        .subquery()
    )

    # Query 2: users + latest subscription + task count — all in one round-trip
    query = (
        select(User, Subscription, task_count_subq.c.tasks_count)
        .outerjoin(Subscription, Subscription.user_id == User.id)
        .outerjoin(task_count_subq, task_count_subq.c.user_id == User.id)
        .order_by(desc(User.created_at))
        .limit(safe_limit)
    )

    if search:
        query = query.where(
            User.username.ilike(f"%{search}%") | User.first_name.ilike(f"%{search}%")
        )

    result = await db.execute(query)
    return [
        AdminUserOut(
            id=user.id,
            telegram_id=user.telegram_id,
            username=user.username,
            first_name=user.first_name,
            plan=sub.plan if sub else "none",
            status=sub.status if sub else "none",
            trial_expires_at=sub.expires_at.isoformat() if sub and sub.expires_at else None,
            tasks_count=tasks_count or 0,
            created_at=user.created_at.isoformat() if user.created_at else "",
        )
        for user, sub, tasks_count in result.all()
    ]


@router.post("/users/{user_id}/extend-trial-legacy")
async def extend_trial_legacy(
    user_id: str,
    days: int = 3,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[DEPRECATED] Yangi: admin_users.py POST /admin/users/{id}/extend-trial (audit log bilan)."""
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id).order_by(desc(Subscription.created_at))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription topilmadi")

    now = datetime.now(timezone.utc)
    base = sub.expires_at if sub.expires_at and sub.expires_at > now else now
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)

    sub.expires_at = base + timedelta(days=days)
    sub.status = "active"
    sub.plan = "trial"
    await db.commit()

    return {"message": f"Trial {days} kunga uzaytirildi", "expires_at": sub.expires_at.isoformat()}


@router.post("/users/{user_id}/block-legacy")
async def block_user_legacy(
    user_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[DEPRECATED] Yangi: admin_users.py POST /admin/users/{id}/block (sabab + audit log bilan)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    user.status = "blocked"
    await db.commit()
    return {"message": "Foydalanuvchi bloklandi", "user_id": user_id}


@router.post("/users/{user_id}/unblock-legacy")
async def unblock_user_legacy(
    user_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[DEPRECATED] Yangi: admin_users.py POST /admin/users/{id}/unblock (audit log bilan)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    user.status = "active"
    await db.commit()
    return {"message": "Foydalanuvchi blokdan chiqarildi", "user_id": user_id}


# ============ AGENT BOSHQARUVI ============

@router.post("/agents/{slug}/toggle")
async def toggle_agent(
    slug: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agentni yoqish/o'chirish."""
    result = await db.execute(select(Agent).where(Agent.slug == slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")
    agent.is_active = not agent.is_active
    await db.commit()
    return {"message": f"Agent {'faollashtirildi' if agent.is_active else 'o`chirildi'}", "is_active": agent.is_active}


class PriceUpdateRequest(BaseModel):
    price_monthly: float


@router.put("/agents/{slug}/price")
async def update_agent_price(
    slug: str,
    req: PriceUpdateRequest,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agent narxini o'zgartirish."""
    result = await db.execute(select(Agent).where(Agent.slug == slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")
    agent.price_monthly = req.price_monthly
    await db.commit()
    return {"message": f"Narx yangilandi: {req.price_monthly} so'm", "slug": slug}


# ============ TO'LOV TARIXI ============

@router.get("/payments")
async def admin_payments(
    limit: int = 50,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """To'lov tarixi."""
    result = await db.execute(
        select(PaymentTransaction, User)
        .join(User, PaymentTransaction.user_id == User.id)
        .order_by(desc(PaymentTransaction.created_at))
        .limit(min(limit, 200))
    )
    return [
        {
            "id": pt.id,
            "user": u.first_name or u.username,
            "telegram_id": u.telegram_id,
            "amount": pt.amount,
            "currency": pt.currency,
            "method": pt.payment_method,
            "status": pt.status,
            "plan_type": pt.plan_type,
            "created_at": pt.created_at.isoformat() if pt.created_at else "",
        }
        for pt, u in result.all()
    ]


# ============ DAROMAD STATISTIKASI ============

@router.get("/revenue")
async def admin_revenue(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Umumiy daromad statistikasi."""
    total = await db.execute(
        select(func.sum(PaymentTransaction.amount)).where(PaymentTransaction.status == "completed")
    )
    total_revenue = total.scalar() or 0

    by_method = await db.execute(
        select(PaymentTransaction.payment_method, func.sum(PaymentTransaction.amount), func.count(PaymentTransaction.id))
        .where(PaymentTransaction.status == "completed")
        .group_by(PaymentTransaction.payment_method)
    )

    return {
        "total_revenue": float(total_revenue),
        "by_method": [
            {"method": row[0], "amount": float(row[1] or 0), "count": row[2]}
            for row in by_method.all()
        ],
    }

