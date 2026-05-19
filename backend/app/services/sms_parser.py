"""
@humocardbot SMS parser.

Bank bot xabar formati (real namuna):
    💸 To'ldirish
    + 33.000,00 UZS
    ⚠️ Komissiya: 0,00 UZS
    📍 HUMO TO HUMO UZPAYNE
    💳 VISA *8286
    🕐 22:58 18.05.2026
    💰 544.084,01 UZS

Yoki:
    💸 Amaliyot
    - 50.000,00 UZS
    ...

Yoki:
    💸 To'lov
    - 70.700,00 UZS
    ...

Faqat **To'ldirish** (incoming) tranzaksiyalarni qabul qilamiz.
Number format: European (1.234,56) — nuqta ming, vergul kasr.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ParsedSms:
    """SMS parser natijasi."""
    transaction_type: str           # "topup" | "operation" | "payment"
    amount: float                   # Sof son (UZS)
    is_incoming: bool               # True bo'lsa hisobga tushgan
    card_mask: Optional[str]        # "VISA *8286"
    source: Optional[str]           # "BEEPUL P2P>TASHKENT"
    balance: Optional[float]        # 544084.01
    timestamp: Optional[datetime]   # bank xabarining vaqti


# ─── Tranzaksiya turi ───────────────────────────────────────────
# Apostrof variantlari: ' (U+0027), ' (U+2018), ' (U+2019), ' (U+02BB)
_APOS = r"['\u2018\u2019\u02BB]"

# UZS so'z varianti — UZS, sum, so'm, so'm (apostrofli)
_UZS = r"(?:UZS|sum|so['\u2018\u2019\u02BB]?m)"

_TYPE_PATTERNS = {
    "topup":     re.compile(r"To['\u2018\u2019\u02BB]?ldirish", re.IGNORECASE),
    "operation": re.compile(r"Amaliyot",                        re.IGNORECASE),
    "payment":   re.compile(r"To['\u2018\u2019\u02BB]?lov",     re.IGNORECASE),
}


# ─── Summa parser ───────────────────────────────────────────────
# European format: 33.000,00 yoki 1.234.567,89 yoki 33000,00 yoki 33000
# Belgi: + (incoming) yoki - (outgoing)
# Misol matchlar:
#   "+ 33.000,00 UZS"
#   "+33,000 UZS"
#   "- 50.000,00 UZS"
#   "+1500 sum"
_AMOUNT_PATTERN = re.compile(
    r"(?P<sign>[+\-])\s*"                       # + yoki -
    r"(?P<num>[\d.\s]+(?:,\d{1,2})?)\s*"        # 33.000,00 yoki 33000
    + _UZS,
    re.IGNORECASE,
)


# ─── Karta maskasi ──────────────────────────────────────────────
# "VISA *8286", "HUMO *1234", "UZCARD *5678", "MASTERCARD *9012"
_CARD_PATTERN = re.compile(
    r"(?P<system>VISA|HUMO|UZCARD|MASTERCARD|MC)\s*\*+\s*(?P<last4>\d{4})",
    re.IGNORECASE,
)


# ─── Manba (📍) ─────────────────────────────────────────────────
_SOURCE_PATTERN = re.compile(
    r"(?:^|\n)\s*📍\s*(?P<source>.+?)(?=\n|$)",
    re.MULTILINE,
)


# ─── Vaqt ───────────────────────────────────────────────────────
# "22:58 18.05.2026"
_TIMESTAMP_PATTERN = re.compile(
    r"(?P<time>\d{1,2}:\d{2})\s+"
    r"(?P<date>\d{1,2}\.\d{1,2}\.\d{4})"
)


# ─── Balans ─────────────────────────────────────────────────────
# 💰 544.084,01 UZS
_BALANCE_PATTERN = re.compile(
    r"(?:^|\n)\s*💰\s*(?P<bal>[\d.\s]+(?:,\d{1,2})?)\s*"
    + _UZS,
    re.MULTILINE | re.IGNORECASE,
)


# ────────────────────────────────────────────────────────────────


def _parse_european_number(raw: str) -> Optional[float]:
    """
    European format: "33.000,00" → 33000.00
                     "1.234.567,89" → 1234567.89
                     "33000" → 33000.0
                     "33,5" → 33.5  (kam, lekin xato emas)
    """
    if not raw:
        return None
    s = raw.strip().replace(" ", "")
    if not s:
        return None
    # Vergul kasr ajratuvchi sifatida (European)
    if "," in s:
        # nuqtalar = ming ajratuvchi → olib tashlaymiz
        s = s.replace(".", "").replace(",", ".")
    # Vergul yo'q bo'lsa — nuqta ham ming bo'lishi mumkin (33.000)
    elif s.count(".") == 1 and len(s.split(".")[-1]) == 3:
        # 3 raqamli bo'lsa — bu ming separator
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def _detect_type(text: str) -> Optional[str]:
    """Tranzaksiya turi ('topup' | 'operation' | 'payment')."""
    for tname, pattern in _TYPE_PATTERNS.items():
        if pattern.search(text):
            return tname
    return None


def parse_humocard_message(text: str) -> Optional[ParsedSms]:
    """
    @humocardbot xabarini parse qiladi.

    Returns:
        ParsedSms — barcha maydonlarni tahlil qilingan
        None — agar bu bank xabari emas (advert, system msg va h.k.)
    """
    if not text or not text.strip():
        return None

    # 1. Tranzaksiya turi
    tx_type = _detect_type(text)
    if not tx_type:
        return None  # Bu bank xabari emas

    # 2. Summa
    amt_match = _AMOUNT_PATTERN.search(text)
    if not amt_match:
        return None  # Summa topilmadi
    amount = _parse_european_number(amt_match.group("num"))
    if amount is None or amount <= 0:
        return None
    sign = amt_match.group("sign")
    is_incoming = (sign == "+")

    # 3. Karta maskasi
    card_mask = None
    cm = _CARD_PATTERN.search(text)
    if cm:
        # "VISA *8286" formatda saqlaymiz
        card_mask = f"{cm.group('system').upper()} *{cm.group('last4')}"

    # 4. Manba
    source = None
    sm = _SOURCE_PATTERN.search(text)
    if sm:
        source = sm.group("source").strip()

    # 5. Vaqt
    ts = None
    tm = _TIMESTAMP_PATTERN.search(text)
    if tm:
        try:
            ts = datetime.strptime(
                f"{tm.group('date')} {tm.group('time')}",
                "%d.%m.%Y %H:%M",
            )
        except ValueError:
            ts = None

    # 6. Balans (ixtiyoriy)
    balance = None
    bm = _BALANCE_PATTERN.search(text)
    if bm:
        balance = _parse_european_number(bm.group("bal"))

    return ParsedSms(
        transaction_type=tx_type,
        amount=amount,
        is_incoming=is_incoming,
        card_mask=card_mask,
        source=source,
        balance=balance,
        timestamp=ts,
    )


def is_zai_topup(parsed: ParsedSms, expected_card_mask: Optional[str]) -> bool:
    """
    ZAI to'lov filteri:
      - To'ldirish (incoming)
      - Konfig'da ko'rsatilgan kartaga
    """
    if parsed.transaction_type != "topup":
        return False
    if not parsed.is_incoming:
        return False
    if expected_card_mask:
        if not parsed.card_mask:
            return False
        # case-insensitive, bo'sh joylarsiz solishtirish
        a = parsed.card_mask.replace(" ", "").upper()
        b = expected_card_mask.replace(" ", "").upper()
        if a != b:
            return False
    return True
