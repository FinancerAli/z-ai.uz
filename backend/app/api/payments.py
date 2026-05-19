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


def _get_ton_config():
    """TON network konfiguratsiyasini qaytaradi."""
    cfg = _get_settings()
    is_testnet = cfg.ton_testnet_mode
    api_key = cfg.toncenter_api_key  # bo'sh bo'lsa keysiz ishlaydi (1 RPS)
    # Wallet faqat config'dan olinadi — hardcoded fallback yo'q.
    # Production'da .env da TON_WALLET_ADDRESS aniq sozlangan bo'lishi shart.
    return {
        "api_key": api_key,
        "base_url": TONCENTER_TESTNET if is_testnet else TONCENTER_MAINNET,
        "wallet": cfg.ton_wallet_address,
        "is_testnet": is_testnet,
    }


def _expected_uzs(agent: Agent, plan_type: str) -> float:
    """Plan asosida agent narxini DB'dan olish (UZS)."""
    plan_type = (plan_type or "monthly").lower()
    if plan_type == "daily":
        return float(agent.price_daily or 0)
    if plan_type == "weekly":
        return float(agent.price_weekly or 0)
    return float(agent.price_monthly or 0)


def _uzs_to_nano_ton(price_uzs: float) -> int:
    """UZS narxni nano-TON ga o'tkazish (server-side hisoblash)."""
    cfg = _get_settings()
    rate = cfg.ton_uzs_rate or 28670.0
    if rate <= 0:
        rate = 28670.0
    amount_ton = price_uzs / rate
    return int(round(amount_ton * 1_000_000_000))


class TonVerifyRequest(BaseModel):
    """
    TON to'lovni tekshirish so'rovi.
    ⚠️ Frontend yuborgan amount/currency e'tiborga OLINMAYDI — backend o'zi
    DB narxidan hisoblaydi va blockchain bilan solishtiradi.
    """
    tx_hash: str                    # TON tranzaksiya hash
    user_agent_id: str              # Pending UserAgent
    plan_type: str = "monthly"      # "daily" | "weekly" | "monthly"
    # Quyidagi maydonlar legacy compatibility uchun qabul qilinadi, lekin
    # backend ulardan FOYDALANMAYDI. Aniq aytib qo'yish uchun rasman e'lon.
    amount_usdt: float | None = None     # IGNORED
    amount_ton: float | None = None      # IGNORED
    amount_nano: int | None = None       # IGNORED
    currency: str | None = None          # IGNORED
    price: float | None = None           # IGNORED


class TonVerifyResponse(BaseModel):
    activated: bool
    message: str
    expires_at: Optional[str] = None
    # Diagnostika maydonlari (sanitized)
    reason_code: str | None = None


class TonQuoteRequest(BaseModel):
    user_agent_id: str
    plan_type: str = "monthly"


class TonQuoteResponse(BaseModel):
    payment_method: str = "ton"
    wallet_address: str
    price_uzs: float
    amount_ton: float
    amount_nano: int
    plan_type: str
    agent_name: str
    comment: str
    network: str  # "mainnet" | "testnet"


async def _check_ton_transaction(
    tx_hash: str,
    expected_amount_nano: int,
    expected_comment: str,
) -> tuple[bool, str | None, int | None]:
    """
    TON Center API v2 orqali tranzaksiyani xavfsiz tekshirish.

    Returns:
        (success, fail_reason, actual_value_nano)
        success=True bo'lsa fail_reason=None va actual_value_nano>=expected.

    Tekshiriladigan:
      1. tx_hash MAJBURIY moslashishi kerak (transaction_id.hash yoki in_msg.hash)
      2. Transaction destination wallet == config.ton_wallet_address
      3. amount_nano >= expected_amount_nano (tolerans bilan)
      4. Comment expected_comment bilan EXACT match (substring emas)
    """
    cfg = _get_settings()
    ton = _get_ton_config()
    api_key = ton["api_key"]
    base_url = ton["base_url"]
    wallet = ton["wallet"]
    tolerance = cfg.ton_amount_tolerance_pct / 100.0  # masalan 1% -> 0.01
    threshold = int(expected_amount_nano * (1.0 - tolerance))

    def _build_headers(key: str) -> dict:
        h = {"Accept": "application/json"}
        if key:
            h["Authorization"] = f"Bearer {key}"
        return h

    try:
        params = {"address": wallet, "limit": 50}

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{base_url}/getTransactions",
                params=params,
                headers=_build_headers(api_key),
            )

        # Agar key bilan 401 kelsa — keysiz fallback
        if resp.status_code in (401, 403) and api_key:
            logger.warning(f"TON API {resp.status_code}: key ishlamayapti, keysiz sinayapmiz")
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{base_url}/getTransactions",
                    params=params,
                    headers={"Accept": "application/json"},
                )

        if resp.status_code != 200:
            logger.warning(f"TON Center {base_url}: HTTP {resp.status_code}")
            return False, "ton_api_unavailable", None

        data = resp.json()
        transactions = data.get("result", [])
        network_label = "testnet" if ton["is_testnet"] else "mainnet"
        logger.info(
            f"TON [{network_label}] check: {len(transactions)} tx, wallet={wallet[:12]}..., "
            f"expected_nano={expected_amount_nano}, comment='{expected_comment}'"
        )

        # Hech bo'lmasa 1 ta tx topib hash MOSLASHISHI shart.
        # Comment-only match endi ishlamaydi — bu xavfsiz emas.
        for tx in transactions:
            in_msg = tx.get("in_msg", {})

            # 1. Hash exact match (substring emas)
            tx_id = tx.get("transaction_id", {}).get("hash", "")
            in_msg_hash = in_msg.get("hash", "")
            if tx_hash != tx_id and tx_hash != in_msg_hash:
                continue  # Bu tx bizniki emas

            # 2. Destination wallet — TON Center query ham wallet bo'yicha filter qiladi,
            # lekin javobda destination ham bor. Ikki marotaba tekshirish.
            destination = in_msg.get("destination", "")
            if destination and destination != wallet:
                # Wallet boshqa joyga yuborilgan
                logger.warning(f"TON tx {tx_hash[:12]}... wallet mismatch: dest={destination}, expected={wallet}")
                return False, "wrong_destination", None

            # 3. Amount tekshiruv
            try:
                value = int(in_msg.get("value", 0))
            except (TypeError, ValueError):
                value = 0

            if value < threshold:
                logger.warning(
                    f"TON tx {tx_hash[:12]}... insufficient: value={value}, "
                    f"expected>={threshold} (tolerans={cfg.ton_amount_tolerance_pct}%)"
                )
                return False, "insufficient_amount", value

            # 4. Comment EXACT match
            msg_text = (in_msg.get("message", "") or "").strip()
            if expected_comment and msg_text != expected_comment:
                logger.warning(
                    f"TON tx {tx_hash[:12]}... comment mismatch: "
                    f"got={msg_text!r}, expected={expected_comment!r}"
                )
                return False, "comment_mismatch", value

            logger.info(
                f"TON tx OK: hash={tx_hash[:12]}..., value={value/1e9:.4f} TON, "
                f"expected~{expected_amount_nano/1e9:.4f} TON"
            )
            return True, None, value

        # Hech qanday tx topilmadi — hash blockchain'da yo'q
        return False, "tx_not_found", None

    except Exception as e:
        logger.error(f"TON check xatosi: {e}")
        return False, "ton_check_error", None




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


@router.post("/ton/quote", response_model=TonQuoteResponse)
async def ton_payment_quote(
    req: TonQuoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    TON to'lov uchun server-side quote.
    Frontend bu endpoint javobidan keyin TON tranzaksiya yuboradi.
    Narx faqat backend tomondan hisoblanadi (DB price + ton_uzs_rate).
    """
    cfg = _get_settings()
    if not cfg.ton_payment_enabled:
        raise HTTPException(status_code=503, detail="TON to'lovi vaqtinchalik o'chirilgan")
    if not cfg.ton_wallet_address:
        raise HTTPException(status_code=503, detail="TON wallet sozlanmagan")

    # 1. UserAgent ownership
    ua_result = await db.execute(
        select(UserAgent).where(
            UserAgent.id == req.user_agent_id,
            UserAgent.user_id == user.id,
        )
    )
    ua = ua_result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="Sotib olish so'rovi topilmadi")

    if ua.status == "active":
        raise HTTPException(status_code=400, detail="Bu agent allaqachon faol")
    if ua.status == "pending":
        pass  # OK
    elif ua.status not in ("expired", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Status='{ua.status}' uchun to'lov yaratish mumkin emas")

    # 2. Agent + narx
    agent_result = await db.execute(select(Agent).where(Agent.id == ua.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    plan_type = (req.plan_type or ua.plan_type or "monthly").lower()
    if plan_type not in ("daily", "weekly", "monthly"):
        raise HTTPException(status_code=400, detail="plan_type noto'g'ri")

    price_uzs = _expected_uzs(agent, plan_type)
    if price_uzs <= 0:
        raise HTTPException(status_code=400, detail="Bu tarif uchun narx belgilanmagan")

    amount_nano = _uzs_to_nano_ton(price_uzs)
    amount_ton = round(amount_nano / 1_000_000_000, 6)
    comment = f"zai_pay:{req.user_agent_id}:{plan_type}"
    network = "testnet" if cfg.ton_testnet_mode else "mainnet"

    return TonQuoteResponse(
        payment_method="ton",
        wallet_address=cfg.ton_wallet_address,
        price_uzs=price_uzs,
        amount_ton=amount_ton,
        amount_nano=amount_nano,
        plan_type=plan_type,
        agent_name=agent.name,
        comment=comment,
        network=network,
    )


@router.post("/ton/verify", response_model=TonVerifyResponse)
async def verify_ton_payment(
    req: TonVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    TON to'lovni tekshirish.

    XAVFSIZLIK QOIDALARI:
      - Frontend yuborgan amount/currency E'TIBORGA OLINMAYDI.
      - Narx server-side DB'dan + config rate'idan hisoblanadi.
      - Wallet faqat config.ton_wallet_address.
      - Hash exact match talab qilinadi.
      - Comment exact match talab qilinadi (zai_pay:{ua_id}:{plan_type}).
      - tx_hash duplicate bo'lsa rad etiladi (replay protection).
      - UserAgent ownership tekshiriladi.
    """
    cfg = _get_settings()
    if not cfg.ton_payment_enabled:
        raise HTTPException(status_code=503, detail="TON to'lovi vaqtinchalik o'chirilgan")

    # 1. UserAgent ownership tekshirish
    result = await db.execute(
        select(UserAgent).where(
            UserAgent.id == req.user_agent_id,
            UserAgent.user_id == user.id,
        )
    )
    ua = result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="Sotib olish so'rovi topilmadi")

    # 2. Idempotent — agar allaqachon active bo'lsa
    if ua.status == "active":
        return TonVerifyResponse(
            activated=True,
            message="Agent allaqachon faol",
            expires_at=ua.expires_at.isoformat() if ua.expires_at else None,
            reason_code="already_active",
        )

    if ua.status not in ("pending", "expired", "cancelled"):
        return TonVerifyResponse(
            activated=False,
            message=f"Status='{ua.status}' uchun to'lov tekshirilmaydi",
            reason_code="invalid_status",
        )

    # 3. Replay protection — tx_hash allaqachon ishlatilganmi?
    tx_exists = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.tx_hash == req.tx_hash)
    )
    if tx_exists.scalar_one_or_none():
        return TonVerifyResponse(
            activated=False,
            message="Bu tranzaksiya allaqachon ishlatilgan",
            reason_code="duplicate_tx",
        )

    # 4. Agent + narx (server-side, frontend amount IGNORED)
    agent_result = await db.execute(select(Agent).where(Agent.id == ua.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    plan_type = (req.plan_type or ua.plan_type or "monthly").lower()
    if plan_type not in ("daily", "weekly", "monthly"):
        return TonVerifyResponse(
            activated=False, message="plan_type noto'g'ri", reason_code="invalid_plan",
        )

    price_uzs = _expected_uzs(agent, plan_type)
    if price_uzs <= 0:
        return TonVerifyResponse(
            activated=False, message="Bu tarif uchun narx belgilanmagan",
            reason_code="no_price",
        )

    expected_nano = _uzs_to_nano_ton(price_uzs)
    expected_comment = f"zai_pay:{req.user_agent_id}:{plan_type}"

    logger.info(
        f"TON verify start: user={user.telegram_id} ua={req.user_agent_id} "
        f"plan={plan_type} price_uzs={price_uzs} expected_nano={expected_nano} "
        f"tx={req.tx_hash[:12]}..."
    )

    # 5. Blockchain'da tekshirish
    ok, fail_reason, actual_nano = await _check_ton_transaction(
        tx_hash=req.tx_hash,
        expected_amount_nano=expected_nano,
        expected_comment=expected_comment,
    )

    if not ok:
        # Sanitized message — user'ga jaroyon detaillarini ko'rsatmaymiz
        user_msg_map = {
            "tx_not_found": "Tranzaksiya hali tasdiqlanmadi",
            "wrong_destination": "Tranzaksiya boshqa hamyonga yuborilgan",
            "insufficient_amount": "To'langan summa yetarli emas",
            "comment_mismatch": "Tranzaksiya izohi noto'g'ri",
            "ton_api_unavailable": "TON tarmog'i vaqtincha ishlamayapti, keyinroq urinib ko'ring",
            "ton_check_error": "Tranzaksiyani tekshirib bo'lmadi",
        }
        msg = user_msg_map.get(fail_reason or "", "Tranzaksiya tasdiqlanmadi")
        logger.warning(
            f"TON verify FAIL: ua={req.user_agent_id} tx={req.tx_hash[:12]}... "
            f"reason={fail_reason} actual_nano={actual_nano}"
        )
        return TonVerifyResponse(activated=False, message=msg, reason_code=fail_reason or "unknown")

    # 6. PaymentTransaction yozuvi (audit + duplicate protection)
    tx_record = PaymentTransaction(
        user_id=user.id,
        agent_id=ua.agent_id,
        amount=price_uzs,           # Sof UZS narx (legacy 'amount' maydoni)
        currency="TON",
        payment_method="tonconnect",
        tx_hash=req.tx_hash,
        status="completed",
        plan_type=plan_type,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(tx_record)

    # 7. UserAgent faollashtirish
    activated_ua = await _activate_user_agent(req.user_agent_id, plan_type, db)

    logger.info(
        f"TON verify OK: user={user.telegram_id} ua={req.user_agent_id} "
        f"plan={plan_type} tx={req.tx_hash[:12]}... actual_nano={actual_nano}"
    )

    return TonVerifyResponse(
        activated=True,
        message="To'lov tasdiqlandi! Agent faollashtirildi.",
        expires_at=activated_ua.expires_at.isoformat() if activated_ua.expires_at else None,
        reason_code="ok",
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

        # TO'G'RI: hmac.new(key=secret, msg=message, digestmod=...)
        expected_signature = hmac.new(
            key=secret.encode("utf-8"),
            msg=message.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, signature):
            logger.warning(
                f"Invalid webhook signature. "
                f"Expected: {expected_signature[:8]}..., Got: {signature[:8]}..."
            )
            raise HTTPException(status_code=401, detail="Invalid signature")

        payload = await request.json()
        logger.info(f"TON Webhook received (verified): {payload}")

        # YANGI XAVFSIZ FORMAT: zai_pay:{user_agent_id}:{plan_type}
        # Webhook biz emas, tashqi servis tomonidan yuborilsa-da, biz hech qachon
        # to'g'ridan-to'g'ri payload'ga ishonmaymiz — bu yerda asosiy ish
        # blockchain'ni qayta tekshirish (verify endpoint'idagi mantiq).
        # Webhook minimal vazifasi — bizga tx_hash kelganini xabar qilish.
        # Aktivatsiya FAQAT to'liq tekshirish keyin amalga oshiriladi.
        comment = (payload.get("comment", "") or "").strip()
        if not comment.startswith("zai_pay:"):
            return {"ok": True, "message": "Webhook qabul qilindi (tegishli emas)"}

        parts = comment.split(":")
        if len(parts) < 3:
            logger.warning(f"Webhook: comment format noto'g'ri: {comment!r}")
            return {"ok": False, "message": "Comment format noto'g'ri"}

        user_agent_id = parts[1]
        plan_type = parts[2] if len(parts) >= 3 else "monthly"
        if plan_type not in ("daily", "weekly", "monthly"):
            return {"ok": False, "message": "plan_type noto'g'ri"}

        tx_hash_webhook = payload.get("hash", "") or payload.get("tx_hash", "")
        if not tx_hash_webhook:
            return {"ok": False, "message": "tx_hash yo'q"}

        # 1. Replay protection
        tx_exists = await db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.tx_hash == tx_hash_webhook
            )
        )
        if tx_exists.scalar_one_or_none():
            logger.warning(f"Webhook: tx {tx_hash_webhook[:16]}... allaqachon ishlatilgan")
            return {"ok": False, "message": "Tranzaksiya allaqachon ishlatilgan"}

        # 2. UserAgent topish
        ua_result = await db.execute(select(UserAgent).where(UserAgent.id == user_agent_id))
        ua = ua_result.scalar_one_or_none()
        if not ua:
            logger.warning(f"Webhook: UserAgent {user_agent_id[:8]}... topilmadi")
            return {"ok": False, "message": "UserAgent topilmadi"}
        if ua.status == "active":
            return {"ok": True, "message": "UserAgent allaqachon faol"}

        # 3. Agent + server-side narx
        agent_result = await db.execute(select(Agent).where(Agent.id == ua.agent_id))
        agent = agent_result.scalar_one_or_none()
        if not agent:
            logger.warning(f"Webhook: Agent {ua.agent_id} topilmadi")
            return {"ok": False, "message": "Agent topilmadi"}

        price_uzs = _expected_uzs(agent, plan_type)
        if price_uzs <= 0:
            return {"ok": False, "message": "Narx belgilanmagan"}

        expected_nano = _uzs_to_nano_ton(price_uzs)
        expected_comment = f"zai_pay:{user_agent_id}:{plan_type}"

        # 4. Blockchain'da to'liq tekshirish — destination, amount, comment
        ok, fail_reason, actual_nano = await _check_ton_transaction(
            tx_hash=tx_hash_webhook,
            expected_amount_nano=expected_nano,
            expected_comment=expected_comment,
        )
        if not ok:
            logger.warning(
                f"Webhook: tx tekshiruv FAIL — reason={fail_reason} "
                f"ua={user_agent_id[:8]}... tx={tx_hash_webhook[:12]}..."
            )
            return {"ok": False, "message": f"Tranzaksiya tasdiqlanmadi: {fail_reason}"}

        # 5. Audit + aktivatsiya
        tx_record = PaymentTransaction(
            user_id=ua.user_id,
            agent_id=ua.agent_id,
            amount=price_uzs,
            currency="TON",
            payment_method="tonconnect_webhook",
            tx_hash=tx_hash_webhook,
            status="completed",
            plan_type=plan_type,
            completed_at=datetime.now(timezone.utc),
        )
        db.add(tx_record)
        await _activate_user_agent(user_agent_id, plan_type, db)

        logger.info(
            f"Webhook OK: ua={user_agent_id[:8]}... tx={tx_hash_webhook[:12]}... "
            f"plan={plan_type} actual_nano={actual_nano}"
        )
        return {"ok": True, "user_agent_id": user_agent_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TON Webhook xatosi: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================
# CLICK P2P — Manual Payment Flow (Admin Approval Required)
# ============================================================
#
# Bu oqim TON'dan farqli — backend AVTOMATIK aktivatsiya QILMAYDI.
# Foydalanuvchi Click P2P URL'ga o'tib qo'lda to'laydi, keyin admin tasdiqlaydi.
# Click rasmiy merchant API integratsiyasi YO'Q.
# ============================================================

from app.models import PaymentManual
from app.core.audit import log_audit


PLAN_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


class ClickQuoteRequest(BaseModel):
    user_agent_id: str
    plan_type: str = "monthly"  # daily | weekly | monthly


class ClickQuoteResponse(BaseModel):
    payment_method: str = "click_p2p"
    click_url: str
    receiver_name: str
    price_uzs: float
    agent_name: str
    plan_type: str
    instruction_text: str
    manual_payment_reference: str  # user_agent_id'dan olingan unikal kod


class ClickManualSubmitRequest(BaseModel):
    user_agent_id: str
    plan_type: str = "monthly"
    paid_amount_uzs: float | None = None
    payer_name: str | None = None
    payer_phone: str | None = None
    comment: str | None = None
    receipt_text: str | None = None
    screenshot_url: str | None = None


def _plan_price_uzs(agent: Agent, plan_type: str) -> float:
    """Server tomondan agent narxini DB'dan olish (frontend price'iga ishonmaymiz)."""
    plan_type = (plan_type or "monthly").lower()
    if plan_type == "daily":
        return float(agent.price_daily or 0)
    if plan_type == "weekly":
        return float(agent.price_weekly or 0)
    return float(agent.price_monthly or 0)  # default monthly


@router.post("/click/quote", response_model=ClickQuoteResponse)
async def click_quote(
    req: ClickQuoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Click P2P uchun price quote — narx server-side hisoblanadi."""
    cfg = _get_settings()
    if not cfg.click_payment_enabled:
        raise HTTPException(status_code=503, detail="Click to'lovi vaqtinchalik o'chirilgan")
    if not cfg.click_p2p_url:
        raise HTTPException(status_code=503, detail="Click P2P URL sozlanmagan")

    # 1. UserAgent foydalanuvchiga tegishli ekanini tekshirish
    ua_result = await db.execute(
        select(UserAgent).where(
            UserAgent.id == req.user_agent_id,
            UserAgent.user_id == user.id,
        )
    )
    ua = ua_result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="Sotib olish so'rovi topilmadi")

    # 2. Agent yuklash va narxni hisoblash
    agent_result = await db.execute(select(Agent).where(Agent.id == ua.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    plan_type = req.plan_type or ua.plan_type or "monthly"
    price_uzs = _plan_price_uzs(agent, plan_type)
    if price_uzs <= 0:
        raise HTTPException(status_code=400, detail="Bu tarif uchun narx belgilanmagan")

    instruction = (
        f"1. Quyidagi tugmani bosib Click P2P sahifasiga o'ting.\n"
        f"2. {int(price_uzs):,} so'm to'lang.\n"
        f"3. To'lov chekini saqlang.\n"
        f"4. Quyidagi formani to'ldiring: 'To'lov qildim, tekshiruvga yuborish'.\n"
        f"5. Admin tasdiqlagandan keyin agent darhol faollashadi."
    )

    return ClickQuoteResponse(
        payment_method="click_p2p",
        click_url=cfg.click_p2p_url,
        receiver_name=cfg.click_receiver_name or "ZAI",
        price_uzs=price_uzs,
        agent_name=agent.name,
        plan_type=plan_type,
        instruction_text=instruction,
        manual_payment_reference=req.user_agent_id[:8],
    )


@router.post("/click/manual-submit")
async def click_manual_submit(
    req: ClickManualSubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Click P2P qo'lda to'lov so'rovini yaratish.
    UserAgent FAOLLASHTIRILMAYDI — admin tasdig'ini kutadi.
    """
    cfg = _get_settings()
    if not cfg.click_payment_enabled:
        raise HTTPException(status_code=503, detail="Click to'lovi vaqtinchalik o'chirilgan")

    # 1. UserAgent ownership tekshirish
    ua_result = await db.execute(
        select(UserAgent).where(
            UserAgent.id == req.user_agent_id,
            UserAgent.user_id == user.id,
        )
    )
    ua = ua_result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="Sotib olish so'rovi topilmadi")

    if ua.status == "active":
        raise HTTPException(status_code=400, detail="Bu agent allaqachon faol")
    if ua.status not in ("pending", "expired", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Status='{ua.status}' uchun to'lov yaratish mumkin emas")

    # 2. Agent yuklash + server-side narx
    agent_result = await db.execute(select(Agent).where(Agent.id == ua.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent topilmadi")

    plan_type = req.plan_type or ua.plan_type or "monthly"
    expected_uzs = _plan_price_uzs(agent, plan_type)
    if expected_uzs <= 0:
        raise HTTPException(status_code=400, detail="Bu tarif uchun narx belgilanmagan")

    # 3. Duplicate himoyasi — bu user_agent uchun pending Click submission bormi?
    existing = await db.execute(
        select(PaymentManual).where(
            PaymentManual.user_id == user.id,
            PaymentManual.user_agent_id == req.user_agent_id,
            PaymentManual.payment_method == "click_p2p",
            PaymentManual.status == "pending",
        )
    )
    existing_payment = existing.scalars().first()
    if existing_payment:
        return {
            "message": "Sizning oldingi to'lov so'rovingiz allaqachon admin tasdig'ini kutmoqda.",
            "payment_id": existing_payment.id,
            "status": existing_payment.status,
            "duplicate": True,
            "expected_amount": float(existing_payment.expected_amount or 0),
        }

    # 4. PaymentManual yaratish
    payment = PaymentManual(
        user_id=user.id,
        user_agent_id=req.user_agent_id,
        agent_id=ua.agent_id,
        plan=plan_type,
        amount=expected_uzs,  # Legacy 'amount' = expected_amount
        expected_amount=expected_uzs,
        submitted_amount=req.paid_amount_uzs,
        payment_method="click_p2p",
        status="pending",
        payer_name=(req.payer_name or "")[:255] or None,
        payer_phone=(req.payer_phone or "")[:50] or None,
        comment=(req.comment or "")[:2000] or None,
        receipt_text=(req.receipt_text or "")[:2000] or None,
        screenshot_url=(req.screenshot_url or "")[:500] or None,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    logger.info(
        f"click_manual_submit: user_id={user.id} user_agent_id={req.user_agent_id} "
        f"agent_slug={agent.slug} plan={plan_type} expected={int(expected_uzs)}"
    )

    return {
        "message": "To'lov so'rovingiz adminga yuborildi. Tasdiqlangandan keyin agent faollashadi.",
        "payment_id": payment.id,
        "status": payment.status,
        "expected_amount": expected_uzs,
        "duplicate": False,
    }


# ============================================================
# Admin: Manual Payments listing + approve/reject
# ============================================================
from app.api.deps import require_admin


class ManualPaymentItem(BaseModel):
    id: str
    user_id: str
    user_telegram_id: int | None = None
    user_first_name: str | None = None
    user_username: str | None = None
    user_agent_id: str | None = None
    agent_id: str | None = None
    agent_slug: str | None = None
    agent_name: str | None = None
    plan: str
    payment_method: str
    status: str
    expected_amount: float | None = None
    submitted_amount: float | None = None
    amount: float
    payer_name: str | None = None
    payer_phone: str | None = None
    comment: str | None = None
    receipt_text: str | None = None
    screenshot_url: str | None = None
    admin_note: str | None = None
    created_at: str | None = None
    confirmed_at: str | None = None


@router.get("/admin/manual", response_model=list[ManualPaymentItem])
async def admin_list_manual_payments(
    status: str | None = None,
    payment_method: str | None = None,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: barcha qo'lda kiritilgan to'lovlarni ko'rish (default: pending Click)."""
    safe_limit = min(max(limit, 1), 200)

    query = (
        select(PaymentManual, User, Agent)
        .join(User, PaymentManual.user_id == User.id)
        .join(Agent, PaymentManual.agent_id == Agent.id, isouter=True)
        .order_by(PaymentManual.created_at.desc())
        .limit(safe_limit)
    )
    if status:
        query = query.where(PaymentManual.status == status)
    if payment_method:
        query = query.where(PaymentManual.payment_method == payment_method)

    result = await db.execute(query)
    items: list[ManualPaymentItem] = []
    for pm, u, ag in result.all():
        items.append(ManualPaymentItem(
            id=pm.id,
            user_id=pm.user_id,
            user_telegram_id=u.telegram_id if u else None,
            user_first_name=u.first_name if u else None,
            user_username=u.username if u else None,
            user_agent_id=pm.user_agent_id,
            agent_id=pm.agent_id,
            agent_slug=ag.slug if ag else None,
            agent_name=ag.name if ag else None,
            plan=pm.plan,
            payment_method=pm.payment_method,
            status=pm.status,
            expected_amount=pm.expected_amount,
            submitted_amount=pm.submitted_amount,
            amount=pm.amount,
            payer_name=pm.payer_name,
            payer_phone=pm.payer_phone,
            comment=pm.comment,
            receipt_text=pm.receipt_text,
            screenshot_url=pm.screenshot_url,
            admin_note=pm.admin_note,
            created_at=pm.created_at.isoformat() if pm.created_at else None,
            confirmed_at=pm.confirmed_at.isoformat() if pm.confirmed_at else None,
        ))
    return items


class ApproveRequest(BaseModel):
    admin_note: str | None = None


class RejectRequest(BaseModel):
    reason: str | None = None


@router.post("/admin/manual/{payment_id}/approve")
async def admin_approve_manual_payment(
    payment_id: str,
    req: ApproveRequest | None = None,
    request: Request = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin manual to'lovni tasdiqlaydi va UserAgent'ni faollashtiradi."""
    pm_result = await db.execute(select(PaymentManual).where(PaymentManual.id == payment_id))
    payment = pm_result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="To'lov topilmadi")
    if payment.status != "pending":
        raise HTTPException(status_code=400, detail=f"To'lov holati '{payment.status}' — qayta amal qilish mumkin emas")
    if not payment.user_agent_id:
        raise HTTPException(status_code=400, detail="Bu to'lov UserAgent bilan bog'lanmagan")

    # UserAgent faollashtirish
    ua_result = await db.execute(select(UserAgent).where(UserAgent.id == payment.user_agent_id))
    ua = ua_result.scalar_one_or_none()
    if not ua:
        raise HTTPException(status_code=404, detail="UserAgent topilmadi")

    now = datetime.now(timezone.utc)
    ua.status = "active"
    ua.started_at = now
    ua.expires_at = now + timedelta(days=PLAN_DAYS.get(payment.plan, 30))
    ua.tasks_used_today = 0
    ua.tokens_used_today = 0

    payment.status = "approved"
    payment.confirmed_by = admin.id
    payment.confirmed_at = now
    if req and req.admin_note:
        payment.admin_note = req.admin_note[:1000]

    # Audit yozuvlari (PaymentTransaction + AuditLog)
    tx_record = PaymentTransaction(
        user_id=payment.user_id,
        agent_id=payment.agent_id,
        amount=payment.expected_amount or payment.amount,
        currency="UZS",
        payment_method=payment.payment_method or "click_p2p",
        tx_hash=None,
        status="completed",
        plan_type=payment.plan,
        admin_note=f"Manual approve by admin {admin.id}",
        completed_at=now,
    )
    db.add(tx_record)
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="approve_manual_payment",
        target_type="payment_manual",
        target_id=payment.id,
        payload={
            "user_id": payment.user_id,
            "user_agent_id": payment.user_agent_id,
            "plan": payment.plan,
            "amount": float(payment.expected_amount or payment.amount),
            "method": payment.payment_method,
        },
        request=request,
    )

    logger.info(
        f"approve_manual_payment: admin={admin.id} payment_id={payment_id} "
        f"user_agent_id={payment.user_agent_id} method={payment.payment_method}"
    )

    return {
        "message": "To'lov tasdiqlandi va agent faollashtirildi",
        "payment_id": payment.id,
        "user_agent_id": ua.id,
        "expires_at": ua.expires_at.isoformat() if ua.expires_at else None,
    }


@router.post("/admin/manual/{payment_id}/reject")
async def admin_reject_manual_payment(
    payment_id: str,
    req: RejectRequest | None = None,
    request: Request = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin manual to'lovni rad etadi. UserAgent o'zgartirilmaydi."""
    pm_result = await db.execute(select(PaymentManual).where(PaymentManual.id == payment_id))
    payment = pm_result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="To'lov topilmadi")
    if payment.status != "pending":
        raise HTTPException(status_code=400, detail=f"To'lov holati '{payment.status}' — qayta amal qilish mumkin emas")

    payment.status = "rejected"
    payment.confirmed_by = admin.id
    payment.confirmed_at = datetime.now(timezone.utc)
    if req and req.reason:
        payment.admin_note = req.reason[:1000]
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="reject_manual_payment",
        target_type="payment_manual",
        target_id=payment.id,
        payload={
            "user_id": payment.user_id,
            "user_agent_id": payment.user_agent_id,
            "reason": (req.reason if req else None) or "no reason provided",
        },
        request=request,
    )

    logger.info(
        f"reject_manual_payment: admin={admin.id} payment_id={payment_id} "
        f"reason={(req.reason if req else None)!r}"
    )

    return {"message": "To'lov rad etildi", "payment_id": payment.id}


@router.get("/click/config")
async def click_payment_config():
    """Frontend uchun Click sozlamalari (yoqilgan/o'chirilgan, URL, receiver)."""
    cfg = _get_settings()
    return {
        "enabled": cfg.click_payment_enabled and bool(cfg.click_p2p_url),
        "click_url": cfg.click_p2p_url if cfg.click_payment_enabled else "",
        "receiver_name": cfg.click_receiver_name or "ZAI",
    }


@router.get("/ton/config")
async def ton_payment_config():
    """Frontend uchun TON sozlamalari — wallet va network."""
    cfg = _get_settings()
    return {
        "enabled": cfg.ton_payment_enabled and bool(cfg.ton_wallet_address),
        "wallet_address": cfg.ton_wallet_address if cfg.ton_payment_enabled else "",
        "network": "testnet" if cfg.ton_testnet_mode else "mainnet",
    }


# ============================================================
# Receipt/Check Image Upload
# ============================================================
import os
import uuid as _uuid
from fastapi import UploadFile, File


UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "receipts")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/receipt/upload")
async def upload_receipt(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Foydalanuvchi to'lov cheki rasmini yuklaydi. URL qaytaradi."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Fayl nomi yo'q")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Faqat rasm fayllari qabul qilinadi: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fayl hajmi 10 MB dan oshmasligi kerak")

    filename = f"{_uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    # URL: /static/receipts/{filename}
    url = f"/static/receipts/{filename}"
    logger.info(f"receipt_upload: user={user.id} file={filename} size={len(content)}")
    return {"url": url, "filename": filename}


# ============================================================
# Admin: Cancel all pending payments for a user
# ============================================================

class CancelAllPendingRequest(BaseModel):
    user_id: str
    reason: str | None = None


@router.post("/admin/manual/cancel-all-pending")
async def admin_cancel_all_pending(
    req: CancelAllPendingRequest,
    request: Request = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Shu userId bo'yicha barcha pending payment_manual yozuvlarini bekor qilish.
    Oldin approved bo'lgan obunalar o'chirilmaydi — faqat pending requestlar."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PaymentManual).where(
            PaymentManual.user_id == req.user_id,
            PaymentManual.status == "pending",
        )
    )
    pending_payments = result.scalars().all()
    if not pending_payments:
        return {"message": "Pending to'lovlar topilmadi", "cancelled_count": 0}

    cancelled_count = 0
    for pm in pending_payments:
        pm.status = "cancelled"
        pm.admin_note = req.reason or "Admin tomonidan bekor qilindi"
        pm.confirmed_by = admin.id
        pm.confirmed_at = now
        cancelled_count += 1

    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="cancel_all_pending_payments",
        target_type="user",
        target_id=req.user_id,
        payload={"cancelled_count": cancelled_count, "reason": req.reason},
        request=request,
    )

    logger.info(
        f"cancel_all_pending: admin={admin.id} user={req.user_id} "
        f"cancelled={cancelled_count} reason={req.reason!r}"
    )

    return {
        "message": f"{cancelled_count} ta pending to'lov bekor qilindi",
        "cancelled_count": cancelled_count,
    }


# ============================================================
# Admin: Approve payment to a DIFFERENT agent
# ============================================================

class ApproveToAgentRequest(BaseModel):
    target_agent_id: str
    admin_note: str | None = None


@router.post("/admin/manual/{payment_id}/approve-to-agent")
async def admin_approve_to_different_agent(
    payment_id: str,
    req: ApproveToAgentRequest,
    request: Request = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin to'lovni boshqa agentga faollashtiradi.
    Mavjud UserAgent'ni yangilash o'rniga yangi UserAgent yaratadi."""
    pm_result = await db.execute(select(PaymentManual).where(PaymentManual.id == payment_id))
    payment = pm_result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="To'lov topilmadi")
    if payment.status != "pending":
        raise HTTPException(status_code=400, detail=f"To'lov holati '{payment.status}' — qayta amal qilish mumkin emas")

    # Target agent mavjudligini tekshirish
    agent_result = await db.execute(select(Agent).where(Agent.id == req.target_agent_id, Agent.is_active == True))
    target_agent = agent_result.scalar_one_or_none()
    if not target_agent:
        raise HTTPException(status_code=404, detail="Tanlangan agent topilmadi yoki faol emas")

    now = datetime.now(timezone.utc)

    # Agar mavjud user_agent_id bo'lsa — uni cancelled qilamiz
    if payment.user_agent_id:
        old_ua_result = await db.execute(select(UserAgent).where(UserAgent.id == payment.user_agent_id))
        old_ua = old_ua_result.scalar_one_or_none()
        if old_ua and old_ua.status == "pending":
            old_ua.status = "cancelled"

    # Yangi UserAgent yaratish (target agent uchun)
    new_ua = UserAgent(
        user_id=payment.user_id,
        agent_id=req.target_agent_id,
        status="active",
        plan_type=payment.plan,
        started_at=now,
        expires_at=now + timedelta(days=PLAN_DAYS.get(payment.plan, 30)),
        tasks_used_today=0,
        tokens_used_today=0,
    )
    db.add(new_ua)

    # Payment yangilash
    payment.status = "approved"
    payment.agent_id = req.target_agent_id
    payment.user_agent_id = new_ua.id
    payment.confirmed_by = admin.id
    payment.confirmed_at = now
    if req.admin_note:
        payment.admin_note = req.admin_note[:1000]

    # PaymentTransaction audit
    tx_record = PaymentTransaction(
        user_id=payment.user_id,
        agent_id=req.target_agent_id,
        amount=payment.expected_amount or payment.amount,
        currency="UZS",
        payment_method=payment.payment_method or "click_p2p",
        tx_hash=None,
        status="completed",
        plan_type=payment.plan,
        admin_note=f"Approve to different agent ({target_agent.slug}) by admin {admin.id}",
        completed_at=now,
    )
    db.add(tx_record)
    await db.commit()

    await log_audit(
        admin_id=admin.id,
        action="approve_to_different_agent",
        target_type="payment_manual",
        target_id=payment.id,
        payload={
            "user_id": payment.user_id,
            "original_agent_id": payment.agent_id,
            "target_agent_id": req.target_agent_id,
            "target_agent_slug": target_agent.slug,
            "plan": payment.plan,
        },
        request=request,
    )

    logger.info(
        f"approve_to_different_agent: admin={admin.id} payment={payment_id} "
        f"target_agent={target_agent.slug} user={payment.user_id}"
    )

    return {
        "message": f"To'lov tasdiqlandi va {target_agent.name} agenti faollashtirildi",
        "payment_id": payment.id,
        "user_agent_id": new_ua.id,
        "target_agent": target_agent.slug,
        "expires_at": new_ua.expires_at.isoformat() if new_ua.expires_at else None,
    }
