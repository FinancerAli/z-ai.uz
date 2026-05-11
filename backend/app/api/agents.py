"""Agent Store API."""
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models import Agent, User, UserAgent

router = APIRouter(prefix="/agents", tags=["agents"])
settings = get_settings()


class AgentOut(BaseModel):
    id: str
    slug: str
    name: str
    title: str
    description: str
    category: str
    icon: str
    capabilities: list[str]
    input_schema: dict
    welcome_message: str
    price_daily: float
    price_weekly: float
    price_monthly: float
    daily_limit: int
    is_active: bool
    is_featured: bool
    sort_order: int
    supports_multi_turn: bool
    user_status: str | None = None


class AgentDetailOut(AgentOut):
    is_purchased: bool = False
    user_agent_id: str | None = None


class UserAgentOut(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    agent_icon: str
    agent_slug: str
    status: str
    plan_type: str
    tasks_used_today: int
    daily_limit: int
    started_at: str
    expires_at: str | None


class PurchaseRequest(BaseModel):
    agent_id: str | None = None
    plan_type: str = "monthly"


class AdminPurchaseOut(BaseModel):
    id: str
    user_id: str
    telegram_id: int
    username: str | None
    first_name: str | None
    agent_id: str
    agent_name: str
    agent_slug: str
    plan_type: str
    status: str
    created_at: str


class AdminUserAgentOut(AdminPurchaseOut):
    tasks_used_today: int
    expires_at: str | None


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.telegram_id != settings.admin_telegram_id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin ruxsati kerak")
    return user


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def _json_dict(value: str | None) -> dict:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _agent_out(agent: Agent, user_status: str | None = None) -> AgentOut:
    return AgentOut(
        id=agent.id,
        slug=agent.slug,
        name=agent.name,
        title=agent.name,
        description=agent.description,
        category=agent.category,
        icon=agent.icon,
        capabilities=_json_list(agent.capabilities),
        input_schema=_json_dict(agent.input_schema),
        welcome_message=agent.welcome_message,
        price_daily=agent.price_daily,
        price_weekly=agent.price_weekly,
        price_monthly=agent.price_monthly,
        daily_limit=agent.daily_limit,
        is_active=agent.is_active,
        is_featured=agent.is_featured,
        sort_order=agent.sort_order,
        supports_multi_turn=agent.supports_multi_turn,
        user_status=user_status,
    )


def _user_agent_out(ua: UserAgent, agent: Agent) -> UserAgentOut:
    return UserAgentOut(
        id=ua.id,
        agent_id=ua.agent_id,
        agent_name=agent.name,
        agent_icon=agent.icon,
        agent_slug=agent.slug,
        status=ua.status,
        plan_type=ua.plan_type,
        tasks_used_today=ua.tasks_used_today or 0,
        daily_limit=agent.daily_limit,
        started_at=ua.started_at.isoformat() if ua.started_at else "",
        expires_at=ua.expires_at.isoformat() if ua.expires_at else None,
    )


@router.get("", response_model=list[AgentOut])
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Agent)
        .where(Agent.is_active == True)
        .order_by(Agent.sort_order)
    )
    return [_agent_out(agent) for agent in result.scalars().all()]


@router.get("/featured", response_model=list[AgentOut])
async def featured_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Agent)
        .where(Agent.is_active == True, Agent.is_featured == True)
        .order_by(Agent.sort_order)
    )
    return [_agent_out(agent) for agent in result.scalars().all()]


@router.get("/my/list", response_model=list[UserAgentOut])
async def my_agents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAgent, Agent)
        .join(Agent, UserAgent.agent_id == Agent.id)
        .where(UserAgent.user_id == user.id)
        .order_by(UserAgent.created_at.desc())
    )
    return [_user_agent_out(ua, agent) for ua, agent in result.all()]


@router.post("/purchase")
async def purchase_agent(
    req: PurchaseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not req.agent_id:
        raise HTTPException(status_code=400, detail="Agent ID kiritilmagan")
    return await _create_purchase_request(req.agent_id, req.plan_type, user, db)


@router.post("/{agent_id}/purchase")
async def purchase_agent_by_path(
    agent_id: str,
    req: PurchaseRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_type = req.plan_type if req else "monthly"
    return await _create_purchase_request(agent_id, plan_type, user, db)


@router.get("/admin/purchases/pending", response_model=list[AdminPurchaseOut])
async def pending_purchases(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAgent, User, Agent)
        .join(User, UserAgent.user_id == User.id)
        .join(Agent, UserAgent.agent_id == Agent.id)
        .where(UserAgent.status == "pending")
        .order_by(UserAgent.created_at.desc())
    )
    return [_admin_purchase_out(ua, user, agent) for ua, user, agent in result.all()]


@router.get("/admin/user-agents", response_model=list[AdminUserAgentOut])
async def admin_user_agents(
    status: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(UserAgent, User, Agent)
        .join(User, UserAgent.user_id == User.id)
        .join(Agent, UserAgent.agent_id == Agent.id)
        .order_by(UserAgent.created_at.desc())
    )
    if status:
        query = query.where(UserAgent.status == status)
    result = await db.execute(query)
    return [
        AdminUserAgentOut(
            **_admin_purchase_out(ua, user, agent).model_dump(),
            tasks_used_today=ua.tasks_used_today or 0,
            expires_at=ua.expires_at.isoformat() if ua.expires_at else None,
        )
        for ua, user, agent in result.all()
    ]


@router.post("/admin/purchases/{user_agent_id}/approve")
async def approve_purchase(
    user_agent_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserAgent).where(UserAgent.id == user_agent_id))
    ua = result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="So'rov topilmadi")
    if ua.status == "active":
        return {"message": "Agent allaqachon faol", "status": ua.status}
    if ua.status != "pending":
        raise HTTPException(status_code=400, detail="Faqat pending so'rov tasdiqlanadi")

    now = datetime.now(timezone.utc)
    plan_days = {"daily": 1, "weekly": 7, "monthly": 30}
    ua.status = "active"
    ua.started_at = now
    ua.expires_at = now + timedelta(days=plan_days.get(ua.plan_type, 30))
    ua.tasks_used_today = 0
    ua.tokens_used_today = 0
    await db.commit()
    return {
        "message": "Agent faollashtirildi",
        "user_agent_id": ua.id,
        "status": ua.status,
        "approved_by": admin.telegram_id,
        "expires_at": ua.expires_at.isoformat() if ua.expires_at else None,
    }


@router.post("/admin/purchases/{user_agent_id}/reject")
async def reject_purchase(
    user_agent_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserAgent).where(UserAgent.id == user_agent_id))
    ua = result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="So'rov topilmadi")
    if ua.status != "pending":
        raise HTTPException(status_code=400, detail="Faqat pending so'rov rad etiladi")
    ua.status = "cancelled"
    await db.commit()
    return {"message": "So'rov rad etildi", "user_agent_id": ua.id, "status": ua.status}


@router.get("/{agent_slug}", response_model=AgentDetailOut)
async def get_agent_detail(
    agent_slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Agent).where(Agent.slug == agent_slug, Agent.is_active == True)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    ua_result = await db.execute(
        select(UserAgent)
        .where(UserAgent.user_id == user.id, UserAgent.agent_id == agent.id)
        .order_by(UserAgent.created_at.desc())
    )
    ua = ua_result.scalar_one_or_none()
    data = AgentDetailOut(**_agent_out(agent, ua.status if ua else None).model_dump())
    if ua:
        data.is_purchased = ua.status == "active"
        data.user_agent_id = ua.id
    return data


async def _create_purchase_request(
    agent_id: str,
    plan_type: str,
    user: User,
    db: AsyncSession,
):
    if plan_type not in {"daily", "weekly", "monthly"}:
        raise HTTPException(status_code=400, detail="Noto'g'ri tarif turi")

    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.is_active == True))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    existing = await db.execute(
        select(UserAgent)
        .where(
            UserAgent.user_id == user.id,
            UserAgent.agent_id == agent.id,
            UserAgent.status.in_(["active", "pending"]),
        )
        .order_by(UserAgent.created_at.desc())
    )
    existing_ua = existing.scalar_one_or_none()
    if existing_ua:
        if existing_ua.status == "active":
            raise HTTPException(status_code=400, detail="Bu agent allaqachon faol")
        raise HTTPException(status_code=400, detail="Bu agent uchun so'rov admin tasdig'ini kutmoqda")

    ua = UserAgent(
        user_id=user.id,
        agent_id=agent.id,
        status="pending",
        plan_type=plan_type,
        started_at=datetime.now(timezone.utc),
        expires_at=None,
    )
    db.add(ua)
    await db.commit()
    await db.refresh(ua)
    return {
        "message": "So'rov yuborildi. Admin tasdiqlagandan keyin agent faollashadi.",
        "user_agent_id": ua.id,
        "agent_name": agent.name,
        "status": ua.status,
    }


def _admin_purchase_out(ua: UserAgent, user: User, agent: Agent) -> AdminPurchaseOut:
    return AdminPurchaseOut(
        id=ua.id,
        user_id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=user.first_name,
        agent_id=agent.id,
        agent_name=agent.name,
        agent_slug=agent.slug,
        plan_type=ua.plan_type,
        status=ua.status,
        created_at=ua.created_at.isoformat() if ua.created_at else "",
    )
