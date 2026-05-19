"""ZAI — Admin Audit Log Viewer Router"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_db
from app.models import User, AuditLog

router = APIRouter(prefix="/admin/audit-logs", tags=["admin"])


# ─── Pydantic Schemas ───────────────────────────────────────

class AuditLogItem(BaseModel):
    id: str
    admin_id: str
    action: str
    target_type: str
    target_id: str | None = None
    payload: str | None = None
    ip_address: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    limit: int
    offset: int


# ─── Endpoints ──────────────────────────────────────────────

@router.get("")
async def list_audit_logs(
    admin_id: str | None = None,
    action: str | None = None,
    target_type: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Audit loglarni ko'rish — filter bilan."""
    query = select(AuditLog)

    if admin_id:
        query = query.where(AuditLog.admin_id == admin_id)

    if action:
        query = query.where(AuditLog.action == action)

    if target_type:
        query = query.where(AuditLog.target_type == target_type)

    if created_after:
        query = query.where(AuditLog.created_at >= created_after)

    if created_before:
        query = query.where(AuditLog.created_at <= created_before)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Sort by newest first
    query = query.order_by(desc(AuditLog.created_at))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "items": [AuditLogItem.model_validate(log).model_dump() for log in logs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
