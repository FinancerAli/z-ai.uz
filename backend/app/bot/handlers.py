"""
ZAI Telegram Bot — Handlers v2
Foydalanuvchi bilan muloqot + Agent tizimi integratsiyasi.
"""
import logging
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ConversationHandler,
    filters,
    ContextTypes,
)
from app.config import get_settings
from app.database import async_session
from app.models import User, Task, Agent
from app.agents.agent_engine import run_agent
from sqlalchemy import select, func

logger = logging.getLogger(__name__)

# ======== Conversation States ========
(
    SELECTING_AGENT,
    SELECTING_BUSINESS,
    SELECTING_LANGUAGE,
    ENTERING_TOPIC,
    WAITING_CONTENT,
) = range(5)


# ======== /start — Kirish ========
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Bot ishga tushganda chiqadigan xabar."""
    user = update.effective_user

    # Foydalanuvchini bazaga saqlash
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == user.id)
        )
        db_user = result.scalar_one_or_none()

        if not db_user:
            db_user = User(
                telegram_id=user.id,
                first_name=user.first_name or "",
                last_name=user.last_name or "",
                username=user.username or "",
            )
            session.add(db_user)
            await session.commit()

    welcome_text = f"""
🤖 *Salom, {user.first_name}!*

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
        [InlineKeyboardButton("📝 Kontent yaratish", web_app=__import__("telegram").WebAppInfo(url="https://zai.ustaitech.uz/"))],
        [InlineKeyboardButton("🤖 Barcha agentlar", callback_data="list_agents")],
        [InlineKeyboardButton("ℹ️ Qanday ishlaydi?", callback_data="how_it_works")],
        [InlineKeyboardButton("💬 Admin bilan bog'lanish", callback_data="contact_admin")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        welcome_text,
        parse_mode="Markdown",
        reply_markup=reply_markup,
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

    keyboard = [
        [InlineKeyboardButton("🏠 Bosh menyu", callback_data="back_to_menu")],
    ]
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
        [InlineKeyboardButton("📝 Kontent yaratish", web_app=__import__("telegram").WebAppInfo(url="https://zai.ustaitech.uz/"))],
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
    keyboard = [
        [InlineKeyboardButton("◀️ Orqaga", callback_data="back_to_menu")],
    ]
    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ======== Bosh menyuga qaytish ========
async def back_to_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    text = "🤖 *ZAI — Bosh menyu*\n\nNima qilmoqchisiz?"
    keyboard = [
        [InlineKeyboardButton("📝 Kontent yaratish", web_app=__import__("telegram").WebAppInfo(url="https://zai.ustaitech.uz/"))],
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
    """Mavzu keldi → Agent ishga tushadi."""
    topic = update.message.text
    context.user_data["topic"] = topic

    business_type = context.user_data.get("business_type", "other")
    language = context.user_data.get("language", "uz")

    # Loading xabar
    loading_msg = await update.message.reply_text(
        "🧠 *ZAI ishlamoqda...*\n\n⏳ 3 ta variant tayyorlanmoqda\n_(10-20 soniya kutib turing)_",
        parse_mode="Markdown",
    )

    # Foydalanuvchini olish
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == update.effective_user.id)
        )
        db_user = result.scalar_one_or_none()
        user_id = db_user.id if db_user else "bot-user"

    # Agent engine orqali ishga tushirish
    agent_result = await run_agent(
        agent_slug="smm-content",
        user_id=user_id,
        input_text=topic,
        context_data={
            "business_type": business_type,
            "language": language,
            "platform": "telegram",
            "tone": "friendly",
        },
    )

    # Loading xabarni o'chirish
    try:
        await loading_msg.delete()
    except Exception:
        pass

    # Natijani yuborish
    content = agent_result.get("output", "Xatolik yuz berdi")
    tokens = agent_result.get("tokens_used", 0)
    cost = agent_result.get("cost", 0.0)

    # Statistika footer
    footer = f"""

━━━━━━━━━━━━━━━━━━━
📊 Token: {tokens} | 💰 ${cost:.6f}
🤖 Agent: SMM Content | ZAI Platform v2
"""

    # Xabar uzunligi
    full_text = content + footer
    if len(full_text) > 4000:
        await update.message.reply_text(content[:4000])
        await update.message.reply_text(content[4000:] + footer)
    else:
        await update.message.reply_text(full_text)

    # Keyingi harakat tugmalari
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
    """Xuddi shu mavzuda qayta yaratish."""
    query = update.callback_query
    await query.answer()

    topic = context.user_data.get("topic", "")
    business_type = context.user_data.get("business_type", "other")
    language = context.user_data.get("language", "uz")

    if not topic:
        await query.edit_message_text("Avval mavzu kiriting. /start bosing.")
        return

    await query.edit_message_text(
        "🧠 *ZAI qayta ishlamoqda...*\n⏳ Yangi variantlar tayyorlanmoqda...",
        parse_mode="Markdown",
    )

    result = await run_agent(
        agent_slug="smm-content",
        user_id="bot-user",
        input_text=topic,
        context_data={
            "business_type": business_type,
            "language": language,
            "platform": "telegram",
            "tone": "friendly",
        },
    )

    content = result.get("output", "Xatolik")
    footer = f"\n━━━━━━━━━━━━━━━━━━━\n📊 Token: {result.get('tokens_used', 0)} | 💰 ${result.get('cost', 0):.6f}"

    await query.edit_message_text(content + footer)

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


# ======== Admin buyruqlari (tuzatilgan) ========
async def admin_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin uchun statistika — Task modelidan foydalanadi."""
    settings = get_settings()
    if update.effective_user.id != settings.admin_telegram_id:
        await update.message.reply_text("⛔ Sizda ruxsat yo'q.")
        return

    async with async_session() as session:
        # Foydalanuvchilar soni
        users_count = await session.execute(select(func.count(User.id)))
        total_users = users_count.scalar()

        # Agentlar soni
        agents_count = await session.execute(select(func.count(Agent.id)))
        total_agents = agents_count.scalar()

        # Topshiriqlar statistikasi
        tasks_count = await session.execute(select(func.count(Task.id)))
        total_tasks = tasks_count.scalar()

        tokens_result = await session.execute(select(func.coalesce(func.sum(Task.tokens_used), 0)))
        total_tokens = tokens_result.scalar()

        cost_result = await session.execute(select(func.coalesce(func.sum(Task.cost), 0.0)))
        total_cost = cost_result.scalar()

        # Oxirgi foydalanuvchilar
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

    # Handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("stats", admin_stats))
    app.add_handler(content_conv)

    # Callback handlers
    app.add_handler(CallbackQueryHandler(how_it_works, pattern="^how_it_works$"))
    app.add_handler(CallbackQueryHandler(contact_admin, pattern="^contact_admin$"))
    app.add_handler(CallbackQueryHandler(list_agents_callback, pattern="^list_agents$"))
    app.add_handler(CallbackQueryHandler(back_to_menu, pattern="^back_to_menu$"))
    app.add_handler(CallbackQueryHandler(retry_same_topic, pattern="^retry_same$"))

    return app
