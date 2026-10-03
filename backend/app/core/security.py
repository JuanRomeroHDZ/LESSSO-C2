import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.db.models.user import UserModel

# Configuraciones de Seguridad
# En producción, SECRET_KEY debe venir del entorno. Para dev local, usamos un fallback seguro.
SECRET_KEY = os.getenv("SECRET_KEY", "b3a2918b9588b39a48dc704c3e80eb0b3d681023a84b162624a938c11e500732")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12  # 12 horas para sesiones de auditoría

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# URL donde el frontend enviará las credenciales
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db)
) -> UserModel:
    """
    Dependencia de FastAPI. Si una ruta la incluye, exige un JWT válido
    y devuelve el objeto del usuario autenticado.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="La sesión ha expirado"
        )
    except jwt.InvalidTokenError:
        raise credentials_exception

    result = await db.execute(select(UserModel).where(UserModel.username == username))
    user = result.scalars().first()
    
    if user is None or not user.is_active:
        raise credentials_exception
        
    return user
