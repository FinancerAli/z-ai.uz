from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.models import User, BrandProfile
from app.api.deps import get_current_user

router = APIRouter(prefix="/brand-profile", tags=["brands"])

class BrandProfileCreate(BaseModel):
    business_name: str
    industry: str
    location: str | None = None
    target_audience: str
    products_services: str
    price_range: str | None = None
    unique_selling_points: str | None = None
    brand_tone: str
    main_cta: str
    social_links: str | None = None
    banned_words: str | None = None
    preferred_phrases: str | None = None
    additional_context: str | None = None

class BrandProfileResponse(BrandProfileCreate):
    id: str

@router.get("", response_model=BrandProfileResponse | None)
async def get_brand_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the current user's brand profile."""
    result = await db.execute(select(BrandProfile).where(BrandProfile.user_id == user.id))
    profile = result.scalars().first()
    
    if not profile:
        return None
        
    return profile

@router.post("", response_model=BrandProfileResponse)
async def create_brand_profile(
    profile_data: BrandProfileCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create or update a brand profile for the current user."""
    # MVP: 1 user = 1 brand profile.
    result = await db.execute(select(BrandProfile).where(BrandProfile.user_id == user.id))
    profile = result.scalars().first()
    
    if profile:
        # Update existing
        for key, value in profile_data.model_dump().items():
            setattr(profile, key, value)
    else:
        # Create new
        profile = BrandProfile(
            user_id=user.id,
            **profile_data.model_dump()
        )
        db.add(profile)
        
    await db.commit()
    await db.refresh(profile)
    return profile
