"""ZAI — Audit Log Helper"""
import json
from datetime import datetime, timezone
from fastapi import Request
from app.database import async_session
from app.models import AuditLog


async def log_audit(
    admin_id: str,
    action: str,
    target_type: str,
    target_id: str | None = None,
    payload: dict | None = None,
    request: Request | None = None,
):
    """Audit log yozuvini yaratish."""
    async with async_session() as session:
        log = AuditLog(
            admin_id=admin_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload=json.dumps(payload, default=str) if payload else None,
            ip_address=request.client.host if request and request.client else None,
        )
        session.add(log)
        await session.commit()
