"""ZAI Platform — API Routes (Mini App uchun) v2"""
from fastapi import APIRouter, HTTPException, Request

from app.api.auth import router as auth_router
from app.api.brands import router as brands_router
from app.api.agents import router as agents_router
from app.api.tasks import router as tasks_router
from app.api.admin import router as admin_router
from app.api.payments import router as payments_router
from app.api.humo_avto import router as humo_router
from app.api.notifications import router as notifications_router
from app.api.referral import router as referral_router
from app.api.feedback import router as feedback_router
from app.api.admin_users import router as admin_users_router
from app.api.admin_grants import router as admin_grants_router
from app.api.admin_agents import router as admin_agents_router
from app.api.admin_audit import router as admin_audit_router
from app.api.admin_analytics import router as admin_analytics_router
from app.api.analytics import router as analytics_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(brands_router)
router.include_router(agents_router)
router.include_router(tasks_router)
router.include_router(admin_router)
router.include_router(payments_router)
router.include_router(humo_router)
router.include_router(notifications_router)
router.include_router(referral_router)
router.include_router(feedback_router)
router.include_router(admin_users_router)
router.include_router(admin_grants_router)
router.include_router(admin_agents_router)
router.include_router(admin_audit_router)
router.include_router(admin_analytics_router)
router.include_router(analytics_router)

# Legacy kontent generatsiya endpointi
from pydantic import BaseModel
from app.api.deps import get_current_user
from app.models import User
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from fastapi import Depends


class ContentRequest(BaseModel):
    topic: str
    business_type: str = "other"
    language: str = "uz"
    platform: str = "telegram"
    tone: str = "friendly"


class ContentResponse(BaseModel):
    content: str
    task_id: str | None = None
    tokens: int = 0
    cost: float = 0.0


@router.post("/content/generate", response_model=ContentResponse)
async def api_generate_content(
    req: ContentRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Kontent yaratish (legacy endpoint — tasks.py orqali yo'naltiriladi).
    Subscription/trial gate tasks.py da tekshiriladi.
    """
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="Mavzu kiritilmagan")

    # Legacy endpoint endi tasks.py create_and_run_task logikasini ishlatadi
    # Bu subscription/trial limitni to'g'ri tekshiradi
    from app.api.tasks import TaskCreate, create_and_run_task
    task_req = TaskCreate(
        agent_slug="smm-content",
        input_text=req.topic,
        context_data={
            "business_type": req.business_type,
            "language": req.language,
            "platform": req.platform,
            "tone": req.tone,
        },
    )
    task_out = await create_and_run_task(request, task_req, current_user, db)

    return ContentResponse(
        content=task_out.output_text or "",
        task_id=task_out.id,
        tokens=0,
        cost=0.0,
    )


@router.get("/health")
async def health():
    return {"status": "ok", "service": "ZAI API v2"}
