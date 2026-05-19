"""
HUMO Avto P2P To'lov API.

Foydalanuvchi oqimi:
  1. POST /humo/quote          → pending order (karta + summa + countdown)
  2. (User HUMO kartaga to'laydi)
  3. (Bank @humocardbot Telegram'ga xabar yuboradi)
  4. (Telethon listener xabarni POST qiladi → /humo/sms/webhook/{secret})
  5. GET  /humo/orders/{id}    → frontend polling, status='paid' bo'lganda muvaffaqiyat
  6. POST /humo/orders/{id}/cancel  → user qo'lda bekor qildi

Xavfsizlik:
  - Quote: JWT bilan, server-side narx hisoblash
  - SMS webhook: URL secret + IP whitelist + HMAC + replay protection
"""
from __future__ import annotations

import hmac
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.core.limiter import limiter
from app.database import get_db
from app.models import Agent, User, HumoOrder, SmsLog
from app.services.sms_parser import parse_humocard_message, is_zai_topup
from app.services.humo_orders import (
    create_humo_order,
    match_sms_to_order,
    mark_order_paid,
)

router = APIRouter(prefix="/payments/humo", tags=["humo-avto"])
logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════
# 1) /humo/quote — yangi order yaratish
# ════════════════════════════════════════════════════════════════


class HumoQuoteRequest(BaseModel):
    agent_slug: str
    plan_type: str = Field(default="monthly", pattern="^(daily|weekly|monthly)$")


class HumoQuoteResponse(BaseModel):
    order_id: str
    payment_method: str = "humo_avto"
    card_number: str
    card_mask: str
    card_holder_name: Optional[str]
    base_amount: float
    expected_amount: float
    extra_sum: float
    plan_type: str
    agent_name: str
    expires_at: str             # ISO 8601 UTC
    ttl_seconds: int


def _plan_price(agent: Agent, plan: str) -> float:
    if plan == "daily":
        return float(agent.price_daily or 0)
    if plan == "weekly":
        return float(agent.price_weekly or 0)
    return float(agent.price_monthly or 0)


@router.post("/quote", response_model=HumoQuoteResponse)
@limiter.limit("10/minute")
async def humo_quote(
    request: Request,
    req: HumoQuoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pending HUMO order yaratadi va karta + summa qaytaradi."""
    cfg = get_settings()

    if not cfg.humo_avto_enabled:
        raise HTTPException(503, "HUMO Avto to'lov hozircha o'chirilgan")
    if not cfg.humo_card_number or not cfg.humo_card_mask:
        raise HTTPException(503, "HUMO karta sozlanmagan (admin'ga murojaat qiling)")

    # Agent topish
    res = await db.execute(select(Agent).where(Agent.slug == req.agent_slug))
    agent: Agent | None = res.scalar_one_or_none()
    if not agent or not agent.is_active:
        raise HTTPException(404, "Agent topilmadi")

    # Narx (server-side, frontend'ga ishonmaymiz)
    base_price = _plan_price(agent, req.plan_type)
    if base_price <= 0:
        raise HTTPException(400, "Bu agent uchun narx sozlanmagan")

    # Order yaratish
    order = await create_humo_order(
        db=db,
        user=user,
        agent=agent,
        plan=req.plan_type,
        base_amount=base_price,
        card_mask=cfg.humo_card_mask,
        card_holder_name=cfg.humo_card_holder_name or None,
        ttl_minutes=cfg.humo_order_ttl_minutes,
        collision_max_offset=cfg.humo_collision_max_offset,
    )
    await db.commit()
    await db.refresh(order)

    ttl_sec = max(0, int((order.expires_at - datetime.now(timezone.utc)).total_seconds()))

    logger.info(
        "humo_quote: order=%s user=%s agent=%s plan=%s amount=%s extra=%s",
        order.id, user.id, agent.slug, req.plan_type, order.expected_amount, order.extra_sum,
    )

    return HumoQuoteResponse(
        order_id=order.id,
        card_number=cfg.humo_card_number,
        card_mask=cfg.humo_card_mask,
        card_holder_name=cfg.humo_card_holder_name or None,
        base_amount=order.base_amount,
        expected_amount=order.expected_amount,
        extra_sum=order.extra_sum,
        plan_type=req.plan_type,
        agent_name=agent.name,
        expires_at=order.expires_at.isoformat(),
        ttl_seconds=ttl_sec,
    )


# ════════════════════════════════════════════════════════════════
# 2) GET /humo/orders/{id} — order holatini tekshirish (polling)
# ════════════════════════════════════════════════════════════════


class HumoOrderStatusResponse(BaseModel):
    order_id: str
    status: str                 # pending | paid | expired | cancelled | manual_review
    expected_amount: float
    plan_type: str
    expires_at: str
    seconds_left: int
    paid_at: Optional[str]
    user_agent_id: Optional[str]


@router.get("/orders/{order_id}", response_model=HumoOrderStatusResponse)
@limiter.limit("60/minute")  # frontend har 5 sek poll qilsa = 12/min, ehtiyot bilan 60
async def humo_order_status(
    request: Request,
    order_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(HumoOrder).where(
            and_(HumoOrder.id == order_id, HumoOrder.user_id == user.id)
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order topilmadi")

    # Auto-expire o'tib ketganlar
    now = datetime.now(timezone.utc)
    if order.status == "pending" and order.expires_at < now:
        order.status = "expired"
        await db.commit()
        await db.refresh(order)

    seconds_left = max(0, int((order.expires_at - now).total_seconds()))

    return HumoOrderStatusResponse(
        order_id=order.id,
        status=order.status,
        expected_amount=order.expected_amount,
        plan_type=order.plan,
        expires_at=order.expires_at.isoformat(),
        seconds_left=seconds_left,
        paid_at=order.paid_at.isoformat() if order.paid_at else None,
        user_agent_id=order.user_agent_id,
    )


# ════════════════════════════════════════════════════════════════
# 3) POST /humo/orders/{id}/cancel — user qo'lda bekor qildi
# ════════════════════════════════════════════════════════════════


@router.post("/orders/{order_id}/cancel")
@limiter.limit("10/minute")
async def humo_cancel(
    request: Request,
    order_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(HumoOrder).where(
            and_(HumoOrder.id == order_id, HumoOrder.user_id == user.id)
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order topilmadi")
    if order.status != "pending":
        raise HTTPException(400, f"Order allaqachon '{order.status}'")

    order.status = "cancelled"
    await db.commit()
    return {"ok": True, "status": "cancelled"}


# ════════════════════════════════════════════════════════════════
# 4) POST /humo/sms/webhook/{secret} — Telethon listener'dan
# ════════════════════════════════════════════════════════════════


class SmsWebhookPayload(BaseModel):
    """Telethon listener yuboradigan payload."""
    sms_external_id: str        # Telegram message ID (noyob)
    from_chat: str              # @humocardbot
    text: str                   # to'liq xabar matni
    received_at: int            # unix timestamp


class SmsWebhookResponse(BaseModel):
    ok: bool
    matched: bool = False
    duplicate: bool = False
    sms_log_id: Optional[str] = None
    order_id: Optional[str] = None
    note: Optional[str] = None


def _verify_hmac(raw_body: bytes, signature: str, key: str) -> bool:
    if not signature or not key:
        return False
    expected = hmac.new(key.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def _ip_allowed(client_ip: str, allowed_csv: str) -> bool:
    if not allowed_csv:
        return True  # whitelist bo'sh = hammasi (faqat dev rejim uchun)
    allowed = {ip.strip() for ip in allowed_csv.split(",") if ip.strip()}
    return client_ip in allowed


@router.post("/sms/webhook/{secret}", response_model=SmsWebhookResponse)
async def humo_sms_webhook(
    request: Request,
    secret: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Telethon listener'dan kelgan bank SMS'ni qabul qiladi va match qiladi.
    
    Auth qatlamlari:
      1. URL path secret (constant-time compare)
      2. IP whitelist (config dan)
      3. HMAC-SHA256 signature (X-Signature header)
      4. Replay protection (sms_external_id UNIQUE)
    """
    cfg = get_settings()

    # 1. URL secret
    if not cfg.sms_webhook_secret:
        raise HTTPException(503, "SMS webhook configured emas")
    if not hmac.compare_digest(secret, cfg.sms_webhook_secret):
        raise HTTPException(403, "Noto'g'ri secret")

    # 2. IP whitelist
    client_ip = request.client.host if request.client else ""
    if not _ip_allowed(client_ip, cfg.sms_webhook_allowed_ips):
        logger.warning("sms_webhook: IP not allowed: %s", client_ip)
        raise HTTPException(403, "IP not allowed")

    # 3. HMAC signature (raw body o'qiymiz)
    raw = await request.body()
    sig = request.headers.get("X-Signature", "")
    if cfg.sms_webhook_hmac_key:
        if not _verify_hmac(raw, sig, cfg.sms_webhook_hmac_key):
            raise HTTPException(403, "Invalid signature")

    # Payload parse
    try:
        data = json.loads(raw)
        payload = SmsWebhookPayload(**data)
    except Exception as e:
        raise HTTPException(400, f"Invalid payload: {e}")

    # 4. Replay protection
    existing = await db.execute(
        select(SmsLog).where(SmsLog.sms_external_id == payload.sms_external_id)
    )
    if existing.scalar_one_or_none():
        return SmsWebhookResponse(ok=True, duplicate=True, note="already processed")

    received_at = datetime.fromtimestamp(payload.received_at, tz=timezone.utc)

    # SMS log yozuv yaratish
    sms_log = SmsLog(
        sms_external_id=payload.sms_external_id,
        from_chat=payload.from_chat,
        raw_text=payload.text,
        received_at=received_at,
        status="received",
    )
    db.add(sms_log)
    await db.flush()

    # 5. Parse
    parsed = parse_humocard_message(payload.text)
    if parsed is None:
        sms_log.status = "unparseable"
        sms_log.note = "Bank xabari emas yoki format tushunilmadi"
        await db.commit()
        return SmsWebhookResponse(ok=True, matched=False, sms_log_id=sms_log.id, note="unparseable")

    # Parse natijasini saqlaymiz
    sms_log.transaction_type = parsed.transaction_type
    sms_log.parsed_amount = parsed.amount
    sms_log.parsed_card = parsed.card_mask
    sms_log.parsed_source = parsed.source
    sms_log.parsed_balance = parsed.balance
    sms_log.parsed_at = datetime.now(timezone.utc)

    # 6. ZAI uchunmi? (To'ldirish + bizning karta)
    if not is_zai_topup(parsed, cfg.humo_card_mask):
        sms_log.status = "filtered"
        sms_log.note = f"Outgoing yoki boshqa karta: {parsed.transaction_type}, {parsed.card_mask}"
        await db.commit()
        return SmsWebhookResponse(ok=True, matched=False, sms_log_id=sms_log.id, note="filtered")

    # 7. Order matching
    order = await match_sms_to_order(
        db=db,
        parsed_amount=parsed.amount,
        received_at=received_at,
        window_minutes=cfg.humo_order_ttl_minutes,
    )

    if not order:
        sms_log.status = "no_match"
        sms_log.note = (
            f"Pending order topilmadi: amount={parsed.amount}. "
            "Admin reconciliation queue'da."
        )
        await db.commit()
        logger.warning("humo_webhook: no match for amount=%s", parsed.amount)
        return SmsWebhookResponse(ok=True, matched=False, sms_log_id=sms_log.id, note="no_match")

    # 8. Mark paid
    ua = await mark_order_paid(db, order, sms_log)
    sms_log.status = "matched"
    sms_log.matched_order_id = order.id
    sms_log.matched_by = "auto"

    await db.commit()

    logger.info(
        "humo_webhook: MATCHED order=%s user=%s amount=%s ua=%s",
        order.id, order.user_id, parsed.amount, ua.id,
    )

    # Foydalanuvchiga Telegram notification ixtiyoriy — bot lifespan'da yuborish mumkin.
    # Hozircha frontend polling orqali ko'radi.

    return SmsWebhookResponse(
        ok=True,
        matched=True,
        sms_log_id=sms_log.id,
        order_id=order.id,
        note="paid",
    )


# ════════════════════════════════════════════════════════════════
# 5) Health / config check
# ════════════════════════════════════════════════════════════════


@router.get("/health")
async def humo_health(user: User = Depends(get_current_user)):
    """HUMO Avto sozlamalarining holati (faqat ulangan user uchun)."""
    cfg = get_settings()
    return {
        "enabled": cfg.humo_avto_enabled,
        "card_configured": bool(cfg.humo_card_number and cfg.humo_card_mask),
        "ttl_minutes": cfg.humo_order_ttl_minutes,
        "webhook_secret_set": bool(cfg.sms_webhook_secret),
        "hmac_key_set": bool(cfg.sms_webhook_hmac_key),
        "ip_whitelist": cfg.sms_webhook_allowed_ips or "(any)",
    }
