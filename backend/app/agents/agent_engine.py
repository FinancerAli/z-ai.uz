"""
ZAI Platform — Universal Agent Engine v3 🧠
Skill Pack Edition: domain packs, prompt injection himoyasi, SKILL.md asosida ishlaydi.
"""
import logging
import json
import os
from datetime import datetime, timezone, date
from openai import AsyncOpenAI
from sqlalchemy import select
from app.config import get_settings
from app.database import async_session
from app.models import Agent, AgentSkill, Task, UserAgent, Subscription, BrandProfile

logger = logging.getLogger(__name__)

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "..", "skills")

# Xavfli prompt injection so'zlar ro'yxati
_INJECTION_PATTERNS = [
    "oldingi qoidalarni unut",
    "forget previous",
    "ignore instructions",
    "system prompt",
    "ignore all",
    "jailbreak",
    "dan mode",
    "act as",
    "roleplaying",
]

PRICING = {
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "cx/gpt-5.5-xhigh": {"input": 0.15, "output": 0.60},
    "cx/gpt-5.5": {"input": 0.10, "output": 0.40},
}

ERROR_SANITIZED = "Server xatosi. Iltimos qayta urinib ko'ring yoki admin bilan bog'laning."


def _is_injection_attempt(text: str) -> bool:
    """User inputda prompt injection urinishi bor-yo'qligini tekshiradi."""
    lower = text.lower()
    return any(pattern in lower for pattern in _INJECTION_PATTERNS)


def _load_domain_context(agent_slug: str, context_data: dict | None) -> str | None:
    """
    Agent slug va context_data dagi 'domain' yoki 'audience' maydoniga qarab
    tegishli domain .md faylini topib qaytaradi.
    """
    if not context_data or not os.path.isdir(SKILLS_DIR):
        return None

    # Context'dan domain yoki audience belgisini olish
    domain_hint = (
        str(context_data.get("domain", ""))
        or str(context_data.get("industry", ""))
        or str(context_data.get("topic", ""))
    ).lower()

    if not domain_hint:
        return None

    # Agent papkasini topish
    for entry in os.listdir(SKILLS_DIR):
        if entry.startswith(agent_slug) and os.path.isdir(os.path.join(SKILLS_DIR, entry)):
            domains_dir = os.path.join(SKILLS_DIR, entry, "domains")
            if not os.path.isdir(domains_dir):
                return None

            domain_keywords = {
                "clinic": ["klinika", "clinic", "tibbiy", "medical", "doctor", "shifokor", "hospital"],
                "education": ["ta'lim", "kurs", "course", "ielts", "maktab", "school", "academy", "o'quv"],
                "restaurant": ["restoran", "restaurant", "cafe", "kafe", "ovqat", "food"],
                "ecommerce": ["online", "do'kon", "shop", "savdo", "product", "mahsulot"],
                "beauty": ["beauty", "salon", "kosmetik", "go'zallik", "nail"],
            }

            for domain_name, keywords in domain_keywords.items():
                if any(kw in domain_hint for kw in keywords):
                    domain_path = os.path.join(domains_dir, f"{domain_name}.md")
                    if os.path.exists(domain_path):
                        try:
                            with open(domain_path, encoding="utf-8") as f:
                                content = f.read().strip()
                            logger.info(f"Domain pack loaded: {domain_name} for agent {agent_slug}")
                            return f"# Domain konteksti: {domain_name}\n{content}"
                        except Exception as e:
                            logger.warning(f"Failed to load domain {domain_name}: {e}")
            break

    return None


def _calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    price = PRICING.get(model, PRICING["deepseek-chat"])
    return (prompt_tokens * price["input"] / 1_000_000) + (completion_tokens * price["output"] / 1_000_000)


def _reset_daily_if_needed(ua: UserAgent) -> None:
    """Agar yangi kun bo'lsa, daily hisoblagichni reset qilish."""
    today = date.today()
    last_date = ua.last_reset_at.date() if getattr(ua, 'last_reset_at', None) else (ua.started_at.date() if ua.started_at else None)
    if last_date and last_date < today:
        ua.tasks_used_today = 0
        ua.tokens_used_today = 0
        ua.last_reset_at = datetime.now(timezone.utc)


async def run_agent(
    agent_slug: str,
    user_id: str,
    input_text: str,
    context_data: dict | None = None,
) -> dict:
    """
    Agentni ishga tushirish. Yagona DB session, barcha operatsiyalar atomic.
    """
    settings = get_settings()

    # HARAKATLAR YAGONA SESSION ICHIDA
    async with async_session() as session:
        # 1. Agentni yuklash
        agent_result = await session.execute(
            select(Agent).where(Agent.slug == agent_slug, Agent.is_active == True)
        )
        agent = agent_result.scalar_one_or_none()
        if not agent:
            return {"error": "Agent topilmadi", "output": None, "tokens_used": 0, "cost": 0.0}

        # 2. UserAgent + limit tekshirish (bot/sinov uchun yumshoq)
        ua_result = await session.execute(
            select(UserAgent).where(
                UserAgent.user_id == user_id,
                UserAgent.agent_id == agent.id,
                UserAgent.status == "active",
            )
        )
        ua = ua_result.scalar_one_or_none()
        
        # Beta: agar user agent sotib olmagan bo'lsa, bepul sinov rejimi
        if not ua:
            sub_result = await session.execute(
                select(Subscription).where(
                    Subscription.user_id == user_id,
                    Subscription.status == "active",
                )
            )
            sub = sub_result.scalar_one_or_none()
            if not sub:
                # Yangi user — avtomatik free_beta obuna
                sub = Subscription(user_id=user_id, plan="free_beta", monthly_limit=10)
                session.add(sub)
                await session.flush()
            if sub.used_count >= sub.monthly_limit:
                return {"error": "Bepul limit tugagan. Agent sotib oling.", "output": None, "tokens_used": 0, "cost": 0.0}
        else:
            _reset_daily_if_needed(ua)
            if (ua.tasks_used_today or 0) >= agent.daily_limit:
                return {"error": "Kunlik limit tugagan", "output": None, "tokens_used": 0, "cost": 0.0}

        # 3. Skillarni yuklash
        skills_result = await session.execute(
            select(AgentSkill).where(AgentSkill.agent_id == agent.id)
        )
        skills = skills_result.scalars().all()

        # 3.5 Brand profile yuklash
        brand_result = await session.execute(
            select(BrandProfile).where(BrandProfile.user_id == user_id)
        )
        brand = brand_result.scalar_one_or_none()

        # 4. Task yaratish
        task = Task(
            user_id=user_id,
            agent_id=agent.id,
            input_text=input_text,
            status="running",
            context_data=json.dumps(context_data) if context_data else None,
        )
        session.add(task)
        await session.flush()

        # 5. System prompt yig'ish (SKILL.md asosida)
        system_prompt = agent.system_prompt or ""
        
        # Domain pack yuklash (skills/<slug>@*/domains/*.md)
        domain_context = _load_domain_context(agent.slug, context_data)
        if domain_context:
            system_prompt = system_prompt + "\n\n" + domain_context

        messages = [{"role": "system", "content": system_prompt}]
        for skill in skills:
            messages.append({
                "role": "system",
                "content": f"[SKILL: {skill.name}]\n{skill.content}",
            })

        # 6. Prompt Injection himoyasi — user inputni XML teglari orasiga o'rash
        raw_input = input_text
        if _is_injection_attempt(raw_input):
            logger.warning(f"Prompt injection detected for user {user_id}: {raw_input[:80]}")
            await _finalize_task(task.id, "failed", "Noto'g'ri so'rov")
            return {
                "error": "Ushbu so'rov xavfsizlik filtri tomonidan bloklandi.",
                "output": None, "tokens_used": 0, "cost": 0.0, "task_id": task.id,
            }

        user_message = f"<user_data>\n{raw_input}\n</user_data>"
        
        extra_data = []
        if brand:
            extra_data.append(f"--- BREND MA'LUMOTLARI ---\nNomi: {brand.business_name}\nSoha: {brand.industry}\nAuditoriya: {brand.target_audience}\nMahsulotlar: {brand.products_services}\nOhang: {brand.brand_tone}\nCTA: {brand.main_cta}\n--------------------------")
        if context_data:
            extra_data.append("\n".join(f"{k}: {v}" for k, v in context_data.items() if v))
            
        if extra_data:
            extra_str = "\n\n".join(extra_data)
            user_message = f"<context>\n{extra_str}\n</context>\n\n<user_data>\nTOPSHIRIQ: {raw_input}\n</user_data>"

        # 6. Commit task creation
        await session.commit()

    # === AI CHAQIRUV (session tashqarisida, lekin tezroq) ===
    if not settings.ai_api_key:
        await _finalize_task(task.id, "failed", ERROR_SANITIZED)
        return {
            "output": f"DEMO MODE\n\nAgent: {agent.name}\nTopshiriq: {input_text}\n\nAPI kaliti o'rnatilmagan.",
            "tokens_used": 0, "cost": 0.0, "task_id": task.id,
        }

    client = AsyncOpenAI(
        api_key=settings.ai_api_key,
        base_url=settings.ai_base_url,
    )

    try:
        response = await client.chat.completions.create(
            model=settings.ai_model,
            messages=messages + [{"role": "user", "content": user_message}],
            temperature=agent.temperature,
            max_tokens=agent.max_tokens_per_task,
        )

        output = response.choices[0].message.content
        prompt_t = response.usage.prompt_tokens if response.usage else 0
        comp_t = response.usage.completion_tokens if response.usage else 0
        tokens = prompt_t + comp_t
        cost = _calculate_cost(settings.ai_model, prompt_t, comp_t)

        await _finalize_task(task.id, "completed", None, output, tokens, cost)
        await _increment_usage(user_id, agent.id, tokens)

        return {
            "output": output,
            "tokens_used": tokens,
            "cost": round(cost, 6),
            "task_id": task.id,
        }

    except Exception as e:
        logger.error(f"Agent {agent_slug} API xatosi: {e}")
        await _finalize_task(task.id, "failed", ERROR_SANITIZED)
        return {
            "output": ERROR_SANITIZED,
            "tokens_used": 0,
            "cost": 0.0,
            "task_id": task.id,
        }


async def _finalize_task(
    task_id: str, status: str, error: str | None = None,
    output: str | None = None, tokens: int = 0, cost: float = 0.0,
):
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if task:
            task.status = status
            task.error_message = error
            task.output_text = output
            task.tokens_used = tokens
            task.cost = cost
            if status in ("completed", "done", "failed"):
                task.completed_at = datetime.now(timezone.utc)
            await session.commit()


async def _increment_usage(user_id: str, agent_id: str, tokens: int):
    async with async_session() as session:
        result = await session.execute(
            select(UserAgent).where(
                UserAgent.user_id == user_id,
                UserAgent.agent_id == agent_id,
                UserAgent.status == "active",
            )
        )
        ua = result.scalar_one_or_none()
        if ua:
            _reset_daily_if_needed(ua)
            ua.tasks_used_today = (ua.tasks_used_today or 0) + 1
            ua.tokens_used_today = (ua.tokens_used_today or 0) + tokens
        else:
            sub_result = await session.execute(
                select(Subscription).where(
                    Subscription.user_id == user_id,
                    Subscription.status == "active",
                )
            )
            sub = sub_result.scalar_one_or_none()
            if sub:
                sub.used_count = (sub.used_count or 0) + 1
        await session.commit()
