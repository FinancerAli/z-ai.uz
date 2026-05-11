"""ZAI Platform — API Routes (Mini App uchun) v2"""
from fastapi import APIRouter, HTTPException

from app.api.auth import router as auth_router
from app.api.brands import router as brands_router
from app.api.agents import router as agents_router
from app.api.tasks import router as tasks_router
from app.api.admin import router as admin_router
from app.api.payments import router as payments_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(brands_router)
router.include_router(agents_router)
router.include_router(tasks_router)
router.include_router(admin_router)
router.include_router(payments_router)

# Legacy kontent generatsiya endpointi
from pydantic import BaseModel
from app.agents.agent_engine import run_agent
from app.api.deps import get_current_user
from app.models import User
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
    current_user: User = Depends(get_current_user),
):
    """Kontent yaratish (legacy — SMM agent orqali)."""
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="Mavzu kiritilmagan")

    result = await run_agent(
        agent_slug="smm-content",
        user_id=current_user.id,
        input_text=req.topic,
        context_data={
            "business_type": req.business_type,
            "language": req.language,
            "platform": req.platform,
            "tone": req.tone,
        },
    )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return ContentResponse(
        content=result["output"],
        task_id=result.get("task_id"),
        tokens=result.get("tokens_used", 0),
        cost=result.get("cost", 0.0),
    )


@router.get("/health")
async def health():
    return {"status": "ok", "service": "ZAI API v2"}
