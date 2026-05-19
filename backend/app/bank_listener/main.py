"""
ZAI Bank Listener (Telethon userbot).

Vazifasi:
  - User'ning Telegram akkauntiga login qiladi
  - @humocardbot dan kelgan xabarlarni real-time tinglaydi
  - Har xabarni HMAC bilan imzolab, ZAI backend webhook'iga yuboradi

Ishga tushirish:
  cd backend
  python -m app.bank_listener.main

Birinchi marta — kod va 2FA paroli so'raladi (interactive),
keyin session fayl saqlanadi (.session) va keyingi runlar avtomatik.

Production: systemd service yoki PM2 ostida ishga tushiriladi.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import sys
from typing import Iterable

import httpx
from telethon import TelegramClient, events
from telethon.sessions import StringSession

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


def _sign_payload(payload: dict, key: str) -> str:
    """JSON payload uchun HMAC-SHA256 imzo."""
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hmac.new(key.encode(), raw, hashlib.sha256).hexdigest()


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
    sig = hmac.new(hmac_key.encode(), raw, hashlib.sha256).hexdigest() if hmac_key else ""

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
            logger.info(
                "webhook OK: matched=%s duplicate=%s order=%s note=%s",
                data.get("matched"), data.get("duplicate"),
                data.get("order_id"), data.get("note"),
            )
            return True
        logger.warning("webhook fail: %s %s", r.status_code, r.text[:200])
        return False
    except Exception as e:
        logger.error("webhook exception: %s", e)
        return False


def _parse_bot_usernames(csv: str) -> Iterable[str]:
    """'humocardbot, uzcardpaybot' → ['humocardbot', 'uzcardpaybot']."""
    return [u.strip().lstrip("@") for u in csv.split(",") if u.strip()]


async def main():
    cfg = get_settings()

    # Konfiguratsiya validatsiya
    if not cfg.telethon_api_id or not cfg.telethon_api_hash:
        logger.error(
            "TELETHON_API_ID/HASH sozlanmagan. https://my.telegram.org "
            "dan API ma'lumot oling va .env ga yozing."
        )
        sys.exit(1)
    if not cfg.sms_webhook_secret:
        logger.error("SMS_WEBHOOK_SECRET sozlanmagan")
        sys.exit(1)

    bot_usernames = list(_parse_bot_usernames(cfg.bank_bot_usernames))
    if not bot_usernames:
        logger.error("BANK_BOT_USERNAMES bo'sh")
        sys.exit(1)

    logger.info("ZAI Bank Listener boshlanmoqda...")
    logger.info("  → API base: %s", ZAI_API_BASE)
    logger.info("  → Tinglanadigan botlar: %s", bot_usernames)
    logger.info("  → Session fayl: %s.session", cfg.telethon_session_name)

    client = TelegramClient(
        cfg.telethon_session_name,
        cfg.telethon_api_id,
        cfg.telethon_api_hash,
        # Battery saving
        device_model="ZAI Bank Listener",
        app_version="1.0",
    )

    # Botlar entity'larini olamiz (resolve)
    @client.on(events.NewMessage())
    async def _on_any(event):
        # Filter: bizga keraklisi bot user'idan kelgan xabar
        sender = await event.get_sender()
        if not sender:
            return
        sender_username = (sender.username or "").lower()
        sender_first = (getattr(sender, "first_name", "") or "").lower()

        # @humocardbot turli yo'llar bilan keladi (forwarded yoki to'g'ridan)
        is_target = (
            sender_username in {b.lower() for b in bot_usernames}
            or any(b.lower() in sender_first for b in bot_usernames)
        )
        if not is_target:
            return

        text = event.message.message or ""
        if not text.strip():
            return

        payload = {
            "sms_external_id": str(event.message.id),
            "from_chat": f"@{sender_username}" if sender_username else sender_first,
            "text": text,
            "received_at": int(event.message.date.timestamp()),
        }

        logger.info(
            "SMS received: id=%s from=%s len=%d",
            payload["sms_external_id"], payload["from_chat"], len(text),
        )

        await _post_to_backend(
            payload,
            api_base=ZAI_API_BASE,
            secret=cfg.sms_webhook_secret,
            hmac_key=cfg.sms_webhook_hmac_key,
        )

    # Login (birinchi marta interactive)
    await client.start()
    me = await client.get_me()
    logger.info("Logged in as: %s (id=%s)", me.username or me.first_name, me.id)
    logger.info("✅ Listener faol. Yangi xabarlar kutilmoqda...")

    await client.run_until_disconnected()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Stopped by user")
