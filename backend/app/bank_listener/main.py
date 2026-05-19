"""
ZAI Bank Listener (Telethon v1 userbot).

Vazifasi:
  - User'ning Telegram akkauntiga login qiladi
  - @humocardbot dan kelgan xabarlarni real-time tinglaydi
  - Har xabarni HMAC bilan imzolab, ZAI backend webhook'iga yuboradi
  - Startup'da oxirgi 50 ta xabarni tekshiradi ("catch-up" — listener o'chgan paytda
    kelgan bank xabarlarini yo'qotmaslik uchun)

Ishga tushirish:
  cd backend
  python -m app.bank_listener.main

Birinchi marta — kod va 2FA paroli so'raladi (interactive),
keyin session fayl saqlanadi (.session) va keyingi runlar avtomatik.

Production: systemd service yoki PM2 ostida ishga tushiriladi.

Telethon API reference:
  - events.NewMessage(chats=[...]) → faqat kerakli chatlardan
  - client.iter_messages(chat, limit=50) → catch-up
  - StringSession yoki file-based session

Ref: https://docs.telethon.dev/en/stable/modules/events.html
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac as hmac_mod
import json
import logging
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import List

import httpx
from telethon import TelegramClient, events
from telethon.tl.types import User as TgUser

# Backend config'ini reuse qilamiz (env variables)
from app.config import get_settings

# ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("bank_listener")

# Backend webhook URL'ini env'dan olamiz
ZAI_API_BASE = os.getenv("ZAI_API_BASE", "http://127.0.0.1:8005")

# Catch-up: listener qayta ishga tushganda oxirgi N xabarni tekshiradi
CATCHUP_LIMIT = 50
# Catchup faqat 30 minutdan eski bo'lmagan xabarlarni yuboradi
CATCHUP_MAX_AGE_MINUTES = 30


# ════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════


def _sign_payload(payload: dict, key: str) -> str:
    """JSON payload uchun HMAC-SHA256 imzo."""
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hmac_mod.new(key.encode(), raw, hashlib.sha256).hexdigest()


async def _post_to_backend(
    payload: dict,
    *,
    api_base: str,
    secret: str,
    hmac_key: str,
    timeout: float = 10.0,
) -> bool:
    """
    Backend webhook'iga POST qiladi.

    Returns:
        True — qabul qilindi (200) yoki duplicate
        False — xato (caller log qilishi mumkin)
    """
    url = f"{api_base}/api/payments/humo/sms/webhook/{secret}"
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sig = _sign_payload(payload, hmac_key) if hmac_key else ""

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "ZAI-BankListener/1.0",
    }
    if sig:
        headers["X-Signature"] = sig

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, content=raw, headers=headers)
        if r.status_code == 200:
            data = r.json()
            if data.get("matched"):
                logger.info(
                    "✅ MATCH: order=%s amount matched!",
                    data.get("order_id"),
                )
            elif data.get("duplicate"):
                logger.debug("⏭ Duplicate, skip")
            else:
                logger.info(
                    "ℹ️ Processed: matched=%s note=%s",
                    data.get("matched"), data.get("note"),
                )
            return True
        logger.warning("webhook fail: %s %s", r.status_code, r.text[:200])
        return False
    except Exception as e:
        logger.error("webhook exception: %s", e)
        return False


def _parse_bot_usernames(csv: str) -> List[str]:
    """'humocardbot, uzcardpaybot' → ['humocardbot', 'uzcardpaybot']."""
    return [u.strip().lstrip("@") for u in csv.split(",") if u.strip()]


def _build_payload(msg_id: int, sender_username: str, text: str, date: datetime) -> dict:
    """Webhook payload qurish."""
    return {
        "sms_external_id": str(msg_id),
        "from_chat": f"@{sender_username}" if sender_username else "unknown",
        "text": text,
        "received_at": int(date.timestamp()),
    }


# ════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════


async def main():
    cfg = get_settings()

    # ─── Konfiguratsiya validatsiya ─────────────────────────────
    if not cfg.telethon_api_id or not cfg.telethon_api_hash:
        logger.error(
            "❌ TELETHON_API_ID/HASH sozlanmagan.\n"
            "   https://my.telegram.org dan API ma'lumot oling va .env ga yozing."
        )
        sys.exit(1)
    if not cfg.sms_webhook_secret:
        logger.error("❌ SMS_WEBHOOK_SECRET sozlanmagan")
        sys.exit(1)

    bot_usernames = _parse_bot_usernames(cfg.bank_bot_usernames)
    if not bot_usernames:
        logger.error("❌ BANK_BOT_USERNAMES bo'sh")
        sys.exit(1)

    logger.info("=" * 50)
    logger.info("ZAI Bank Listener v1.0")
    logger.info("=" * 50)
    logger.info("  API base: %s", ZAI_API_BASE)
    logger.info("  Bank botlari: %s", bot_usernames)
    logger.info("  Session: %s.session", cfg.telethon_session_name)
    logger.info("  Card filter: %s", cfg.humo_card_mask or "(hammasi)")
    logger.info("=" * 50)

    # ─── Telethon client ────────────────────────────────────────
    client = TelegramClient(
        cfg.telethon_session_name,
        cfg.telethon_api_id,
        cfg.telethon_api_hash,
        device_model="ZAI Bank Listener",
        app_version="1.0",
        system_version="Linux",
    )

    # ─── Login (interactive birinchi marta) ─────────────────────
    await client.start()
    me = await client.get_me()
    logger.info("✅ Logged in: %s (id=%s)", me.username or me.first_name, me.id)

    # ─── Bot entity'larini resolve qilish ───────────────────────
    # events.NewMessage(chats=...) uchun entity kerak
    bot_entities = []
    for uname in bot_usernames:
        try:
            entity = await client.get_entity(uname)
            bot_entities.append(entity)
            logger.info("  ✅ Bot topildi: @%s (id=%s)", uname, entity.id)
        except Exception as e:
            logger.warning("  ⚠️ Bot topilmadi: @%s — %s", uname, e)

    if not bot_entities:
        logger.error("❌ Hech bir bank bot topilmadi! @humocardbot ga oldin xabar yozing.")
        sys.exit(1)

    # ─── Catch-up: o'tkazib yuborilgan xabarlarni tekshirish ───
    logger.info("📨 Catch-up: oxirgi %d xabar tekshirilmoqda...", CATCHUP_LIMIT)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=CATCHUP_MAX_AGE_MINUTES)
    catchup_count = 0

    for bot_entity in bot_entities:
        try:
            async for msg in client.iter_messages(bot_entity, limit=CATCHUP_LIMIT):
                if not msg.text:
                    continue
                if msg.date.replace(tzinfo=timezone.utc) < cutoff:
                    break  # Juda eski — to'xtatamiz

                sender = await msg.get_sender()
                sender_username = ""
                if sender and hasattr(sender, "username"):
                    sender_username = sender.username or ""

                payload = _build_payload(
                    msg_id=msg.id,
                    sender_username=sender_username,
                    text=msg.text,
                    date=msg.date,
                )
                await _post_to_backend(
                    payload,
                    api_base=ZAI_API_BASE,
                    secret=cfg.sms_webhook_secret,
                    hmac_key=cfg.sms_webhook_hmac_key,
                )
                catchup_count += 1
        except Exception as e:
            logger.warning("Catch-up xato @%s: %s", getattr(bot_entity, 'username', '?'), e)

    if catchup_count:
        logger.info("📨 Catch-up: %d xabar yuborildi (duplicatlar backend tomonida filter)", catchup_count)
    else:
        logger.info("📨 Catch-up: yangi xabar yo'q")

    # ─── Real-time event handler ────────────────────────────────
    # Telethon `chats` parametri bilan faqat kerakli botlardan kelgan
    # xabarlarni tinglaydi — boshqa chatlar butunlay e'tiborga olinmaydi.
    @client.on(events.NewMessage(chats=bot_entities))
    async def on_bank_message(event):
        """Bank bot'dan yangi xabar keldi."""
        text = event.message.text or event.message.message or ""
        if not text.strip():
            return

        sender = await event.get_sender()
        sender_username = ""
        if sender and hasattr(sender, "username"):
            sender_username = sender.username or ""

        payload = _build_payload(
            msg_id=event.message.id,
            sender_username=sender_username,
            text=text,
            date=event.message.date,
        )

        logger.info(
            "💬 Yangi xabar: from=@%s id=%s len=%d",
            sender_username, event.message.id, len(text),
        )

        await _post_to_backend(
            payload,
            api_base=ZAI_API_BASE,
            secret=cfg.sms_webhook_secret,
            hmac_key=cfg.sms_webhook_hmac_key,
        )

    # ─── Keep alive ─────────────────────────────────────────────
    logger.info("")
    logger.info("🎧 Real-time listener faol. Bank xabarlarini kutmoqda...")
    logger.info("   Ctrl+C bilan to'xtatish mumkin.")
    logger.info("")

    await client.run_until_disconnected()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Listener to'xtatildi (user signal)")
