"""ZAI Platform — Database Setup (SQLite for dev, PostgreSQL for prod)"""
import logging

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import inspect, select, text
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


from alembic import command
from alembic.config import Config as AlembicConfig

async def init_db():
    """Run Alembic migrations automatically on startup."""
    def run_migrations(connection, cfg):
        cfg.attributes["connection"] = connection
        
        # Check if tables exist but alembic_version doesn't
        inspector = inspect(connection)
        tables = inspector.get_table_names()
        
        if "users" in tables and "alembic_version" not in tables:
            # Existing database without alembic. Stamp it as baseline!
            import logging
            logging.getLogger(__name__).info("Stamping existing database with alembic head...")
            command.stamp(cfg, "head")
            
        # Upgrade to head
        command.upgrade(cfg, "head")

    async with engine.begin() as conn:
        alembic_cfg = AlembicConfig("alembic.ini")
        # Ensure we run from the correct directory so alembic.ini finds the scripts
        import os
        alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
        await conn.run_sync(run_migrations, alembic_cfg)


async def _ensure_agent_source_column():
    """
    SQLite uchun xavfsiz startup migration: agar agents.source ustuni yo'q bo'lsa,
    ALTER TABLE bilan qo'shamiz va mavjud yozuvlarning source qiymatini aniqlaymiz.

    Mantiq:
      - AGENTS_SEED da bo'lgan slug'lar -> source="seed"
      - Boshqalar (admin yaratganlari) -> source="admin"

    Hech qanday DROP yoki RECREATE qilinmaydi. Idempotent.
    """
    from app.agents.registry import AGENTS_SEED
    seed_slugs = [item["agent"]["slug"] for item in AGENTS_SEED]

    async with engine.begin() as conn:
        # Mavjud ustunlarni tekshiramiz (sync inspector async engine bilan ishlaydi)
        def _has_column(sync_conn) -> bool:
            inspector = inspect(sync_conn)
            if "agents" not in inspector.get_table_names():
                return True  # jadval yo'q — keyin SQLAlchemy yaratadi
            cols = {c["name"] for c in inspector.get_columns("agents")}
            return "source" in cols

        already_has = await conn.run_sync(_has_column)
        if already_has:
            return

        logger.info("Migration: agents.source ustuni qo'shilmoqda...")

        # SQLite-safe ALTER TABLE — ustunni default bilan qo'shamiz.
        # NOT NULL DEFAULT 'admin' — hamma mavjud yozuvlar uchun.
        await conn.execute(text(
            "ALTER TABLE agents ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'admin'"
        ))

        # AGENTS_SEED da bo'lgan slug'larni "seed" deb belgilaymiz.
        if seed_slugs:
            placeholders = ",".join([f":s{i}" for i in range(len(seed_slugs))])
            params = {f"s{i}": slug for i, slug in enumerate(seed_slugs)}
            await conn.execute(
                text(f"UPDATE agents SET source = 'seed' WHERE slug IN ({placeholders})"),
                params,
            )
        logger.info(f"Migration: agents.source qo'shildi ({len(seed_slugs)} ta seed agent belgilandi)")


async def _ensure_payment_manual_columns():
    """
    SQLite uchun xavfsiz startup migration: payments_manual jadvaliga
    Click P2P uchun yangi ustunlarni qo'shadi (agar yo'q bo'lsa).

    Hech qanday DROP yoki RECREATE qilinmaydi. Idempotent.
    """
    new_columns = [
        ("agent_id", "VARCHAR(36)"),
        ("user_agent_id", "VARCHAR(36)"),
        ("expected_amount", "FLOAT"),
        ("submitted_amount", "FLOAT"),
        ("payer_name", "VARCHAR(255)"),
        ("payer_phone", "VARCHAR(50)"),
        ("comment", "TEXT"),
        ("receipt_text", "TEXT"),
        ("screenshot_url", "VARCHAR(500)"),
    ]

    async with engine.begin() as conn:
        def _existing_cols(sync_conn) -> set[str]:
            inspector = inspect(sync_conn)
            if "payments_manual" not in inspector.get_table_names():
                return {"__table_missing__"}
            return {c["name"] for c in inspector.get_columns("payments_manual")}

        existing = await conn.run_sync(_existing_cols)
        if "__table_missing__" in existing:
            return  # SQLAlchemy create_all keyinroq yaratadi

        added = 0
        for col_name, col_type in new_columns:
            if col_name in existing:
                continue
            await conn.execute(text(
                f"ALTER TABLE payments_manual ADD COLUMN {col_name} {col_type}"
            ))
            added += 1
        if added:
            logger.info(f"Migration: payments_manual ga {added} ta yangi ustun qo'shildi (Click P2P uchun)")


async def seed_agents():
    """
    Agent katalogini xavfsiz, idempotent yangilash.

    Asosiy printsip — admin yaratgan agentlarga TEGMASLIK:
      - Faqat source="seed" yozuvlar startup paytida yangilanadi/yaratiladi
      - source="admin" yoki boshqa yozuvlar HECH QACHON deaktivatsiya yoki o'zgartirilmaydi
      - AGENTS_SEED'da yo'q seed agentlar ham deaktivatsiya QILINMAYDI
        (admin qo'lda is_active=false qilishi mumkin, lekin restart bunga tegmaydi)
    """
    from app.models import Agent, AgentSkill
    from app.agents.registry import AGENTS_SEED

    # Avval ustun migration (idempotent)
    await _ensure_agent_source_column()
    await _ensure_payment_manual_columns()

    created_count = 0
    updated_count = 0
    preserved_admin_count = 0

    async with async_session() as session:
        # Admin yaratgan agentlar sonini hisoblash (faqat log uchun)
        from sqlalchemy import func
        admin_count = await session.scalar(
            select(func.count(Agent.id)).where(Agent.source != "seed")
        ) or 0
        preserved_admin_count = int(admin_count)

        for item in AGENTS_SEED:
            a = item["agent"]
            slug = a["slug"]

            # Mavjud agentni tekshirish
            result = await session.execute(
                select(Agent).where(Agent.slug == slug)
            )
            agent = result.scalar_one_or_none()

            if agent is None:
                # Yangi seed agent yaratish
                agent = Agent(**a, source="seed")
                session.add(agent)
                await session.flush()
                created_count += 1
            elif agent.source == "seed":
                # Faqat seed-managed yozuvni yangilash
                changed = False
                for key, value in a.items():
                    if getattr(agent, key, None) != value:
                        setattr(agent, key, value)
                        changed = True
                if changed:
                    updated_count += 1
            else:
                # source="admin" — admin yoki boshqa source — TEGMAYMIZ
                # Hatto slug AGENTS_SEED bilan to'g'ri kelsa ham, admin uni
                # "egallab olgan" deb hisoblaymiz. Loglaymiz xolos.
                logger.warning(
                    f"seed_agents: agent slug='{slug}' source='{agent.source}' — "
                    "ustidan yozilmadi (admin-managed)"
                )
                continue

            # Skills upsert — faqat seed-managed agentlar uchun
            for skill_data in item.get("skills", []):
                skill_result = await session.execute(
                    select(AgentSkill).where(
                        AgentSkill.agent_id == agent.id,
                        AgentSkill.name == skill_data["name"],
                    )
                )
                existing_skill = skill_result.scalar_one_or_none()
                if existing_skill:
                    if existing_skill.content != skill_data["content"]:
                        existing_skill.content = skill_data["content"]
                else:
                    session.add(AgentSkill(
                        agent_id=agent.id,
                        name=skill_data["name"],
                        content=skill_data["content"],
                    ))

        # MUHIM: hech nimani deaktivatsiya QILMAYMIZ.
        # Eski kod registry'da yo'q agentlarni is_active=False qilardi —
        # bu admin yaratgan agentlarni ham buzgan. Endi olib tashlangan.
        await session.commit()

    logger.info(
        f"seed_agents: created={created_count} updated={updated_count} "
        f"admin_agents_preserved={preserved_admin_count}"
    )


async def get_db() -> AsyncSession:
    """Dependency for FastAPI routes."""
    async with async_session() as session:
        yield session
