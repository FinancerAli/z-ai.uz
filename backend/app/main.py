"""
ZAI Platform — Main Entry Point v2
FastAPI + Telegram Bot + Agent System.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import init_db, seed_agents
from app.bot.handlers import setup_bot
from app.api import router as api_router

# Logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

settings = get_settings()
bot_app = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup va shutdown eventlari."""
    global bot_app

    # === STARTUP ===
    logger.info("🚀 ZAI Platform v2 ishga tushmoqda...")

    # JWT Secret validation (P0 Security)
    if not settings.jwt_secret or settings.jwt_secret == "zai-platform-jwt-secret-change-in-production":
        logger.error("❌ CRITICAL: JWT_SECRET is missing or using default weak key!")
        logger.error("Please set a strong JWT_SECRET in .env before starting in production.")
        # If in production, stop the app immediately
        if settings.app_env != "development":
            raise ValueError("Insecure JWT_SECRET in production. Halting startup.")

    # Database jadvallarini yaratish (deploy script alembic orqali qiladi)
    # await init_db()
    logger.info("✅ Database jadvallari tayyor (skipping alembic in lifespan)")

    # Agentlarni seed qilish (birinchi marta)
    await seed_agents()
    logger.info("Agentlar seed qilindi (3 ta MVP agent)")

    # Telegram bot ishga tushirish
    try:
        bot_app = setup_bot()
        await bot_app.initialize()
        await bot_app.start()
        await bot_app.updater.start_polling(drop_pending_updates=True)
        logger.info("✅ Telegram bot ishlayapti: @ZAIgentbot")
    except Exception as e:
        logger.error(f"Telegram bot xatosi: {e}")

    yield

    # === SHUTDOWN ===
    logger.info("🛑 ZAI Platform to'xtamoqda...")
    if bot_app:
        try:
            await bot_app.updater.stop()
            await bot_app.stop()
            await bot_app.shutdown()
        except Exception:
            pass


# FastAPI app
app = FastAPI(
    title="ZAI Platform API v2",
    description="O'zbekiston uchun AI Agent platformasi — ko'p agentli ekotizim",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — Telegram Mini App barcha origin'larni qabul qiladi
# Telegram mobil WebView "Origin: null" yuboradi, shuning uchun wildcard kerak
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

# API routes
app.include_router(api_router)


@app.get("/")
async def root():
    return {
        "name": "ZAI Platform",
        "version": "0.2.0",
        "status": "running",
        "bot": "@ZAIgentbot",
    }


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.2.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
