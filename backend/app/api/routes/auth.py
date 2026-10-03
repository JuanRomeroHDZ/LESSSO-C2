from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.db.models.user import UserModel
from app.core.security import (
    verify_password, 
    get_password_hash,
    create_access_token, 
    ACCESS_TOKEN_EXPIRE_MINUTES
)

router = APIRouter(prefix="/auth", tags=["auth"])

class SetupRequest(BaseModel):
    username: str
    password: str

@router.post("/setup")
async def initial_setup(data: SetupRequest, db: AsyncSession = Depends(get_db)):
    """
    Endpoint temporal de Bootstrap. 
    Solo funciona si la tabla de usuarios está vacía.
    """
    result = await db.execute(select(UserModel).limit(1))
    existing_user = result.scalars().first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El sistema ya ha sido inicializado. Usa el endpoint de login."
        )
        
    new_user = UserModel(
        username=data.username,
        hashed_password=get_password_hash(data.password)
    )
    db.add(new_user)
    await db.commit()
    
    return {"status": "success", "message": f"Usuario {data.username} creado correctamente."}

@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    """
    Recibe las credenciales (form-data) y devuelve el JWT de sesión.
    """
    result = await db.execute(select(UserModel).where(UserModel.username == form_data.username))
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}
