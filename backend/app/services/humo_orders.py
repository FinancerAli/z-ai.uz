"""
HUMO Avto P2P — order matching engine.

Vazifa:
  1. create_humo_order — yangi pending order yaratish (collision avoidance)
  2. match_sms_to_order — kelgan SMS bo'yicha pending order topish
  3. mark_order_paid    — match topilsa, UserAgent'ni faollashtirish
  4. expire_stale_orders — TTL o'tgan order'larni 'expired' qilish
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    HumoOrder,
    SmsLog,
    UserAgent,
    Agent,
    PaymentTransaction,
    User,
)


# ────────────────────────────────────────────────────────────────
#  ORDER CREATION
# ────────────────────────────────────────────────────────────────


async def find_unique_amount(
    db: AsyncSession,
    base_amount: float,
    max_offset: int,
    window_minutes: int,
) -> tuple[float, float]:
    """
    "+1 so'm" collision avoidance:
      Bir vaqtda pending bo'lgan order'lar bilan to'qnashmaydigan
      eng kichik summani topadi.

    Returns:
        (final_amount, extra_sum)
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)

    # Bir so'rovda barcha mavjud pending summa'larni olamiz
    result = await db.execute(
        select(HumoOrder.expected_amount).where(
            and_(
                HumoOrder.status == "pending",
                HumoOrder.created_at >= cutoff,
            )
        )
    )
    busy = {round(float(r), 2) for r in result.scalars().all()}

    base = round(float(base_amount), 2)
    for offset in range(0, max_offset + 1):
        candidate = round(base + offset, 2)
        if candidate not in busy:
            return candidate, float(offset)

    # Hech bir bo'sh slot topilmadi — base'ni qaytaramiz
    # (matching admin reconciliation orqali bo'ladi)
    return base, 0.0


async def create_humo_order(
    db: AsyncSession,
    user: User,
    agent: Agent,
    plan: str,                          # daily | weekly | monthly
    base_amount: float,
    card_mask: str,
    card_holder_name: Optional[str],
    ttl_minutes: int = 10,
    collision_max_offset: int = 99,
) -> HumoOrder:
    """Yangi pending HUMO order yaratadi (collision avoidance bilan)."""
    final_amount, extra = await find_unique_amount(
        db,
        base_amount=base_amount,
        max_offset=collision_max_offset,
        window_minutes=ttl_minutes,
    )

    now = datetime.now(timezone.utc)
    order = HumoOrder(
        user_id=user.id,
        agent_id=agent.id,
        plan=plan,
        base_amount=float(base_amount),
        expected_amount=final_amount,
        extra_sum=extra,
        card_mask=card_mask,
        card_holder_name=card_holder_name,
        status="pending",
        expires_at=now + timedelta(minutes=ttl_minutes),
        created_at=now,
    )
    db.add(order)
    await db.flush()
    return order


# ────────────────────────────────────────────────────────────────
#  ORDER MATCHING
# ────────────────────────────────────────────────────────────────


async def match_sms_to_order(
    db: AsyncSession,
    parsed_amount: float,
    received_at: datetime,
    window_minutes: int = 10,
) -> Optional[HumoOrder]:
    """
    SMS summasiga mos pending order topadi.

    Strategiya:
      - status='pending'
      - expected_amount = parsed_amount (aniq match)
      - created_at < received_at < expires_at + 5min (kichik tolerance)
      - Bir nechta topilsa — eng eski (FIFO)
    """
    # Bank xabari kechikishi mumkin (5-10 min normal)
    # Shuning uchun "expires_at" dan 5 min keyin kelgan SMS ham match qilamiz
    earliest = received_at - timedelta(minutes=window_minutes + 5)

    result = await db.execute(
        select(HumoOrder)
        .where(
            and_(
                HumoOrder.status == "pending",
                HumoOrder.expected_amount == round(parsed_amount, 2),
                HumoOrder.created_at >= earliest,
            )
        )
        .order_by(HumoOrder.created_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


# ────────────────────────────────────────────────────────────────
#  PAYMENT CONFIRMATION
# ────────────────────────────────────────────────────────────────


def _plan_duration_days(plan: str) -> int:
    return {"daily": 1, "weekly": 7, "monthly": 30}.get(plan, 30)


async def mark_order_paid(
    db: AsyncSession,
    order: HumoOrder,
    sms_log: SmsLog,
) -> UserAgent:
    """
    Order'ni 'paid' deb belgilaydi va UserAgent'ni faollashtiradi.

    Idempotent: agar UserAgent allaqachon bor bo'lsa, expires_at'ni uzaytiradi.
    """
    now = datetime.now(timezone.utc)

    # 1. UserAgent (mavjud bo'lsa uzaytiramiz, yo'q bo'lsa yangidan)
    duration = _plan_duration_days(order.plan)

    ua_q = await db.execute(
        select(UserAgent).where(
            and_(
                UserAgent.user_id == order.user_id,
                UserAgent.agent_id == order.agent_id,
            )
        )
    )
    ua = ua_q.scalar_one_or_none()

    if ua:
        # Mavjud sub: agar muddati o'tmagan bo'lsa, uning ustiga qo'shamiz
        base = ua.expires_at if (ua.expires_at and ua.expires_at > now) else now
        ua.expires_at = base + timedelta(days=duration)
        ua.status = "active"
        ua.plan_type = order.plan
    else:
        ua = UserAgent(
            user_id=order.user_id,
            agent_id=order.agent_id,
            status="active",
            plan_type=order.plan,
            started_at=now,
            expires_at=now + timedelta(days=duration),
        )
        db.add(ua)
        await db.flush()

    # 2. Order'ni paid qilamiz
    order.user_agent_id = ua.id
    order.status = "paid"
    order.paid_at = now
    order.sms_log_id = sms_log.id

    # 3. Audit transaction
    pt = PaymentTransaction(
        user_id=order.user_id,
        agent_id=order.agent_id,
        amount=order.expected_amount,
        currency="UZS",
        payment_method="humo_avto",
        tx_hash=f"humo:{order.id}",  # idempotency uchun
        status="completed",
        plan_type=order.plan,
        completed_at=now,
    )
    db.add(pt)

    await db.flush()
    return ua


# ────────────────────────────────────────────────────────────────
#  HOUSEKEEPING
# ────────────────────────────────────────────────────────────────


async def expire_stale_orders(db: AsyncSession) -> int:
    """
    TTL o'tgan pending order'larni 'expired' qiladi.
    Cron yoki startup hook orqali chaqiriladi.

    Returns:
        Expired qilingan order soni
    """
    now = datetime.now(timezone.utc)
    res = await db.execute(
        update(HumoOrder)
        .where(
            and_(
                HumoOrder.status == "pending",
                HumoOrder.expires_at < now,
            )
        )
        .values(status="expired")
    )
    return res.rowcount or 0
