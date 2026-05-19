"""Task API: create, monitor and history."""
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, select, update as sa_update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.agent_engine import run_agent
from app.api.deps import get_current_user
from app.database import get_db
from app.models import Agent, Task, User, UserAgent
from app.core.limiter import limiter

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    agent_slug: str
    input_text: str = Field("", max_length=10000)
    context_data: dict[str, Any] | None = None

    @field_validator("context_data")
    @classmethod
    def validate_context_data_size(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is not None and len(json.dumps(v)) > 51200:
            raise ValueError("context_data juda katta (max 50KB)")
        return v


class TaskOut(BaseModel):
    id: str
    agent_id: str
    agent_name: str = ""
    agent_icon: str = ""
    input_text: str
    output_text: str | None
    status: str
    error_message: str | None
    created_at: str
    completed_at: str | None


def _status(status: str) -> str:
    return {
        "pending": "queued",
        "processing": "running",
        "done": "completed",
    }.get(status, status)


def _loads_schema(agent: Agent) -> dict:
    try:
        schema = json.loads(agent.input_schema or "{}")
    except json.JSONDecodeError:
        return {"fields": []}
    return schema if isinstance(schema, dict) else {"fields": []}


def _prepare_input(agent: Agent, req: TaskCreate) -> tuple[str, dict[str, Any]]:
    schema = _loads_schema(agent)
    fields = schema.get("fields", [])
    if not isinstance(fields, list):
        fields = []

    context = dict(req.context_data or {})
    if fields and req.input_text.strip():
        first_name = fields[0].get("name")
        if first_name and not str(context.get(first_name, "")).strip():
            context[first_name] = req.input_text.strip()

    missing = []
    for field in fields:
        name = field.get("name")
        if not name or not field.get("required"):
            continue
        value = context.get(name)
        if value is None or not str(value).strip():
            missing.append(field.get("label") or name)
    if missing:
        raise HTTPException(status_code=422, detail=f"Majburiy maydonlar: {', '.join(missing)}")

    if not fields and not req.input_text.strip():
        raise HTTPException(status_code=422, detail="Topshiriq matni kiritilmagan")

    lines = [f"Agent: {agent.name}", "Foydalanuvchi kiritgan ma'lumotlar:"]
    labels_by_name = {
        field.get("name"): field.get("label") or field.get("name")
        for field in fields
        if isinstance(field, dict)
    }
    for key, value in context.items():
        if value is None or not str(value).strip():
            continue
        label = labels_by_name.get(key, key)
        lines.append(f"- {label}: {value}")
    if req.input_text.strip() and req.input_text.strip() not in [str(v).strip() for v in context.values()]:
        lines.append(f"- Qo'shimcha topshiriq: {req.input_text.strip()}")

    return "\n".join(lines), context


def _is_expired(ua: UserAgent) -> bool:
    if not ua.expires_at:
        return False
    now = datetime.now(timezone.utc)
    expires_at = ua.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at < now


def _task_out(task: Task, agent: Agent) -> TaskOut:
    return TaskOut(
        id=task.id,
        agent_id=task.agent_id,
        agent_name=agent.name,
        agent_icon=agent.icon,
        input_text=task.input_text,
        output_text=task.output_text,
        status=_status(task.status),
        error_message=task.error_message,
        created_at=task.created_at.isoformat() if task.created_at else "",
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
    )


@router.post("", response_model=TaskOut)
@router.post("/run", response_model=TaskOut)
@limiter.limit("5/minute")
async def create_and_run_task(
    request: Request,
    req: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models import Subscription

    agent_result = await db.execute(
        select(Agent).where(Agent.slug == req.agent_slug, Agent.is_active == True)
    )
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi yoki faol emas")

    # 1. Subscription (trial) tekshiruvi
    sub_result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id)
        .order_by(Subscription.created_at.desc())
    )
    sub = sub_result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    is_trial_active = False

    if sub and sub.plan == "trial" and sub.status == "active":
        expires_at = sub.expires_at
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at and expires_at > now:
            is_trial_active = True
        else:
            # Trial tugagan
            sub.status = "expired"
            await db.commit()

    # 2. Agar trial faol bo'lsa — barcha agentlarga ruxsat (kunlik 10 ta limit)
    if is_trial_active:
        # Bugungi task sonini hisoblash
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_count_result = await db.execute(
            select(func.count(Task.id)).where(
                Task.user_id == user.id,
                Task.created_at >= today_start,
            )
        )
        today_count = today_count_result.scalar() or 0
        daily_limit = sub.monthly_limit or 10

        # Premium foydalanuvchilar uchun 1.5x limit
        if user.is_premium:
            daily_limit = int(daily_limit * 1.5)

        if today_count >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Kunlik limit tugagan ({daily_limit} ta). Ertaga qayta urinib ko'ring."
            )
    else:
        # 3. Trial tugagan — UserAgent (xarid) tekshiruvi
        ua_result = await db.execute(
            select(UserAgent)
            .where(UserAgent.user_id == user.id, UserAgent.agent_id == agent.id)
            .order_by(UserAgent.created_at.desc())
        )
        ua = ua_result.scalar_one_or_none()
        if not ua:
            raise HTTPException(
                status_code=403,
                detail="Sinov muddati tugagan. Agentni sotib oling."
            )
        if ua.status == "pending":
            raise HTTPException(status_code=403, detail="Agent admin tasdig'ini kutmoqda")
        if ua.status != "active":
            raise HTTPException(status_code=403, detail="Bu agent faol emas")
        if _is_expired(ua):
            ua.status = "expired"
            await db.commit()
            raise HTTPException(status_code=403, detail="Agent muddati tugagan. Qayta sotib oling.")

        # P1.2 fix: Atomik UPDATE'dan oldin kunlik counter'ni reset qilamiz
        # — kechagi qiymat bugun saqlanib qolmasin
        from app.agents.agent_engine import _reset_daily_if_needed
        if _reset_daily_if_needed(ua):
            await db.commit()

        # Atomik limit tekshiruvi va increment — race condition'dan himoya
        # UPDATE faqat limit oshib ketmagan bo'lsa ishlaydi
        update_result = await db.execute(
            sa_update(UserAgent)
            .where(
                UserAgent.id == ua.id,
                UserAgent.tasks_used_today < agent.daily_limit,
            )
            .values(tasks_used_today=UserAgent.tasks_used_today + 1)
            .returning(UserAgent.id)
        )
        await db.commit()

        if update_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=429,
                detail=f"Kunlik limit tugagan ({agent.daily_limit} ta). Ertaga qayta urinib ko'ring."
            )

    prepared_input, context_data = _prepare_input(agent, req)
    # tasks_used_today AI chaqiruvidan oldin atomik tarzda +1 qilingan (paid yo'l).
    # Agar run_agent xato qaytarsa — kompensatsiya: -1.
    incremented_ua_id: str | None = None
    if not is_trial_active:
        # Yuqorida update_result orqali ko'paytirilgan UserAgent — ua.id biz bilamiz
        incremented_ua_id = ua.id  # noqa — ua yuqoridagi blokda mavjud

    result = await run_agent(
        agent_slug=req.agent_slug,
        user_id=user.id,
        input_text=prepared_input,
        context_data=context_data,
    )

    if result.get("error"):
        # Kompensatsiya — agar paid yo'lda increment qilingan bo'lsa, qaytarib olamiz.
        # Trial yo'lda Task jadvalidan COUNT bilan hisoblaganimiz uchun kompensatsiya
        # shart emas (Task DB'da failed bo'lib saqlanadi va keyingi COUNT ham uni hisoblaydi —
        # bu kichik nokamillik, lekin trial yo'l uchun sezilmaydi).
        if incremented_ua_id:
            await db.execute(
                sa_update(UserAgent)
                .where(
                    UserAgent.id == incremented_ua_id,
                    UserAgent.tasks_used_today > 0,
                )
                .values(tasks_used_today=UserAgent.tasks_used_today - 1)
            )
            await db.commit()

        detail = result["error"]
        status_code = 429 if "limit" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail)

    # AI server xatosi (run_agent ichida exception) — output ERROR_SANITIZED bo'ladi
    # va task DB'da "failed" deb saqlanadi. Foydalanuvchi limit'ini sarflamasligi
    # uchun increment'ni qaytarib olamiz.
    from app.agents.agent_engine import ERROR_SANITIZED
    if result.get("output") == ERROR_SANITIZED and incremented_ua_id:
        await db.execute(
            sa_update(UserAgent)
            .where(
                UserAgent.id == incremented_ua_id,
                UserAgent.tasks_used_today > 0,
            )
            .values(tasks_used_today=UserAgent.tasks_used_today - 1)
        )
        await db.commit()

    task_result = await db.execute(
        select(Task).where(Task.id == result["task_id"])
    )
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=500, detail="Task natijasi topilmadi")
    return _task_out(task, agent)


@router.get("", response_model=list[TaskOut])
@router.get("/history", response_model=list[TaskOut])
async def task_history(
    agent_slug: str | None = None,
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    safe_limit = min(max(limit, 1), 100)
    query = (
        select(Task, Agent)
        .join(Agent, Task.agent_id == Agent.id)
        .where(Task.user_id == user.id)
    )
    if agent_slug:
        query = query.where(Agent.slug == agent_slug)
    query = query.order_by(desc(Task.created_at)).limit(safe_limit)

    result = await db.execute(query)
    return [_task_out(task, agent) for task, agent in result.all()]


@router.get("/dashboard")
async def task_dashboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func

    total_result = await db.execute(
        select(func.count(Task.id)).where(Task.user_id == user.id)
    )
    total_tasks = total_result.scalar() or 0

    agent_stats = await db.execute(
        select(
            Agent.name.label("agent_name"),
            Agent.icon.label("agent_icon"),
            Agent.slug.label("agent_slug"),
            func.count(Task.id).label("count"),
        )
        .join(Task, Task.agent_id == Agent.id)
        .where(Task.user_id == user.id)
        .group_by(Agent.id)
        .order_by(func.count(Task.id).desc())
    )

    return {
        "total_tasks": total_tasks,
        "by_agent": [
            {
                "agent": row.agent_name,
                "icon": row.agent_icon,
                "slug": row.agent_slug,
                "tasks": row.count,
            }
            for row in agent_stats
        ],
    }


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task, Agent)
        .join(Agent, Task.agent_id == Agent.id)
        .where(Task.id == task_id, Task.user_id == user.id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Task topilmadi")
    task, agent = row
    return _task_out(task, agent)


class FeedbackCreate(BaseModel):
    rating: str  # "good" | "bad" | "redo"
    comment: str | None = None


@router.post("/{task_id}/feedback")
async def submit_feedback(
    task_id: str,
    req: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Foydalanuvchi natijani baholaydi: yaxshi / yomon / qayta ishlash kerak."""
    if req.rating not in ("good", "bad", "redo"):
        raise HTTPException(status_code=422, detail="Rating: 'good', 'bad' yoki 'redo' bo'lishi kerak")

    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task topilmadi")

    # Task'ga feedback maydonlarini yozamiz
    task.feedback_rating = req.rating
    task.feedback_comment = req.comment
    task.feedback_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "message": "Baholash qabul qilindi. Rahmat!",
        "task_id": task_id,
        "rating": req.rating,
    }
