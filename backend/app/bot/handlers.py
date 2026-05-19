"""
ZAI Telegram Bot — Handlers v2
Foydalanuvchi bilan muloqot + Agent tizimi integratsiyasi.
"""
import logging
from datetime import datetime, timezone

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    ReplyKeyboardRemove,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ConversationHandler,
    PreCheckoutQueryHandler,
    filters,
    ContextTypes,
)
from sqlalchemy import select, func

from app.config import get_settings
from app.database import async_session
from app.models import User, Task, Agent, PaymentTransaction, UserAgent
from app.agents.agent_engine import run_agent

logger = logging.getLogger(__name__)

# Mini App URL — bir joyda boshqarish uchun
MINI_APP_URL = "https://zai.ustaitech.uz/"

# ======== Conversation States ========
# SELECTING_AGENT va WAITING_CONTENT olib tashlandi — ishlatilmagan edi
(
    SELECTING_BUSINESS,
    SELECTING_LANGUAGE,
    ENTERING_TOPIC,
) = range(3)


# ============================================================
#  YORDAMCHI FUNKSIYALAR
# ============================================================

async def _get_active_user(telegram_id: int) -> User | None:
    """
    Foydalanuvchini DB'dan olish va status tekshirish.
    Bloklangan yoki topilmagan foydalanuvchi uchun None qaytaradi.
    """
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = result.scalar_one_or_none()
        if not user or user.status == "blocked":
            return None
        return user


async def _get_or_create_user(tg_user) -> User:
    """Foydalanuvchini olish yoki yangi yaratish."""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == tg_user.id)
        )
        db_user = result.scalar_one_or_none()

        if not db_user:
            db_user = User(
                telegram_id=tg_user.id,
                first_name=tg_user.first_name or "",
                last_name=tg_user.last_name or "",
                username=tg_user.username or "",
            )
            session.add(db_user)
            await session.commit()
            await session.refresh(db_user)
        else:
            # last_seen_at yangilash
            db_user.last_seen_at = datetime.now(timezone.utc)
            await session.commit()

        return db_user


# ======== /start — Kirish ========
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Bot ishga tushganda chiqadigan xabar."""
    tg_user = update.effective_user
    await _get_or_create_user(tg_user)

    welcome_text = f"""
🤖 *Salom, {tg_user.first_name}!*

Men *ZAI* — sizning shaxsiy AI yordamchingizman.

👥 *3 ta ixtisoslashgan agent:*
📝 SMM Content — post va matn yozish
📊 Biznes Tahlil — bozor va SWOT tahlil
📄 Hujjat Tahlili — shartnoma va tarjima

━━━━━━━━━━━━━━━━━━━
🆓 *14 kunlik bepul sinov* — Hoziroq boshlang!
━━━━━━━━━━━━━━━━━━━
"""
    keyboard = [
        [InlineKeyboardButton("📝 Kontent yaratish", web_app=WebAppInfo(url=MINI_APP_URL))],
        [InlineKeyboardButton("🤖 Barcha agentlar", callback_data="list_agents")],
        [InlineKeyboardButton("ℹ️ Qanday ishlaydi?", callback_data="how_it_works")],
        [InlineKeyboardButton("💬 Admin bilan bog'lanish", callback_data="contact_admin")],
    ]
    await update.message.reply_text(
        welcome_text,
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ======== Barcha agentlar ro'yxati ========
async def list_agents_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    async with async_session() as session:
        result = await session.execute(
            select(Agent).where(Agent.is_active == True).order_by(Agent.sort_order)
        )
        agents = result.scalars().all()

    text = "🤖 *ZAI Agentlari:*\n\n"
    for a in agents:
        text += f"{a.icon} *{a.name}* — {a.description[:80]}...\n"
        text += f"   💰 {a.price_monthly:,.0f} so'm/oy | 🔄 Kunlik: {a.daily_limit} ta\n\n"

    keyboard = [[InlineKeyboardButton("🏠 Bosh menyu", callback_data="back_to_menu")]]
    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ======== Qanday ishlaydi ========
async def how_it_works(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    text = """
🧠 *ZAI qanday ishlaydi?*

*1-qadam:* Agent tanlaysiz (SMM, Tahlil, Hujjat...)
*2-qadam:* Topshiriq berasiz
*3-qadam:* AI natijani tayyorlaydi
*4-qadam:* Natijani olasiz va ishlatasiz!

📱 *Mini App* orqali:
— Agentlar do'konini ko'rish
— Sotib olish / obuna bo'lish
— Topshiriqlar tarixini kuzatish

💰 *Narxlar:*
🆓 Sinov — 14 kun bepul
⭐ Agentlar — 149,000 — 299,000 so'm/oy

━━━━━━━━━━━━━━━━━━━
Tayyor bo'lsangiz — quyidagi tugmani bosing 👇
"""
    keyboard = [
        [InlineKeyboardButton("📝 Kontent yaratish", web_app=WebAppInfo(url=MINI_APP_URL))],
        [InlineKeyboardButton("◀️ Orqaga", callback_data="back_to_menu")],
    ]
    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ======== Admin bilan bog'lanish ========
async def contact_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    text = """
💬 *Admin bilan bog'lanish*

Savollar yoki takliflar bo'lsa:
👉 @Muxammadali

Yoki shu yerda yozing — admin ko'radi.
"""
    keyboard = [[InlineKeyboardButton("◀️ Orqaga", callback_data="back_to_menu")]]
    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ======== Bosh menyuga qaytish ========
async def back_to_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    text = "🤖 *ZAI — Bosh menyu*\n\nNima qilmoqchisiz?"
    keyboard = [
        [InlineKeyboardButton("📝 Kontent yaratish", web_app=WebAppInfo(url=MINI_APP_URL))],
        [InlineKeyboardButton("🤖 Barcha agentlar", callback_data="list_agents")],
        [InlineKeyboardButton("ℹ️ Qanday ishlaydi?", callback_data="how_it_works")],
        [InlineKeyboardButton("💬 Admin bilan bog'lanish", callback_data="contact_admin")],
    ]
    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ============================================================
#  KONTENT YARATISH FLOW
# ============================================================

async def create_content_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """1-qadam: Biznes turini tanlash."""
    query = update.callback_query
    await query.answer()

    # Bloklangan foydalanuvchini tekshirish
    db_user = await _get_active_user(update.effective_user.id)
    if not db_user:
        await query.edit_message_text("⛔ Sizning hisobingiz bloklangan. Admin bilan bog'laning.")
        return ConversationHandler.END

    text = "📝 *Kontent yaratish*\n\n*1-qadam:* Biznes turingizni tanlang 👇"
    keyboard = [
        [
            InlineKeyboardButton("📚 IELTS/Til markazi", callback_data="biz_ielts"),
            InlineKeyboardButton("💅 Go'zallik saloni", callback_data="biz_beauty"),
        ],
        [
            InlineKeyboardButton("💻 IT kurslar", callback_data="biz_it_course"),
            InlineKeyboardButton("🏥 Klinika", callback_data="biz_clinic"),
        ],
        [
            InlineKeyboardButton("🛒 Online do'kon", callback_data="biz_ecommerce"),
            InlineKeyboardButton("🍽 Restoran/Kafe", callback_data="biz_restaurant"),
        ],
        [InlineKeyboardButton("📦 Boshqa", callback_data="biz_other")],
        [InlineKeyboardButton("◀️ Orqaga", callback_data="back_to_menu")],
    ]
    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return SELECTING_BUSINESS


async def business_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    biz_type = query.data.replace("biz_", "")
    context.user_data["business_type"] = biz_type

    biz_names = {
        "ielts": "📚 IELTS/Til markazi", "beauty": "💅 Go'zallik saloni",
        "it_course": "💻 IT kurslar", "clinic": "🏥 Klinika",
        "ecommerce": "🛒 Online do'kon", "restaurant": "🍽 Restoran/Kafe",
        "other": "📦 Boshqa",
    }

    text = f"✅ Biznes: *{biz_names.get(biz_type, biz_type)}*\n\n*2-qadam:* Qaysi tilda yozamiz?"
    keyboard = [
        [
            InlineKeyboardButton("🇺🇿 O'zbekcha", callback_data="lang_uz"),
            InlineKeyboardButton("🇷🇺 Ruscha", callback_data="lang_ru"),
        ],
        [InlineKeyboardButton("🇺🇿🇷🇺 Aralash", callback_data="lang_uz_ru")],
        [InlineKeyboardButton("◀️ Orqaga", callback_data="create_content")],
    ]
    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return SELECTING_LANGUAGE


async def language_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    lang = query.data.replace("lang_", "")
    context.user_data["language"] = lang

    lang_names = {"uz": "🇺🇿 O'zbekcha", "ru": "🇷🇺 Ruscha", "uz_ru": "🇺🇿🇷🇺 Aralash"}

    text = f"""✅ Til: *{lang_names.get(lang, lang)}*

*3-qadam:* Post mavzusini yozing 👇

Misollar:
• _"Yangi guruhga qabul boshlandi"_
• _"Chegirma aksiyasi — 30% off"_
• _"Mijoz natijasi — oldin va keyin"_
"""
    await query.edit_message_text(text, parse_mode="Markdown")
    return ENTERING_TOPIC


async def topic_received(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Mavzu keldi → foydalanuvchi tekshiriladi → Agent ishga tushadi."""
    topic = update.message.text
    context.user_data["topic"] = topic

    # Bloklangan foydalanuvchini tekshirish
    db_user = await _get_active_user(update.effective_user.id)
    if not db_user:
        await update.message.reply_text(
            "⛔ Sizning hisobingiz bloklangan. Admin bilan bog'laning: @Muxammadali"
        )
        return ConversationHandler.END

    business_type = context.user_data.get("business_type", "other")
    language = context.user_data.get("language", "uz")

    loading_msg = await update.message.reply_text(
        "🧠 *ZAI ishlamoqda...*\n\n⏳ 3 ta variant tayyorlanmoqda\n_(10-20 soniya kutib turing)_",
        parse_mode="Markdown",
    )

    agent_result = await run_agent(
        agent_slug="smm-content",
        user_id=db_user.id,  # haqiqiy user.id (avval "bot-user" edi)
        input_text=topic,
        context_data={
            "business_type": business_type,
            "language": language,
            "platform": "telegram",
            "tone": "friendly",
        },
    )

    try:
        await loading_msg.delete()
    except Exception:
        pass

    content = agent_result.get("output", "Xatolik yuz berdi")
    tokens = agent_result.get("tokens_used", 0)
    cost = agent_result.get("cost", 0.0)

    footer = f"""

━━━━━━━━━━━━━━━━━━━
📊 Token: {tokens} | 💰 ${cost:.6f}
🤖 Agent: SMM Content | ZAI Platform v2
"""

    full_text = content + footer
    if len(full_text) > 4000:
        await update.message.reply_text(content[:4000])
        await update.message.reply_text(content[4000:] + footer)
    else:
        await update.message.reply_text(full_text)

    keyboard = [
        [InlineKeyboardButton("🔄 Yana yaratish (shu mavzu)", callback_data="retry_same")],
        [InlineKeyboardButton("📝 Yangi mavzu", callback_data="create_content")],
        [InlineKeyboardButton("🏠 Bosh menyu", callback_data="back_to_menu")],
    ]
    await update.message.reply_text(
        "👆 Postni nusxalang va kanalingizga joylang!\n\nYana nima qilamiz?",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return ConversationHandler.END


async def retry_same_topic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Xuddi shu mavzuda qayta yaratish — haqiqiy user ID bilan."""
    query = update.callback_query
    await query.answer()

    topic = context.user_data.get("topic", "")
    business_type = context.user_data.get("business_type", "other")
    language = context.user_data.get("language", "uz")

    if not topic:
        await query.edit_message_text("Avval mavzu kiriting. /start bosing.")
        return

    # Bloklangan foydalanuvchini tekshirish
    db_user = await _get_active_user(update.effective_user.id)
    if not db_user:
        await query.edit_message_text("⛔ Sizning hisobingiz bloklangan.")
        return

    await query.edit_message_text(
        "🧠 *ZAI qayta ishlamoqda...*\n⏳ Yangi variantlar tayyorlanmoqda...",
        parse_mode="Markdown",
    )

    result = await run_agent(
        agent_slug="smm-content",
        user_id=db_user.id,  # haqiqiy user.id (avval "bot-user" hardcoded edi)
        input_text=topic,
        context_data={
            "business_type": business_type,
            "language": language,
            "platform": "telegram",
            "tone": "friendly",
        },
    )

    content = result.get("output", "Xatolik")
    footer = (
        f"\n━━━━━━━━━━━━━━━━━━━\n"
        f"📊 Token: {result.get('tokens_used', 0)} | "
        f"💰 ${result.get('cost', 0):.6f}"
    )

    full_text = content + footer
    # edit_message_text 4096 belgidan uzun bo'lsa xato beradi
    if len(full_text) > 4000:
        await query.edit_message_text(content[:4000])
        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text=content[4000:] + footer,
        )
    else:
        await query.edit_message_text(full_text)

    keyboard = [
        [InlineKeyboardButton("🔄 Yana", callback_data="retry_same")],
        [InlineKeyboardButton("📝 Yangi mavzu", callback_data="create_content")],
        [InlineKeyboardButton("🏠 Bosh menyu", callback_data="back_to_menu")],
    ]
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        text="Yana nima qilamiz?",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Bekor qilindi. /start bosib qaytadan boshlang.",
        reply_markup=ReplyKeyboardRemove(),
    )
    return ConversationHandler.END


# ============================================================
#  TELEGRAM STARS TO'LOV HANDLERLARI
# ============================================================

async def pre_checkout_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Stars to'lovini tasdiqlash — payload tekshirish."""
    query = update.pre_checkout_query
    payload = query.invoice_payload

    # Payload format: "agent:{user_agent_id}:{plan_type}"
    if payload.startswith("agent:") and len(payload.split(":")) == 3:
        await query.answer(ok=True)
    else:
        logger.warning(f"Noto'g'ri Stars payload: {payload}")
        await query.answer(ok=False, error_message="Noto'g'ri to'lov ma'lumotlari")


async def successful_payment_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Stars to'lovi muvaffaqiyatli — agentni faollashtirish va audit yozish."""
    payment = update.message.successful_payment
    payload = payment.invoice_payload  # "agent:{user_agent_id}:{plan_type}"

    parts = payload.split(":")
    if len(parts) != 3 or parts[0] != "agent":
        logger.error(f"Noto'g'ri Stars payload successful_payment'da: {payload}")
        return

    user_agent_id, plan_type = parts[1], parts[2]

    async with async_session() as session:
        # UserAgent'ni faollashtirish
        from datetime import timedelta
        ua_result = await session.execute(
            select(UserAgent).where(UserAgent.id == user_agent_id)
        )
        ua = ua_result.scalar_one_or_none()

        if not ua:
            logger.error(f"Stars payment: UserAgent {user_agent_id} topilmadi")
            await update.message.reply_text("⚠️ Texnik xato. Admin bilan bog'laning: @Muxammadali")
            return

        now = datetime.now(timezone.utc)
        plan_days = {"daily": 1, "weekly": 7, "monthly": 30}
        ua.status = "active"
        ua.started_at = now
        ua.expires_at = now + timedelta(days=plan_days.get(plan_type, 30))
        ua.tasks_used_today = 0
        ua.tokens_used_today = 0

        # Foydalanuvchini olish
        user_result = await session.execute(
            select(User).where(User.telegram_id == update.effective_user.id)
        )
        db_user = user_result.scalar_one_or_none()

        # Audit yozuvi
        tx = PaymentTransaction(
            user_id=db_user.id if db_user else ua.user_id,
            agent_id=ua.agent_id,
            amount=float(payment.total_amount),
            currency="XTR",
            payment_method="telegram_stars",
            tx_hash=payment.telegram_payment_charge_id,
            status="completed",
            plan_type=plan_type,
            completed_at=now,
        )
        session.add(tx)
        await session.commit()

    logger.info(
        f"Stars to'lov tasdiqlandi: user={update.effective_user.id}, "
        f"agent={user_agent_id}, charge_id={payment.telegram_payment_charge_id}"
    )

    await update.message.reply_text(
        f"✅ *To'lov qabul qilindi!*\n\n"
        f"💫 {payment.total_amount} Stars sarflandi.\n"
        f"🤖 Agent faollashtirildi — Mini App'ni oching!\n\n"
        f"📱 [ZAI'ni ochish]({MINI_APP_URL})",
        parse_mode="Markdown",
    )


# ============================================================
#  ADMIN BUYRUQLARI
# ============================================================

async def admin_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin uchun statistika."""
    settings = get_settings()
    if update.effective_user.id != settings.admin_telegram_id:
        await update.message.reply_text("⛔ Sizda ruxsat yo'q.")
        return

    async with async_session() as session:
        users_count = await session.execute(select(func.count(User.id)))
        total_users = users_count.scalar()

        agents_count = await session.execute(select(func.count(Agent.id)))
        total_agents = agents_count.scalar()

        tasks_count = await session.execute(select(func.count(Task.id)))
        total_tasks = tasks_count.scalar()

        tokens_result = await session.execute(
            select(func.coalesce(func.sum(Task.tokens_used), 0))
        )
        total_tokens = tokens_result.scalar()

        cost_result = await session.execute(
            select(func.coalesce(func.sum(Task.cost), 0.0))
        )
        total_cost = cost_result.scalar()

        users_result = await session.execute(
            select(User).order_by(User.created_at.desc()).limit(5)
        )
        recent_users = users_result.scalars().all()

    text = f"""
📊 *ZAI Admin Panel v2*

👥 Foydalanuvchilar: *{total_users}*
🤖 Agentlar: *{total_agents}*
📝 Topshiriqlar: *{total_tasks}*
🔤 Jami tokenlar: *{total_tokens:,}*
💰 Jami xarajat: *${total_cost:.4f}*

━━━━━━━━━━━━━━━━━━━
Oxirgi 5 foydalanuvchi:
"""
    for u in recent_users:
        text += f"• {u.first_name} (@{u.username}) — {u.created_at.strftime('%d.%m.%Y')}\n"

    await update.message.reply_text(text, parse_mode="Markdown")


# ============================================================
#  MENU BUTTON SOZLASH
# ============================================================

async def setup_menu_button(bot) -> None:
    """
    Barcha foydalanuvchilar uchun bot menu button'ini Mini App'ga sozlash.
    Foydalanuvchi bot bilan chatda doim 'ZAI ochish' tugmasini ko'radi.
    """
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="🤖 ZAI ochish",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        )
        logger.info("✅ Menu button sozlandi: 'ZAI ochish'")
    except Exception as e:
        logger.error(f"Menu button sozlashda xato: {e}")


# ============================================================
#  BOT SETUP
# ============================================================

def setup_bot() -> Application:
    """Telegram bot yaratish va handlerlarni ulash."""
    settings = get_settings()
    app = Application.builder().token(settings.telegram_bot_token).build()

    # Conversation handler — kontent yaratish flow
    content_conv = ConversationHandler(
        entry_points=[
            CallbackQueryHandler(create_content_start, pattern="^create_content$"),
        ],
        states={
            SELECTING_BUSINESS: [
                CallbackQueryHandler(business_selected, pattern="^biz_"),
                CallbackQueryHandler(back_to_menu, pattern="^back_to_menu$"),
            ],
            SELECTING_LANGUAGE: [
                CallbackQueryHandler(language_selected, pattern="^lang_"),
                CallbackQueryHandler(create_content_start, pattern="^create_content$"),
            ],
            ENTERING_TOPIC: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, topic_received),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", cancel),
            CommandHandler("start", start_command),
        ],
        per_user=True,
        per_chat=True,
    )

    # Asosiy handlerlar
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("stats", admin_stats))
    app.add_handler(content_conv)

    # Callback handlerlar
    app.add_handler(CallbackQueryHandler(how_it_works, pattern="^how_it_works$"))
    app.add_handler(CallbackQueryHandler(contact_admin, pattern="^contact_admin$"))
    app.add_handler(CallbackQueryHandler(list_agents_callback, pattern="^list_agents$"))
    app.add_handler(CallbackQueryHandler(back_to_menu, pattern="^back_to_menu$"))
    app.add_handler(CallbackQueryHandler(retry_same_topic, pattern="^retry_same$"))

    # Telegram Stars to'lov handlerlari
    app.add_handler(PreCheckoutQueryHandler(pre_checkout_handler))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment_handler))

    return app
