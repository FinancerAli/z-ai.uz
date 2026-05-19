from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_current_user
from app.database import get_db
from app.models import User, Feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    message: str
    rating: int | None = None
    source: str = "miniapp"


@router.post("")
async def submit_feedback(
    req: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fb = Feedback(
        user_id=user.id,
        message=req.message,
        rating=req.rating,
        source=req.source,
    )
    db.add(fb)
    await db.commit()
    return {"message": "Fikr-mulohaza qabul qilindi. Rahmat!"}
