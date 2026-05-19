"""ZAI — Admin Agent Grant/Revoke Router"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.audit import log_audit
from app.database import get_db
from app.models import User, Agent, UserAgent, PaymentTransaction

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── Pydantic Schemas ───────────────────────────────────────

class GrantAgentRequest(BaseModel):
    agent_slug: str
    plan_type: str = Field(..., pattern=r"^(daily|weekly|monthly|custom)$")
    duration_days: int | None = None
    reason: str = Field(..., min_length=3, max_length=500)


class ExtendAgentRequest(BaseModel):
    days: int = Field(..., ge=1, le=365)
    reason: str = Field(..., min_length=3, max_length=500)


class RevokeAgentRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


# ─── Endpoints ──────────────────────────────────────────────

@router.post("/users/{user_id}/grant-agent")
async def grant_agent(
    user_id: str,
    req: GrantAgentRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Foydalanuvchiga agent berish (admin grant)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User topilmadi")

    agent_result = await db.execute(select(Agent).where(Agent.slug == req.agent_slug))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    # Duration hisoblash
    plan_days = {"daily": 1, "weekly": 7, "monthly": 30}
    if req.plan_type == "custom":
        if not req.duration_days or req.duration_days < 1:
            raise HTTPException(status_code=400, detail="Custom plan uchun duration_days kerak")
        days = req.duration_days
    else:
        days = plan_days[req.plan_type]

    # Mavjud UserAgent tekshirish
    existing = await db.execute(
        select(UserAgent).where(
            UserAgent.user_id == user_id,
            UserAgent.agent_id == agent.id,
        ).order_by(desc(UserAgent.created_at))
    )
    ua = existing.scalars().first()

    now = datetime.now(timezone.utc)
    if ua and ua.status == "active":
        # Uzaytirish
        ua.expires_at = (ua.expires_at or now) + timedelta(days=days)
    else:
        # Yangi yaratish
        ua = UserAgent(
            user_id=user_id,
            agent_id=agent.id,
            status="active",
            plan_type=req.plan_type if req.plan_type != "custom" else "monthly",
            started_at=now,
            expires_at=now + timedelta(days=days),
            tasks_used_today=0,
            tokens_used_today=0,
        )
        db.add(ua)

    # PaymentTransaction yozuvi (amount=0)
    tx = PaymentTransaction(
        user_id=user_id,
        agent_id=agent.id,
        amount=0,
        currency="UZS",
        payment_method="admin_grant",
        status="completed",
        plan_type=req.plan_type if req.plan_type != "custom" else "monthly",
        admin_note=req.reason,
        completed_at=now,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(ua)

    await log_audit(
        admin_id=admin.id,
        action="grant_agent",
        target_type="user",
        target_id=user_id,
        payload={
            "agent_slug": req.agent_slug,
            "days": days,
            "plan_type": req.plan_type,
            "reason": req.reason,
        },
        request=request,
    )

    return {
        "message": f"{agent.name} {days} kunga berildi",
        "user_agent_id": ua.id,
        "expires_at": ua.expires_at.isoformat() if ua.expires_at else None,
    }


@router.post("/user-agents/{user_agent_id}/extend")
async def extend_agent(
    user_agent_id: str,
    req: ExtendAgentRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agent muddatini uzaytirish."""
    result = await db.execute(select(UserAgent).where(UserAgent.id == user_agent_id))
    ua = result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="UserAgent topilmadi")

    now = datetime.now(timezone.utc)
    old_expires = ua.expires_at
    ua.expires_at = (ua.expires_at or now) + timedelta(days=req.days)
    if ua.status != "active":
        ua.status = "active"
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="extend_agent",
        target_type="user_agent",
        target_id=user_agent_id,
        payload={
            "days": req.days,
            "reason": req.reason,
            "old_expires_at": str(old_expires),
            "new_expires_at": str(ua.expires_at),
        },
        request=request,
    )

    return {
        "message": f"Agent {req.days} kunga uzaytirildi",
        "user_agent_id": ua.id,
        "expires_at": ua.expires_at.isoformat() if ua.expires_at else None,
    }


@router.post("/user-agents/{user_agent_id}/revoke")
async def revoke_agent(
    user_agent_id: str,
    req: RevokeAgentRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agent ruxsatini bekor qilish."""
    result = await db.execute(select(UserAgent).where(UserAgent.id == user_agent_id))
    ua = result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="UserAgent topilmadi")

    ua.status = "cancelled"
    ua.expires_at = datetime.now(timezone.utc)
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="revoke_agent",
        target_type="user_agent",
        target_id=user_agent_id,
        payload={"reason": req.reason, "user_id": ua.user_id},
        request=request,
    )

    return {"message": "Agent ruxsati bekor qilindi", "user_agent_id": ua.id}
