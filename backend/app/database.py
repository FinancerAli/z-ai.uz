"""ZAI Platform — Database Setup (SQLite for dev, PostgreSQL for prod)"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import delete, inspect, select, func, text
from app.config import get_settings

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


async def seed_agents():
    """Agent katalogini idempotent yangilash."""
    from app.models import Agent, AgentSkill
    from app.agents.registry import AGENTS_SEED

    async with async_session() as session:
        seed_slugs = {item["agent"]["slug"] for item in AGENTS_SEED}

        for item in AGENTS_SEED:
            a = item["agent"]
            result = await session.execute(select(Agent).where(Agent.slug == a["slug"]))
            agent = result.scalar_one_or_none()
            if agent:
                for key, value in a.items():
                    setattr(agent, key, value)
            else:
                agent = Agent(**a)
                session.add(agent)
            await session.flush()

            await session.execute(delete(AgentSkill).where(AgentSkill.agent_id == agent.id))
            for skill in item["skills"]:
                askill = AgentSkill(
                    agent_id=agent.id,
                    name=skill["name"],
                    content=skill["content"],
                )
                session.add(askill)

        legacy_result = await session.execute(select(Agent).where(~Agent.slug.in_(seed_slugs)))
        for agent in legacy_result.scalars().all():
            agent.is_active = False

        await session.commit()


async def get_db() -> AsyncSession:
    """Dependency for FastAPI routes."""
    async with async_session() as session:
        yield session
