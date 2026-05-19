"""ZAI Platform — Referral API"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/referral", tags=["referral"])


class ReferralTrackRequest(BaseModel):
    referrer_id: str


class ReferralTrackResponse(BaseModel):
    message: str


@router.post("/track", response_model=ReferralTrackResponse)
async def track_referral(
    req: ReferralTrackRequest,
    current_user: User = Depends(get_current_user),
) -> ReferralTrackResponse:
    """
    Referral havolasini qayd etish.

    Foydalanuvchi boshqa foydalanuvchining ref havolasi orqali kirganida
    chaqiriladi. Hozircha stub — DB modeli keyingi iteratsiyada qo'shiladi.
    """
    # Foydalanuvchi o'zini o'zi tavsiya qila olmaydi
    if req.referrer_id == str(current_user.id):
        raise HTTPException(
            status_code=400,
            detail="O'z havolangizdan foydalana olmaysiz",
        )

    # TODO: DB ga yozish (keyingi iteratsiyada)
    return ReferralTrackResponse(message="Referral qayd etildi")
