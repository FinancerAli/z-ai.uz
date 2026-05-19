"""ZAI — Admin Analytics Router"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_db
from app.models import User, Task, Agent, PaymentTransaction, AnalyticsEvent

router = APIRouter(prefix="/admin/analytics", tags=["admin"])


@router.get("/dashboard")
async def dashboard_metrics(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard uchun asosiy metrikalar."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # ─── Users ───────────────────────────────────────────
    total_users = await db.scalar(select(func.count(User.id))) or 0
    active_today = await db.scalar(
        select(func.count(User.id)).where(User.last_seen_at >= today)
    ) or 0
    new_week = await db.scalar(
        select(func.count(User.id)).where(User.created_at >= week_ago)
    ) or 0
    new_month = await db.scalar(
        select(func.count(User.id)).where(User.created_at >= month_ago)
    ) or 0
    premium_count = await db.scalar(
        select(func.count(User.id)).where(User.is_premium == True)
    ) or 0

    # ─── Tasks ───────────────────────────────────────────
    total_tasks = await db.scalar(select(func.count(Task.id))) or 0
    today_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.created_at >= today)
    ) or 0
    week_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.created_at >= week_ago)
    ) or 0
    failed_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.status == "failed")
    ) or 0

    # ─── Revenue ─────────────────────────────────────────
    total_revenue = await db.scalar(
        select(func.sum(PaymentTransaction.amount)).where(
            PaymentTransaction.status == "completed",
            PaymentTransaction.payment_method != "admin_grant",
        )
    ) or 0

    month_revenue = await db.scalar(
        select(func.sum(PaymentTransaction.amount)).where(
            PaymentTransaction.status == "completed",
            PaymentTransaction.payment_method != "admin_grant",
            PaymentTransaction.created_at >= month_ago,
        )
    ) or 0

    # Revenue by method
    by_method_result = await db.execute(
        select(
            PaymentTransaction.payment_method,
            func.sum(PaymentTransaction.amount),
        )
        .where(PaymentTransaction.status == "completed")
        .group_by(PaymentTransaction.payment_method)
    )
    by_method = {row[0]: float(row[1] or 0) for row in by_method_result.all()}

    # ─── Agents (most used) ─────────────────────────────
    top_agents_result = await db.execute(
        select(Agent.slug, Agent.name, func.count(Task.id).label("task_count"))
        .join(Task, Task.agent_id == Agent.id)
        .group_by(Agent.slug, Agent.name)
        .order_by(desc("task_count"))
        .limit(5)
    )
    most_used = [
        {"slug": r[0], "name": r[1], "task_count": r[2]}
        for r in top_agents_result.all()
    ]

    return {
        "users": {
            "total": total_users,
            "active_today": active_today,
            "new_this_week": new_week,
            "new_this_month": new_month,
            "premium_count": premium_count,
        },
        "tasks": {
            "total": total_tasks,
            "today": today_tasks,
            "this_week": week_tasks,
            "failed_rate": round(failed_tasks / max(total_tasks, 1), 3),
        },
        "revenue": {
            "total": float(total_revenue),
            "this_month": float(month_revenue),
            "by_method": by_method,
        },
        "agents": {
            "most_used": most_used,
        },
    }


@router.get("/top-users")
async def top_users(
    metric: str = Query("tasks", pattern=r"^(tasks|revenue|tokens)$"),
    limit: int = Query(10, ge=1, le=50),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Top foydalanuvchilar — tasks, revenue, yoki tokens bo'yicha."""

    if metric == "tasks":
        result = await db.execute(
            select(
                User.id,
                User.telegram_id,
                User.username,
                User.first_name,
                func.count(Task.id).label("value"),
            )
            .join(Task, Task.user_id == User.id)
            .group_by(User.id, User.telegram_id, User.username, User.first_name)
            .order_by(desc("value"))
            .limit(limit)
        )
    elif metric == "revenue":
        result = await db.execute(
            select(
                User.id,
                User.telegram_id,
                User.username,
                User.first_name,
                func.sum(PaymentTransaction.amount).label("value"),
            )
            .join(PaymentTransaction, PaymentTransaction.user_id == User.id)
            .where(
                PaymentTransaction.status == "completed",
                PaymentTransaction.payment_method != "admin_grant",
            )
            .group_by(User.id, User.telegram_id, User.username, User.first_name)
            .order_by(desc("value"))
            .limit(limit)
        )
    else:  # tokens
        result = await db.execute(
            select(
                User.id,
                User.telegram_id,
                User.username,
                User.first_name,
                func.sum(Task.tokens_used).label("value"),
            )
            .join(Task, Task.user_id == User.id)
            .group_by(User.id, User.telegram_id, User.username, User.first_name)
            .order_by(desc("value"))
            .limit(limit)
        )

    users = [
        {
            "id": r[0],
            "telegram_id": r[1],
            "username": r[2],
            "first_name": r[3],
            "value": float(r[4] or 0),
            "metric": metric,
        }
        for r in result.all()
    ]

    return {"items": users, "metric": metric, "limit": limit}


@router.get("/events")
async def event_summary(
    days: int = Query(7, ge=1, le=90),
    event_name: str | None = Query(None, max_length=64),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Oxirgi N kun davomidagi analytics eventlari uchun aggregat statistika.

    Returns: { period_days, total, by_event: { event_name: count } }
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(AnalyticsEvent.event_name, func.count(AnalyticsEvent.id))
        .where(AnalyticsEvent.created_at >= since)
        .group_by(AnalyticsEvent.event_name)
        .order_by(desc(func.count(AnalyticsEvent.id)))
    )
    if event_name:
        query = query.where(AnalyticsEvent.event_name == event_name)

    result = await db.execute(query)
    rows = result.all()
    by_event = {row[0]: int(row[1] or 0) for row in rows}
    total = sum(by_event.values())

    return {
        "period_days": days,
        "total": total,
        "by_event": by_event,
    }
