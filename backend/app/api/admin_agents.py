"""ZAI — Admin Agent Management Router"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin, require_super_admin
from app.core.audit import log_audit
from app.database import get_db
from app.models import User, Agent

router = APIRouter(prefix="/admin/agents", tags=["admin"])


# ─── Pydantic Schemas ───────────────────────────────────────

class AgentPricingRequest(BaseModel):
    price_daily: float = Field(..., ge=0, le=10000000)
    price_weekly: float = Field(..., ge=0, le=10000000)
    price_monthly: float = Field(..., ge=0, le=10000000)


class AgentSettingsRequest(BaseModel):
    is_active: bool | None = None
    is_featured: bool | None = None
    daily_limit: int | None = Field(None, ge=1, le=10000)
    max_tokens_per_task: int | None = Field(None, ge=100, le=100000)
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    sort_order: int | None = Field(None, ge=0, le=1000)


class CreateAgentRequest(BaseModel):
    slug: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9\-]+$")
    name: str = Field(..., min_length=2, max_length=255)
    description: str = Field(..., min_length=10)
    category: str = Field(..., min_length=2, max_length=100)
    icon: str = Field(default="🤖", max_length=10)
    system_prompt: str = Field(..., min_length=10)
    welcome_message: str = Field(default="Salom! Qanday yordam bera olaman?")
    price_daily: float = Field(default=0, ge=0, le=10000000)
    price_weekly: float = Field(default=0, ge=0, le=10000000)
    price_monthly: float = Field(default=199000, ge=0, le=10000000)
    daily_limit: int = Field(default=30, ge=1, le=10000)
    max_tokens_per_task: int = Field(default=2000, ge=100, le=100000)
    temperature: float = Field(default=0.85, ge=0.0, le=2.0)
    ai_model: str = Field(default="deepseek-chat", max_length=100)
    is_active: bool = True
    is_featured: bool = False
    sort_order: int = Field(default=0, ge=0, le=1000)


# ─── Endpoints ──────────────────────────────────────────────

@router.put("/{slug}/pricing")
async def update_agent_pricing(
    slug: str,
    req: AgentPricingRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agent narxlarini yangilash."""
    result = await db.execute(select(Agent).where(Agent.slug == slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    old_pricing = {
        "price_daily": agent.price_daily,
        "price_weekly": agent.price_weekly,
        "price_monthly": agent.price_monthly,
    }

    agent.price_daily = req.price_daily
    agent.price_weekly = req.price_weekly
    agent.price_monthly = req.price_monthly
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="update_agent_pricing",
        target_type="agent",
        target_id=agent.id,
        payload={
            "slug": slug,
            "old": old_pricing,
            "new": {
                "price_daily": req.price_daily,
                "price_weekly": req.price_weekly,
                "price_monthly": req.price_monthly,
            },
        },
        request=request,
    )

    return {"message": f"{agent.name} narxlari yangilandi", "slug": slug}


@router.put("/{slug}/settings")
async def update_agent_settings(
    slug: str,
    req: AgentSettingsRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agent sozlamalarini yangilash."""
    result = await db.execute(select(Agent).where(Agent.slug == slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    changes = {}
    if req.is_active is not None:
        changes["is_active"] = {"old": agent.is_active, "new": req.is_active}
        agent.is_active = req.is_active
    if req.is_featured is not None:
        changes["is_featured"] = {"old": agent.is_featured, "new": req.is_featured}
        agent.is_featured = req.is_featured
    if req.daily_limit is not None:
        changes["daily_limit"] = {"old": agent.daily_limit, "new": req.daily_limit}
        agent.daily_limit = req.daily_limit
    if req.max_tokens_per_task is not None:
        changes["max_tokens_per_task"] = {"old": agent.max_tokens_per_task, "new": req.max_tokens_per_task}
        agent.max_tokens_per_task = req.max_tokens_per_task
    if req.temperature is not None:
        changes["temperature"] = {"old": agent.temperature, "new": req.temperature}
        agent.temperature = req.temperature
    if req.sort_order is not None:
        changes["sort_order"] = {"old": agent.sort_order, "new": req.sort_order}
        agent.sort_order = req.sort_order

    if not changes:
        raise HTTPException(status_code=400, detail="Hech narsa o'zgartirilmadi")

    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="update_agent_settings",
        target_type="agent",
        target_id=agent.id,
        payload={"slug": slug, "changes": changes},
        request=request,
    )

    return {"message": f"{agent.name} sozlamalari yangilandi", "slug": slug, "changes": changes}


@router.post("")
async def create_agent(
    req: CreateAgentRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Yangi agent yaratish (faqat super admin)."""
    # Slug uniqueness tekshirish
    existing = await db.execute(select(Agent).where(Agent.slug == req.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu slug allaqachon mavjud")

    agent = Agent(
        slug=req.slug,
        name=req.name,
        description=req.description,
        category=req.category,
        icon=req.icon,
        system_prompt=req.system_prompt,
        welcome_message=req.welcome_message,
        price_daily=req.price_daily,
        price_weekly=req.price_weekly,
        price_monthly=req.price_monthly,
        daily_limit=req.daily_limit,
        max_tokens_per_task=req.max_tokens_per_task,
        temperature=req.temperature,
        ai_model=req.ai_model,
        is_active=req.is_active,
        is_featured=req.is_featured,
        sort_order=req.sort_order,
        # Admin panel orqali yaratilgan agentlar har doim "admin" source bilan ishga tushadi.
        # Bu ularni seed_agents() ga teginmas qiladi va restart'larda saqlanadi.
        source="admin",
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    await log_audit(
        admin_id=admin.id,
        action="create_agent",
        target_type="agent",
        target_id=agent.id,
        payload={"slug": req.slug, "name": req.name},
        request=request,
    )

    return {"message": f"Agent '{req.name}' yaratildi", "id": agent.id, "slug": agent.slug}


@router.delete("/{slug}")
async def delete_agent(
    slug: str,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agent soft delete (is_active=false) — faqat super admin."""
    result = await db.execute(select(Agent).where(Agent.slug == slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    agent.is_active = False
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="delete_agent",
        target_type="agent",
        target_id=agent.id,
        payload={"slug": slug, "name": agent.name},
        request=request,
    )

    return {"message": f"Agent '{agent.name}' o'chirildi (soft delete)", "slug": slug}
