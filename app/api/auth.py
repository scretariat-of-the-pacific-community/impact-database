from datetime import datetime, timedelta
from typing import Optional

import os
import secrets
import logging

from fastapi import Depends, HTTPException, status, APIRouter
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session
from models.database import get_db

logger = logging.getLogger(__name__)

# Configuration via environment variables
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        raise ValueError("SECRET_KEY must be set in production")
    
    # Development: Persist SECRET_KEY to .env.local if it doesn't exist
    secret_key_file = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
    try:
        if os.path.exists(secret_key_file):
            # Read existing key from .env.local
            with open(secret_key_file, "r") as f:
                for line in f:
                    if line.startswith("SECRET_KEY="):
                        SECRET_KEY = line.split("=", 1)[1].strip()
                        logger.info("Loaded SECRET_KEY from .env.local")
                        break
        
        if not SECRET_KEY:
            # Generate and save new key
            SECRET_KEY = secrets.token_urlsafe(32)
            with open(secret_key_file, "a") as f:
                f.write(f"\nSECRET_KEY={SECRET_KEY}\n")
            logger.warning(f"Generated new SECRET_KEY and saved to {secret_key_file}")
    except Exception as e:
        # Fallback if file operations fail
        SECRET_KEY = secrets.token_urlsafe(32)
        logger.warning(f"Failed to persist SECRET_KEY ({e}), using ephemeral key for this session")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class User(BaseModel):
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    disabled: Optional[bool] = None
    id: Optional[str] = None


class UserInDB(User):
    hashed_password: str


# Database integration
def get_user_from_db(username: str, db: Session):
    """Get user from database using injected session.
    
    Args:
        username: Username to look up
        db: Database session (dependency injected)
    
    Returns:
        UserInDB if found and active, None otherwise
    """
    from models.rbac import User as DBUser
    
    try:
        db_user = db.query(DBUser).filter(DBUser.username == username).first()
        if db_user and db_user.is_active:
            return UserInDB(
                username=db_user.username,
                email=db_user.email,
                full_name=db_user.full_name,
                id=str(db_user.id),
                disabled=not db_user.is_active,
                hashed_password=db_user.hashed_password or ""
            )
    except Exception as e:
        logger.error(f"Database user lookup failed: {e}")
    return None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(username: str, password: str, db: Session) -> Optional[UserInDB]:
    """Authenticate user with username and password.
    
    Args:
        username: Username to authenticate
        password: Plain text password
        db: Database session (dependency injected)
    
    Returns:
        UserInDB if authentication successful, None otherwise
    """
    user = get_user_from_db(username, db)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login endpoint - returns JWT token for authentication"""
    user = authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(login_data: LoginRequest):
    """Login endpoint that accepts JSON credentials"""
    user = authenticate_user(login_data.username, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "id": getattr(user, "id", user.username),
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name
    }


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token.
    
    SECURITY: No dev bypass! All environments require valid authentication.
    Use seeded test users or feature flags for testing.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = get_user_from_db(token_data.username, db)
    if user is None:
        raise credentials_exception
    return user


@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information"""
    return current_user
