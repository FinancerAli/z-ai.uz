"""ZAI Platform — Database Models (v2 — Agent System)"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, Integer, Text, Boolean, DateTime, Float, BigInteger, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# ============================================================
#  USERS & SUBSCRIPTIONS
# ============================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=True)
    last_name: Mapped[str] = mapped_column(String(255), nullable=True)
    language_code: Mapped[str] = mapped_column(String(10), default="uz")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    balance: Mapped[float] = mapped_column(Float, default=0.0)  # so'm

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    write_access_granted: Mapped[bool] = mapped_column(Boolean, default=False)
    blocked_reason: Mapped[str] = mapped_column(Text, nullable=True)
    blocked_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    # Relationships
    brand_profiles = relationship("BrandProfile", back_populates="user", cascade="all, delete-orphan")
    content_drafts = relationship("ContentDraft", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    usage_logs = relationship("UsageLog", back_populates="user", cascade="all, delete-orphan")
    user_agents = relationship("UserAgent", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    plan: Mapped[str] = mapped_column(String(50), default="free_beta")  # free_beta, starter, pro, business
    status: Mapped[str] = mapped_column(String(50), default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    monthly_limit: Mapped[int] = mapped_column(Integer, default=50)
    used_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="subscriptions")


# ============================================================
#  AGENT SYSTEM (NEW)
# ============================================================

class Agent(Base):
    """Agent Store — har bir agentning definitsiyasi."""
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # "smm-content"
    name: Mapped[str] = mapped_column(String(255))  # "SMM Content Agent"
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100))  # marketing, finance, education, health
    icon: Mapped[str] = mapped_column(String(10), default="🤖")
    capabilities: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    input_schema: Mapped[str] = mapped_column(Text, default="{}")  # JSON form schema

    # Prompt
    system_prompt: Mapped[str] = mapped_column(Text)
    welcome_message: Mapped[str] = mapped_column(Text, default="Salom! Qanday yordam bera olaman?")

    # Narxlar (so'm)
    price_daily: Mapped[float] = mapped_column(Float, default=0)
    price_weekly: Mapped[float] = mapped_column(Float, default=0)
    price_monthly: Mapped[float] = mapped_column(Float, default=199000)

    # Limitlar
    max_tokens_per_task: Mapped[int] = mapped_column(Integer, default=2000)
    daily_limit: Mapped[int] = mapped_column(Integer, default=30)
    supports_multi_turn: Mapped[bool] = mapped_column(Boolean, default=False)

    # Model settings
    ai_model: Mapped[str] = mapped_column(String(100), default="deepseek-chat")
    temperature: Mapped[float] = mapped_column(Float, default=0.85)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Origin marker — agent qayerdan kelgan.
    # "seed"     — startup paytida AGENTS_SEED registry'dan yaratilgan default agentlar
    # "admin"    — admin panel orqali yaratilgan (default)
    # "creator"  — kelajakdagi creator economy uchun zaxira
    # "imported" — boshqa platforma yoki marketplace'dan import qilingan
    # seed_agents() FAQAT source="seed" bo'lgan yozuvlarni boshqaradi.
    source: Mapped[str] = mapped_column(String(20), default="admin", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user_agents = relationship("UserAgent", back_populates="agent")
    tasks = relationship("Task", back_populates="agent")
    agent_skills = relationship("AgentSkill", back_populates="agent", cascade="all, delete-orphan")


class AgentSkill(Base):
    """Agent uchun qo'shimcha skill/kontekst."""
    __tablename__ = "agent_skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)  # skill konteksti (business_types va h.k.)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    agent = relationship("Agent", back_populates="agent_skills")


class UserAgent(Base):
    """Foydalanuvchi qaysi agentni sotib olgan."""
    __tablename__ = "user_agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), index=True)
    status: Mapped[str] = mapped_column(String(50), default="active")  # pending, active, expired, cancelled
    plan_type: Mapped[str] = mapped_column(String(20), default="monthly")  # daily, weekly, monthly

    tasks_used_today: Mapped[int] = mapped_column(Integer, default=0)
    tokens_used_today: Mapped[int] = mapped_column(Integer, default=0)
    last_reset_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="user_agents")
    agent = relationship("Agent", back_populates="user_agents")


class Task(Base):
    """Foydalanuvchi bergan topshiriq."""
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), index=True)

    input_text: Mapped[str] = mapped_column(Text)
    output_text: Mapped[str] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="queued")  # queued, running, completed, failed
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.0)

    # Metadata
    context_data: Mapped[str] = mapped_column(Text, nullable=True)  # JSON: qo'shimcha parametrlar

    # RLHF Feedback (Admin / Foydalanuvchi baholashi)
    feedback_rating: Mapped[str] = mapped_column(String(20), nullable=True)   # good | bad | redo
    feedback_comment: Mapped[str] = mapped_column(Text, nullable=True)
    feedback_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="tasks")
    agent = relationship("Agent", back_populates="tasks")


# ============================================================
#  EXISTING MODELS (BRAND, CONTENT, USAGE, PAYMENT, FEEDBACK)
# ============================================================

class BrandProfile(Base):
    __tablename__ = "brand_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    business_name: Mapped[str] = mapped_column(String(255))
    industry: Mapped[str] = mapped_column(String(255))
    location: Mapped[str] = mapped_column(String(255), nullable=True)
    target_audience: Mapped[str] = mapped_column(Text)
    products_services: Mapped[str] = mapped_column(Text)
    price_range: Mapped[str] = mapped_column(String(255), nullable=True)
    unique_selling_points: Mapped[str] = mapped_column(Text, nullable=True)
    brand_tone: Mapped[str] = mapped_column(String(100))
    main_cta: Mapped[str] = mapped_column(Text)
    social_links: Mapped[str] = mapped_column(Text, nullable=True)
    banned_words: Mapped[str] = mapped_column(Text, nullable=True)
    preferred_phrases: Mapped[str] = mapped_column(Text, nullable=True)
    additional_context: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="brand_profiles")
    content_drafts = relationship("ContentDraft", back_populates="brand_profile")


class ContentDraft(Base):
    __tablename__ = "content_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    brand_profile_id: Mapped[str] = mapped_column(String(36), ForeignKey("brand_profiles.id"), nullable=True)
    topic: Mapped[str] = mapped_column(Text)
    platform: Mapped[str] = mapped_column(String(50))
    content_type: Mapped[str] = mapped_column(String(100))
    language: Mapped[str] = mapped_column(String(50))
    tone: Mapped[str] = mapped_column(String(100))
    additional_instruction: Mapped[str] = mapped_column(Text, nullable=True)
    raw_output: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="content_drafts")
    brand_profile = relationship("BrandProfile", back_populates="content_drafts")
    variants = relationship("ContentVariant", back_populates="content_draft", cascade="all, delete-orphan")


class ContentVariant(Base):
    __tablename__ = "content_variants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    content_draft_id: Mapped[str] = mapped_column(String(36), ForeignKey("content_drafts.id"), index=True)
    variant_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    hook: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    cta: Mapped[str] = mapped_column(Text)
    hashtags: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    content_draft = relationship("ContentDraft", back_populates="variants")


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    action_type: Mapped[str] = mapped_column(String(100))
    content_draft_id: Mapped[str] = mapped_column(String(36), ForeignKey("content_drafts.id"), nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="success")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="usage_logs")


class PaymentManual(Base):
    __tablename__ = "payments_manual"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    plan: Mapped[str] = mapped_column(String(50))
    amount: Mapped[float] = mapped_column(Float)
    payment_method: Mapped[str] = mapped_column(String(100))
    proof_file_id: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, confirmed, rejected
    admin_note: Mapped[str] = mapped_column(Text, nullable=True)
    confirmed_by: Mapped[str] = mapped_column(String(36), nullable=True)

    # YANGI: agent va user_agent bilan bog'lash (Click P2P uchun)
    agent_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("agents.id"), nullable=True, index=True)
    user_agent_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("user_agents.id"), nullable=True, index=True)

    # Server tomondan hisoblangan kutilayotgan summa (UZS)
    expected_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Foydalanuvchi yuborgan summa (UZS) — fraud detection uchun
    submitted_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Ixtiyoriy foydalanuvchi ma'lumotlari
    payer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payer_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    receipt_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    screenshot_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)


class PaymentTransaction(Base):
    """Barcha to'lovlar (kripto, karta, manual) uchun yagona audit jadvali."""
    __tablename__ = "payment_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), index=True, nullable=True)
    
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(20))  # TON, USDT, UZS
    payment_method: Mapped[str] = mapped_column(String(50))  # tonconnect, manual, click, payme
    tx_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=True)
    
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, completed, failed, rejected
    plan_type: Mapped[str] = mapped_column(String(50))  # daily, weekly, monthly
    admin_note: Mapped[str] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    agent = relationship("Agent", foreign_keys=[agent_id])


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(Text)
    rating: Mapped[int] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(50))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    """Admin amallarini qayd etish."""
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    target_type: Mapped[str] = mapped_column(String(50))
    target_id: Mapped[str] = mapped_column(String(36), nullable=True)
    payload: Mapped[str] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class AnalyticsEvent(Base):
    """Mahsulot analitikasi uchun event log (E4)."""
    __tablename__ = "analytics_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    event_name: Mapped[str] = mapped_column(String(64), index=True)  # agent_viewed, content_generated, ...
    properties: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string (max 4KB)
    platform: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # tdesktop, ios, android, web
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


# ============================================================
#  HUMO AVTO P2P PAYMENT (NEW — @humocardbot orqali)
# ============================================================
#
# Mexanizm:
#   1. User HUMO Avto tugmasini bosadi -> POST /humo/quote
#   2. Backend HumoOrder yaratadi (base_amount + collision avoidance "+1 so'm")
#   3. Frontend karta + summa + 10-min countdown ko'rsatadi
#   4. User HUMO/UzCard kartaga shu summani yuboradi
#   5. Bank @humocardbot orqali Telegram'ga xabar yuboradi
#   6. Telethon listener xabarni ushlaydi -> POST /humo/webhook
#   7. SmsLog yaratiladi, parser summa va karta maskini ajratadi
#   8. Order matching engine pending order topadi (amount + 10-min window)
#   9. UserAgent faollashadi, user'ga Telegram notification


class HumoOrder(Base):
    """
    HUMO Avto to'lov uchun pending order.

    Lifecycle:
        pending -> paid (SMS muvaffaqiyatli match)
        pending -> expired (TTL 10 min)
        pending -> cancelled (user qo'lda bekor qildi)
        pending -> manual_review (SMS keldi, lekin auto-match ishlamadi)
    """
    __tablename__ = "humo_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    user_agent_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("user_agents.id"), nullable=True, index=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("agents.id"), nullable=True)

    # Tarif
    plan: Mapped[str] = mapped_column(String(20), default="monthly")  # daily | weekly | monthly

    # Summalar
    base_amount: Mapped[float] = mapped_column(Float)        # Toza narx (DB'dan)
    expected_amount: Mapped[float] = mapped_column(Float, index=True)  # base + extra_sum (collision uchun)
    extra_sum: Mapped[float] = mapped_column(Float, default=0)  # +0..+99 so'm (collision avoid)

    # Karta
    card_mask: Mapped[str] = mapped_column(String(50))  # "VISA *8286"
    card_holder_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    # pending | paid | expired | cancelled | manual_review

    # SMS bog'lanish (paid bo'lgach to'ldiriladi)
    sms_log_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sms_logs.id"), nullable=True)

    # Vaqtlar
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class SmsLog(Base):
    """
    Bank SMS xabarlari log'i.

    @humocardbot dan kelgan barcha xabarlar shu yerga yoziladi (parse qilinishidan
    qat'iy nazar). Bu — audit trail + reconciliation uchun manba.
    """
    __tablename__ = "sms_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Telethon source
    sms_external_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # tg msg id
    from_chat: Mapped[str] = mapped_column(String(100))  # bot username (@humocardbot)
    raw_text: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime, index=True)

    # Parse natijasi
    transaction_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # topup | operation | payment
    parsed_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True, index=True)
    parsed_card: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    parsed_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # "BEEPUL P2P>TASHKENT"
    parsed_balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    parsed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Match natijasi
    status: Mapped[str] = mapped_column(String(30), default="received", index=True)
    # received | unparseable | filtered (boshqa karta yoki outgoing) |
    # matched | no_match | manual_match
    matched_order_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("humo_orders.id"), nullable=True)
    matched_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # auto | admin user_id
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class AppSetting(Base):
    """
    Key/value sozlamalar (admin panel orqali boshqarilishi mumkin).

    Maqsad:
      - TON_UZS_RATE manual override
      - HUMO Avto enable/disable
      - SMS forwarder secret rotation
      - va h.k.
    """
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
