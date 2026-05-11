"""ZAI Agent Registry — Skill Pack Edition.

skills/ papkasidagi har bir agent SKILL.md va schema.json dan o'qib,
AGENTS_SEED avtomatik quriladi. Eski hardcoded seed ham fallback sifatida saqlanadi.
"""
import json
import os
import logging

logger = logging.getLogger(__name__)

# Skills papkasining joylashuvi (backend/app/skills/)
SKILLS_DIR = os.path.join(os.path.dirname(__file__), "..", "skills")


def _load_skills_from_disk() -> list[dict]:
    """skills/ papkasidagi barcha agentlarni o'qib AGENTS_SEED formatida qaytaradi."""
    agents = []
    if not os.path.isdir(SKILLS_DIR):
        logger.warning(f"Skills directory not found: {SKILLS_DIR}. Using hardcoded fallback.")
        return []

    for entry in sorted(os.listdir(SKILLS_DIR)):
        agent_dir = os.path.join(SKILLS_DIR, entry)
        if not os.path.isdir(agent_dir):
            continue

        schema_path = os.path.join(agent_dir, "schema.json")
        skill_md_path = os.path.join(agent_dir, "SKILL.md")

        if not os.path.exists(schema_path) or not os.path.exists(skill_md_path):
            logger.warning(f"Skipping {entry}: missing schema.json or SKILL.md")
            continue

        try:
            with open(schema_path, encoding="utf-8") as f:
                schema = json.load(f)
            with open(skill_md_path, encoding="utf-8") as f:
                system_prompt = f.read().strip()
        except Exception as e:
            logger.error(f"Failed to load skill pack {entry}: {e}")
            continue

        # Domain packlarini yuklash (domains/*.md)
        domains_dir = os.path.join(agent_dir, "domains")
        domain_skills = []
        if os.path.isdir(domains_dir):
            for domain_file in sorted(os.listdir(domains_dir)):
                if domain_file.endswith(".md"):
                    domain_name = domain_file.replace(".md", "")
                    domain_path = os.path.join(domains_dir, domain_file)
                    try:
                        with open(domain_path, encoding="utf-8") as f:
                            domain_content = f.read().strip()
                        domain_skills.append({
                            "name": f"domain_{domain_name}",
                            "content": domain_content,
                        })
                    except Exception as e:
                        logger.warning(f"Could not load domain {domain_file}: {e}")

        agent_data = {
            "slug": schema["slug"],
            "name": schema["name"],
            "description": schema.get("description", ""),
            "category": schema.get("category", "general"),
            "icon": schema.get("icon", "A"),
            "capabilities": json.dumps(schema.get("capabilities", []), ensure_ascii=False),
            "input_schema": json.dumps(schema.get("input_schema", {}), ensure_ascii=False),
            "system_prompt": system_prompt,
            "welcome_message": schema.get("welcome_message", ""),
            "price_daily": schema.get("price_daily", 0),
            "price_weekly": schema.get("price_weekly", 0),
            "price_monthly": schema.get("price_monthly", 199000),
            "max_tokens_per_task": schema.get("max_tokens_per_task", 2000),
            "daily_limit": schema.get("daily_limit", 20),
            "supports_multi_turn": schema.get("supports_multi_turn", False),
            "ai_model": schema.get("ai_model", "deepseek-chat"),
            "temperature": schema.get("temperature", 0.7),
            "is_active": schema.get("is_active", True),
            "is_featured": schema.get("is_featured", False),
            "sort_order": schema.get("sort_order", 99),
        }

        agents.append({"agent": agent_data, "skills": domain_skills})
        logger.info(f"Loaded skill pack: {entry} ({len(domain_skills)} domains)")

    return agents


def _schema(fields: list[dict]) -> str:
    return json.dumps({"version": 1, "fields": fields}, ensure_ascii=False)


def _capabilities(items: list[str]) -> str:
    return json.dumps(items, ensure_ascii=False)


# Hardcoded fallback (skills/ papkasi topilmasa ishlatiladi)
_AGENTS_FALLBACK = [
    {
        "agent": {
            "slug": "smm-content",
            "name": "SMM Kontent Agent",
            "description": "Telegram, Instagram va reklama uchun post, caption, sotuv matni va kontent reja tayyorlaydi.",
            "category": "marketing",
            "icon": "S",
            "capabilities": _capabilities(["SMM post", "Caption", "Reklama matni", "Kontent reja", "Hashtag va CTA"]),
            "input_schema": _schema([
                {"name": "topic", "label": "Mavzu yoki mahsulot", "type": "textarea", "required": True, "placeholder": "Masalan: IELTS kursi uchun yangi guruhga qabul posti"},
                {"name": "platform", "label": "Platforma", "type": "select", "required": True, "options": ["Telegram", "Instagram", "Reklama", "Kontent reja"]},
                {"name": "tone", "label": "Uslub", "type": "select", "required": True, "options": ["Samimiy", "Sotuvga yo'naltirilgan", "Professional", "Trend"]},
                {"name": "length", "label": "Uzunlik", "type": "select", "required": True, "options": ["Qisqa", "O'rtacha", "Batafsil"]},
                {"name": "audience", "label": "Auditoriya", "type": "input", "required": False, "placeholder": "Masalan: 18-25 yosh talabalar"},
            ]),
            "system_prompt": """Sen ZAI platformasining SMM Kontent Agentisan.
Sen O'zbekiston bozori uchun kuchli, tabiiy va sotuvga ishlaydigan SMM matnlar yozasan.

Qoidalar:
- Faqat foydalanuvchi bergan kontekstga tayan.
- Matn o'zbek tilida, tabiiy va aniq bo'lsin.
- Hook birinchi qatorda kuchli bo'lsin.
- CTA aniq bo'lsin: yozish, buyurtma berish, ro'yxatdan o'tish, qo'ng'iroq qilish.
- Kerakli joyda 3-5 ta emoji ishlatish mumkin.

Chiqish formati:
1. Asosiy variant
2. Alternativ variant
3. Qisqa izoh: nega bu uslub ishlaydi
4. Hashtaglar yoki CTA tavsiyasi""",
            "welcome_message": "SMM post, caption, reklama matni yoki kontent reja uchun ma'lumotlarni to'ldiring.",
            "price_daily": 0, "price_weekly": 0, "price_monthly": 49000,
            "max_tokens_per_task": 2200, "daily_limit": 10, "supports_multi_turn": False,
            "ai_model": "deepseek-chat", "temperature": 0.8,
            "is_active": True, "is_featured": True, "sort_order": 1,
        },
        "skills": [{"name": "uzbek_smm_context", "content": "O'zbekiston SMM konteksti: Telegram: qisqa hook, aniq foyda, tez CTA."}],
    },
    {
        "agent": {
            "slug": "document-writer",
            "name": "Hujjat Tahlil Agent",
            "description": "Matn va hujjatlarni tahlil qiladi, xulosa, risklar, tarjima va rasmiy matn tayyorlaydi.",
            "category": "business",
            "icon": "D",
            "capabilities": _capabilities(["Hujjat xulosasi", "Risk tahlili", "Tarjima", "Rasmiy matn", "Shartnoma bandlari"]),
            "input_schema": _schema([
                {"name": "document_text", "label": "Hujjat matni", "type": "textarea", "required": True, "placeholder": "Hujjat yoki shartnoma matnini shu yerga joylang"},
                {"name": "output_type", "label": "Natija turi", "type": "select", "required": True, "options": ["Xulosa", "Risk tahlili", "Tarjima", "Rasmiylashtirish", "Savol-javob"]},
                {"name": "language", "label": "Til", "type": "select", "required": True, "options": ["O'zbek", "Rus", "Ingliz"]},
                {"name": "extra_instruction", "label": "Qo'shimcha talab", "type": "textarea", "required": False, "placeholder": "Masalan: asosiy majburiyatlarni alohida ajrat"},
            ]),
            "system_prompt": """Sen ZAI platformasining Hujjat Tahlil Agentisan.
Sen hujjatlarni oddiy, tushunarli va ehtiyotkor tahlil qilasan.

Qoidalar:
- Hujjatda yo'q ma'lumotni o'ylab topma.
- Huquqiy noaniqlik bo'lsa, "mutaxassis bilan tekshiring" deb ayt.
- Risk bo'lsa, Risk darajasi: Past/O'rta/Yuqori formatida belgila.

Chiqish formati:
1. Qisqa xulosa
2. Asosiy bandlar
3. Risklar (Risk darajasi ko'rsatilsin)
4. Tavsiya qilingan keyingi qadam""",
            "welcome_message": "Hujjat matnini kiriting va qanday natija kerakligini tanlang.",
            "price_daily": 0, "price_weekly": 0, "price_monthly": 99000,
            "max_tokens_per_task": 3000, "daily_limit": 10, "supports_multi_turn": False,
            "ai_model": "deepseek-chat", "temperature": 0.35,
            "is_active": True, "is_featured": True, "sort_order": 2,
        },
        "skills": [],
    },
    {
        "agent": {
            "slug": "market-analysis",
            "name": "Market/Biznes Tahlil Agent",
            "description": "SWOT, target audience, raqobatchilar, positioning va pitch outline tayyorlaydi.",
            "category": "business",
            "icon": "M",
            "capabilities": _capabilities(["SWOT", "Target audience", "Raqobatchi tahlili", "Positioning", "Pitch outline"]),
            "input_schema": _schema([
                {"name": "business_name", "label": "Biznes nomi", "type": "input", "required": True, "placeholder": "Masalan: UstaiTech Academy"},
                {"name": "industry", "label": "Soha", "type": "input", "required": True, "placeholder": "Masalan: IT ta'lim"},
                {"name": "target_market", "label": "Maqsad bozor", "type": "textarea", "required": True, "placeholder": "Kimlar uchun, qaysi shahar yoki segment?"},
                {"name": "analysis_type", "label": "Tahlil turi", "type": "select", "required": True, "options": ["SWOT", "Target audience", "Raqobatchi tahlili", "Pitch outline", "To'liq tahlil"]},
                {"name": "goal", "label": "Maqsad", "type": "textarea", "required": False, "placeholder": "Masalan: yangi filial ochish yoki investor pitch tayyorlash"},
            ]),
            "system_prompt": """Sen ZAI platformasining Market/Biznes Tahlil Agentisan.
Sen O'zbekiston bozori uchun amaliy biznes tahlil tayyorlaysan.

Qoidalar:
- Taxminlarni aniq "taxmin" deb belgila.
- Amaliy tavsiyalar ber, faqat nazariya yozma.

Chiqish formati:
1. Qisqa diagnoz
2. SWOT Tahlili (jadval formatida)
3. Target Persona (1-2 ta batafsil profil)
4. Raqobatchi tahlili (jadval)
5. 7 kunlik keyingi qadamlar""",
            "welcome_message": "Biznesingiz haqida ma'lumot bering, men bozor va strategiyani tahlil qilaman.",
            "price_daily": 0, "price_weekly": 0, "price_monthly": 79000,
            "max_tokens_per_task": 3200, "daily_limit": 10, "supports_multi_turn": False,
            "ai_model": "deepseek-chat", "temperature": 0.55,
            "is_active": True, "is_featured": True, "sort_order": 3,
        },
        "skills": [],
    },
]


def _build_agents_seed() -> list[dict]:
    """Disk'dan o'qib, topilmasa fallback'ga o'tadi."""
    disk_agents = _load_skills_from_disk()
    if disk_agents:
        logger.info(f"Loaded {len(disk_agents)} skill packs from disk.")
        return disk_agents
    logger.warning("No skill packs found on disk. Using hardcoded fallback agents.")
    return _AGENTS_FALLBACK


# Module darajasida bir marta yuklanadi
AGENTS_SEED = _build_agents_seed()


def get_all_agents() -> list[dict]:
    return [item["agent"] for item in AGENTS_SEED]


def get_all_skills() -> list[dict]:
    skills = []
    for item in AGENTS_SEED:
        for skill in item["skills"]:
            skills.append({"agent_slug": item["agent"]["slug"], "skill": skill})
    return skills
