"""TON Blockchain Payment API.

Foydalanuvchi USDT yoki TON to'lagandan so'ng, frontend bu endpoint'ga
tranzaksiya hash'ini yuboradi va backend blockchain'da tekshirib, agentni
avtomatik faollashtiradi. Admin tasdig'i shart emas.
"""
import logging
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models import Agent, User, UserAgent, PaymentTransaction

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)


def _get_settings():
    return get_settings()


# TON Center API — mainnet va testnet
TONCENTER_MAINNET = "https://toncenter.com/api/v2"
TONCENTER_TESTNET = "https://testnet.toncenter.com/api/v2"
# ZAI company TON wallet addresses
# MUHIM: TON Center API v2 EQ format talab qiladi (UQ emas!)
ZAI_WALLET_MAINNET = "EQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg6sdiohIwg5jL"  # mainnet EQ
ZAI_WALLET_TESTNET = "EQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg6sdiohIwg5jL"  # testnet uchun o'zgartiring


def _get_ton_config():
    """TON network konfiguratsiyasini qaytaradi."""
    cfg = _get_settings()
    is_testnet = cfg.ton_testnet_mode
    api_key = cfg.toncenter_api_key  # bo'sh bo'lsa keysiz ishlaydi (1 RPS)
    return {
        "api_key": api_key,
        "base_url": TONCENTER_TESTNET if is_testnet else TONCENTER_MAINNET,
        "wallet": ZAI_WALLET_TESTNET if is_testnet else ZAI_WALLET_MAINNET,
        "is_testnet": is_testnet,
    }


class TonVerifyRequest(BaseModel):
    tx_hash: str                 # TON tranzaksiya BOC yoki hash
    user_agent_id: str           # To'lov qaysi UserAgent uchun
    amount_usdt: float           # To'langan summa (USDT)
    currency: str = "USDT"      # "USDT" | "TON"
    plan_type: str = "monthly"  # "monthly" | "weekly"


class TonVerifyResponse(BaseModel):
    activated: bool
    message: str
    expires_at: Optional[str] = None


async def _check_ton_transaction(tx_hash: str, expected_amount_nano: int, comment_hint: str = "") -> bool:
    """
    TON Center API v2 orqali tranzaksiyani tekshirish.
    X-API-Key header formatida yuboriladi.
    """
    ton = _get_ton_config()
    api_key = ton["api_key"]
    base_url = ton["base_url"]
    wallet = ton["wallet"]

    try:
        headers = {"Accept": "application/json"}
        if api_key:
            # @tonapibot keylar uchun: Authorization: Bearer format
            headers["Authorization"] = f"Bearer {api_key}"

        params = {"address": wallet, "limit": 20}

        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                f"{base_url}/getTransactions",
                params=params,
                headers=headers,
            )

        # Agar key bilan 401 kelsa — keysiz (free tier) fallback
        if resp.status_code in (401, 403) and api_key:
            logger.warning(f"TON API {resp.status_code}: key ishlamayapti, keysiz sinayapmiz")
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(
                    f"{base_url}/getTransactions",
                    params=params,
                    headers={"Accept": "application/json"},
                )

        if resp.status_code != 200:
            logger.warning(f"TON Center {base_url}: HTTP {resp.status_code}")
            return False

        data = resp.json()
        transactions = data.get("result", [])
        network_label = "testnet" if ton["is_testnet"] else "mainnet"
        logger.info(f"TON [{network_label}]: {len(transactions)} tx topildi, wallet={wallet[:12]}...")

        for tx in transactions:
            tx_str = str(tx)
            if tx_hash in tx_str or (comment_hint and comment_hint in tx_str):
                in_msg = tx.get("in_msg", {})
                value = int(in_msg.get("value", 0))
                if value >= expected_amount_nano * 0.90:
                    logger.info(f"TON tx tasdiqlandi! value={value/1e9:.4f} TON, expected~{expected_amount_nano/1e9:.4f}")
                    return True

    except Exception as e:
        logger.error(f"TON check xatosi: {e}")

    return False




async def _activate_user_agent(user_agent_id: str, plan_type: str, db: AsyncSession) -> UserAgent:
    """UserAgent'ni avtomatik faollashtirish."""
    result = await db.execute(select(UserAgent).where(UserAgent.id == user_agent_id))
    ua = result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="UserAgent topilmadi")

    now = datetime.now(timezone.utc)
    plan_days = {"daily": 1, "weekly": 7, "monthly": 30}

    ua.status = "active"
    ua.started_at = now
    ua.expires_at = now + timedelta(days=plan_days.get(plan_type, 30))
    ua.tasks_used_today = 0
    ua.tokens_used_today = 0

    await db.commit()
    await db.refresh(ua)
    return ua


@router.post("/ton/verify", response_model=TonVerifyResponse)
async def verify_ton_payment(
    req: TonVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Frontend tranzaksiya yuborganidan keyin shu endpoint'ni chaqiradi.
    Backend TON blockchain'da tekshirib, agentni avtomatik faollashtiradi.
    """
    # 1. UserAgent mavjudligini tekshirish
    result = await db.execute(
        select(UserAgent).where(
            UserAgent.id == req.user_agent_id,
            UserAgent.user_id == user.id,
        )
    )
    ua = result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="Sotib olish so'rovi topilmadi")

    # Agar allaqachon active bo'lsa
    if ua.status == "active":
        return TonVerifyResponse(
            activated=True,
            message="Agent allaqachon faol",
            expires_at=ua.expires_at.isoformat() if ua.expires_at else None,
        )

    # 1.5. Tranzaksiya allaqachon ishlatilmaganligini tekshirish
    tx_exists = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.tx_hash == req.tx_hash)
    )
    if tx_exists.scalar_one_or_none():
        return TonVerifyResponse(activated=False, message="Bu tranzaksiya allaqachon ishlatilgan")

    # 2. TON/USDT miqdorini hisoblash
    # Taxminiy: 1 USDT = 1_000_000 nano-USDT, TON = nanoTON
    if req.currency == "USDT":
        expected_nano = int(req.amount_usdt * 1_000_000)  # USDT Jetton
    else:
        # TON: 1 USD ≈ 3.2 TON uchun
        expected_nano = int(req.amount_usdt / 3.2 * 1e9)

    # 3. Blockchain'da tekshirish (keysiz ham ishlaydi — 1 RPS limit)
    comment_hint = f"zai_pay:{req.user_agent_id}"
    logger.info(f"TON verify: currency={req.currency}, amount={req.amount_usdt}, user={user.telegram_id}")

    tx_confirmed = await _check_ton_transaction(req.tx_hash, expected_nano, comment_hint)

    if not tx_confirmed:
        return TonVerifyResponse(activated=False, message="Tranzaksiya hali tasdiqlanmadi")

    # 4. Audit yozuvini yaratish
    tx_record = PaymentTransaction(
        user_id=user.id,
        agent_id=ua.agent_id,
        amount=req.amount_usdt,
        currency=req.currency,
        payment_method="tonconnect",
        tx_hash=req.tx_hash,
        status="completed",
        plan_type=req.plan_type,
        completed_at=datetime.now(timezone.utc)
    )
    db.add(tx_record)

    # 5. Agentni faollashtirish
    activated_ua = await _activate_user_agent(req.user_agent_id, req.plan_type, db)

    logger.info(
        f"TON to'lov tasdiqlandi: user={user.telegram_id}, "
        f"agent={req.user_agent_id}, tx={req.tx_hash[:16]}..."
    )

    return TonVerifyResponse(
        activated=True,
        message="To'lov tasdiqlandi! Agent faollashtirildi.",
        expires_at=activated_ua.expires_at.isoformat() if activated_ua.expires_at else None,
    )


@router.post("/ton/webhook")
async def ton_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    TON Pay webhook — to'lov avtomatik kelganda chaqiriladi.
    HMAC signature va timestamp orqali himoyalangan.
    """
    cfg = _get_settings()
    secret = cfg.ton_webhook_secret
    if not secret:
        logger.warning("TON webhook secret is not set. Endpoint disabled.")
        raise HTTPException(status_code=503, detail="Webhook service unavailable")

    # 1. Signature va Timestamp tekshirish
    signature = request.headers.get("X-Ton-Signature")
    timestamp_str = request.headers.get("X-Ton-Timestamp")

    if not signature or not timestamp_str:
        raise HTTPException(status_code=401, detail="Missing signature headers")

    try:
        timestamp = int(timestamp_str)
        now = int(datetime.now(timezone.utc).timestamp())
        # Replay protection: 5 daqiqadan eski so'rovlarni rad etish
        if abs(now - timestamp) > 300:
            raise HTTPException(status_code=401, detail="Request expired")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    try:
        body = await request.body()
        
        # HMAC-SHA256 signature hisoblash
        # message format: timestamp + "." + raw_body
        message = f"{timestamp_str}." + body.decode("utf-8")
        expected_signature = hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, signature):
            logger.warning(f"Invalid webhook signature. Expected: {expected_signature[:8]}..., Got: {signature[:8]}...")
            raise HTTPException(status_code=401, detail="Invalid signature")

        payload = await request.json()
        logger.info(f"TON Webhook received (verified): {payload}")

        # Payload'dan user_agent_id va tx_hash olamiz
        comment = payload.get("comment", "")
        if comment.startswith("zai_pay:"):
            parts = comment.split(":")
            if len(parts) >= 4:
                user_agent_id = parts[1]
                currency = parts[2]
                plan_type = parts[3]

                # Avtomatik faollashtirish
                ua = await _activate_user_agent(user_agent_id, plan_type, db)
                logger.info(f"Webhook: agent {user_agent_id} faollashtirildi")
                return {"ok": True, "user_agent_id": user_agent_id}

        return {"ok": True, "message": "Webhook qabul qilindi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TON Webhook xatosi: {e}")
        return {"ok": False, "error": str(e)}
