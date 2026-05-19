"""ZAI Platform — Analytics Events API (E4)

Lightweight, fire-and-forget event tracking. Accepts both authenticated
and anonymous events. Properties are stored as JSON (max 4KB) and the
event name MUST come from a fixed whitelist (anti-noise + anti-abuse).
"""
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.limiter import limiter
from app.database import get_db
from app.models import AnalyticsEvent, User

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Faqat shu eventlarni qabul qilamiz — yangi event qo'shilsa, frontend
# `ALLOWED_EVENTS` bilan parallel yangilanishi kerak.
ALLOWED_EVENTS: set[str] = {
    "agent_viewed",
    "content_generated",
    "purchase_initiated",
    "purchase_completed",
    "share_clicked",
    "tab_switched",
    "app_opened",
    "trial_expired_seen",
    "error_shown",
}

ALLOWED_PLATFORMS: set[str] = {
    "tdesktop", "ios", "android", "web", "macos", "android_x", "weba",
    "unigram", "unknown",
}

MAX_PROPERTIES_BYTES = 4096  # 4 KB


class AnalyticsEventRequest(BaseModel):
    event_name: str = Field(..., min_length=1, max_length=64)
    properties: dict[str, Any] | None = None
    session_id: str | None = Field(None, max_length=64)
    platform: str | None = Field(None, max_length=32)


@router.post("/track", status_code=202)
@limiter.limit("60/minute")
async def track_event(
    request: Request,
    event: AnalyticsEventRequest,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Event qabul qilish.

    - Authenticated va anonymous foydalanuvchilar uchun ochiq.
    - `event_name` whitelist'dan tashqarida bo'lsa 400.
    - `properties` JSON serializatsiyasi 4KB dan oshsa 400.
    """
    if event.event_name not in ALLOWED_EVENTS:
        raise HTTPException(status_code=400, detail="Unknown event_name")

    properties_json: str | None = None
    if event.properties is not None:
        if not isinstance(event.properties, dict):
            raise HTTPException(status_code=400, detail="properties must be an object")
        try:
            properties_json = json.dumps(event.properties, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="properties is not JSON serializable")
        if len(properties_json.encode("utf-8")) > MAX_PROPERTIES_BYTES:
            raise HTTPException(status_code=400, detail="properties too large (max 4KB)")

    platform = event.platform
    if platform and platform.lower() not in ALLOWED_PLATFORMS:
        # Noma'lum platforma qabul qilamiz, lekin "unknown" deb yozamiz
        platform = "unknown"

    db.add(AnalyticsEvent(
        user_id=user.id if user else None,
        session_id=event.session_id,
        event_name=event.event_name,
        properties=properties_json,
        platform=platform,
        is_premium=bool(user.is_premium) if user else False,
    ))
    await db.commit()

    return {"status": "ok"}
