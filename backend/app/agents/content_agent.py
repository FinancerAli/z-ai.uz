"""
ZAI — Content Agent (Legacy wrapper)
Endi agent_engine ga yo'naltiradi.
"""
from app.agents.agent_engine import run_agent

# Eski kod bilan moslik uchun
BUSINESS_CONTEXTS = {
    "ielts": "IELTS/Til markazi konteksti",
    "beauty": "Go'zallik saloni konteksti",
    "it_course": "IT kurslar konteksti",
    "clinic": "Klinika konteksti",
    "ecommerce": "Online do'kon konteksti",
    "restaurant": "Restoran/Kafe konteksti",
    "other": "Umumiy biznes konteksti",
}


async def generate_content(
    topic: str,
    business_type: str = "other",
    language: str = "uz",
    platform: str = "telegram",
    tone: str = "friendly",
) -> dict:
    """
    Eski interfeys — yangi agent_engine orqali ishlaydi.
    """
    result = await run_agent(
        agent_slug="smm-content",
        user_id="legacy-bot",
        input_text=topic,
        context_data={
            "business_type": business_type,
            "language": language,
            "platform": platform,
            "tone": tone,
        },
    )

    if result.get("error"):
        return {"content": result["output"], "tokens": 0, "cost": 0.0}

    return {
        "content": result["output"],
        "tokens": result.get("tokens_used", 0),
        "cost": result.get("cost", 0.0),
    }
