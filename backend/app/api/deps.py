from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.models import User
from app.core.security import decode_access_token
from app.config import get_settings

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.status != "active":
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Foydalanuvchini tokenidan aniqlash; tokensiz None qaytaradi (analytics uchun)."""
    if credentials is None:
        return None
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user or user.status != "active":
        return None
    return user


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Admin (is_admin=true) yoki super admin."""
    settings = get_settings()
    if not (user.is_admin or user.telegram_id == settings.admin_telegram_id):
        raise HTTPException(status_code=403, detail="Admin ruxsati kerak")
    return user


async def require_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Faqat super admin (env ADMIN_TELEGRAM_ID)."""
    settings = get_settings()
    if user.telegram_id != settings.admin_telegram_id:
        raise HTTPException(status_code=403, detail="Super admin ruxsati kerak")
    return user
