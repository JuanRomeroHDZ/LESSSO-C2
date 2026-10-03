from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models.user import UserModel
from app.core.security import verify_password, get_password_hash, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter()

class UserCreate(BaseModel):
    username: str
    password: str

@router.post("/setup")
async def setup_initial_user(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # 1. Verificar si ya existe ALGUN usuario en el sistema
    result = await db.execute(select(UserModel))
    if result.scalars().first() is not None:
        raise HTTPException(status_code=400, detail="El sistema ya ha sido inicializado.")
    
    # 2. Crear el usuario maestro (solo enviamos lo que el modelo soporta)
    hashed_password = get_password_hash(user_in.password)
    new_user = UserModel(
        username=user_in.username,
        hashed_password=hashed_password,
        is_active=True
    )
    db.add(new_user)
    await db.commit()
    return {"message": "Operador maestro creado exitosamente"}

@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserModel).where(UserModel.username == form_data.username))
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
