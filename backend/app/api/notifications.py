"""ZAI Platform — Notifications API"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/enable")
async def enable_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Foydalanuvchi uchun bildirishnomalarni yoqish (write_access granted)."""
    current_user.write_access_granted = True
    db.add(current_user)
    await db.commit()
    return {"message": "Bildirishnomalar yoqildi"}
