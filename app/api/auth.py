from datetime import datetime, timedelta
from typing import Optional, Dict
from collections import defaultdict

import os
import secrets
import logging
import time

from fastapi import Depends, HTTPException, status, APIRouter, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session
from models.database import get_db
from workers.email_tasks import send_welcome_email

logger = logging.getLogger(__name__)

# SECURITY FIX: Redis-backed rate limiter for persistent, distributed rate limiting
# This replaces in-memory storage which resets on restart and doesn't work across workers

def get_redis_client():
    """Get Redis client for rate limiting"""
    import redis
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_db = int(os.getenv("REDIS_DB", "0"))
    
    try:
        client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        # Test connection
        client.ping()
        return client
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Falling back to in-memory rate limiting.")
        return None

# Fallback in-memory storage if Redis is unavailable
rate_limit_storage: Dict[str, list] = defaultdict(list)
RATE_LIMIT_WINDOW = 900  # 15 minutes (for auth endpoints)
RATE_LIMIT_MAX_ATTEMPTS = 5  # Max attempts for auth endpoints

# Upload-specific rate limits
UPLOAD_RATE_LIMIT_WINDOW = 3600  # 1 hour
UPLOAD_RATE_LIMIT_MAX_ATTEMPTS = 10  # 10 uploads per hour


def check_rate_limit(identifier: str, custom_window: int = None, custom_max: int = None) -> None:
    """Check if identifier has exceeded rate limit.
    
    Uses Redis for persistent, distributed rate limiting. Falls back to in-memory if Redis unavailable.

    Args:
        identifier: IP address or username to check
        custom_window: Optional custom time window in seconds
        custom_max: Optional custom maximum attempts

    Raises:
        HTTPException: If rate limit exceeded
    """
    # Use upload limits if identifier starts with 'upload:'
    if identifier.startswith("upload:"):
        window = custom_window or UPLOAD_RATE_LIMIT_WINDOW
        max_attempts = custom_max or UPLOAD_RATE_LIMIT_MAX_ATTEMPTS
    else:
        window = custom_window or RATE_LIMIT_WINDOW
        max_attempts = custom_max or RATE_LIMIT_MAX_ATTEMPTS

    # Try Redis first
    redis_client = get_redis_client()
    if redis_client:
        try:
            key = f"rate_limit:{identifier}"
            current = redis_client.get(key)
            
            if current and int(current) >= max_attempts:
                ttl = redis_client.ttl(key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Please try again in {max(ttl, 0)} seconds.",
                    headers={"Retry-After": str(max(ttl, 0))}
                )
            
            # Increment counter with expiration
            pipe = redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, window)
            pipe.execute()
            return
        except Exception as e:
            logger.warning(f"Redis rate limit check failed: {e}. Using in-memory fallback.")
    
    # Fallback to in-memory rate limiting
    now = time.time()
    # Clean old attempts
    rate_limit_storage[identifier] = [
        timestamp for timestamp in rate_limit_storage[identifier] if now - timestamp < window
    ]

    # Check limit
    if len(rate_limit_storage[identifier]) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Please try again in {window // 60} minutes.",
        )

    # Record attempt
    rate_limit_storage[identifier].append(now)


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
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")
)  # 7 days default

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
        username: Username or email to look up
        db: Database session (dependency injected)

    Returns:
        UserInDB if found and active, None otherwise
    """
    from models.rbac import User as DBUser
    from sqlalchemy import or_

    try:
        # Look up user by username OR email
        db_user = (
            db.query(DBUser)
            .filter(or_(DBUser.username == username, DBUser.email == username))
            .first()
        )
        if db_user and db_user.is_active:
            return UserInDB(
                username=db_user.username,
                email=db_user.email,
                full_name=db_user.full_name,
                id=str(db_user.id),
                disabled=not db_user.is_active,
                hashed_password=db_user.hashed_password or "",
            )
    except Exception as e:
        logger.error(f"Database user lookup failed: {e}")
    return None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(username: str, password: str, db: Session) -> Optional[UserInDB]:
    """Authenticate user with username/email and password.

    Args:
        username: Username or email to authenticate
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
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login endpoint - returns JWT token for authentication"""
    # Rate limiting by username and IP
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"token:{form_data.username}")
    check_rate_limit(f"token_ip:{client_ip}")
    user = authenticate_user(form_data.username, form_data.password, db)
    if not user:
        # Generic error message to prevent username enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
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
async def login(
    request: Request, response: Response, login_data: LoginRequest, db: Session = Depends(get_db)
):
    """Login endpoint that accepts JSON credentials and sets HttpOnly cookie"""
    # Rate limiting by username and IP
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"login:{login_data.username}")
    check_rate_limit(f"login_ip:{client_ip}")
    user = authenticate_user(login_data.username, login_data.password, db)
    if not user:
        # Generic error message to prevent username enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last_login in admin_users table if exists
    try:
        from services.admin_service import AdminUser
        admin_user = db.query(AdminUser).filter(
            (AdminUser.username == user.username) | (AdminUser.email == user.email)
        ).first()
        if admin_user:
            admin_user.last_login = datetime.utcnow()
            admin_user.failed_login_attempts = 0
            db.commit()
    except Exception as e:
        logger.warning(f"Could not update admin_users last_login: {e}")
        # Continue with login even if admin_users update fails
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    # SECURITY: Set HttpOnly cookie server-side to prevent XSS attacks
    is_secure = request.url.scheme == "https"
    environment = os.getenv("ENVIRONMENT", "development").lower()
    # Prefer strict SameSite in production; allow lax in development for local cross-origin flows
    samesite_policy = "strict" if environment == "production" else "lax"

    response.set_cookie(
        key="ocean_portal_token",
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # Same as token expiration
        path="/",
        httponly=True,  # Prevent JavaScript access
        secure=is_secure,  # HTTPS only in production
        samesite=samesite_policy,  # CSRF protection with dev-friendly policy
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "id": getattr(user, "id", user.username),
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
    }


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None


@router.post("/register")
async def register(request: Request, register_data: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account"""
    # Rate limiting by email and IP
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"register:{register_data.email}")
    check_rate_limit(f"register_ip:{client_ip}")
    from models.rbac import User as DBUser, Role
    import re

    # Validate password strength
    if len(register_data.password) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 12 characters long",
        )
    if not re.search(r"[a-z]", register_data.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain lowercase letters",
        )
    if not re.search(r"[A-Z]", register_data.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain uppercase letters",
        )
    if not re.search(r"\d", register_data.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain numbers"
        )
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', register_data.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain special characters",
        )

    # Check if username already exists
    existing_user = db.query(DBUser).filter(DBUser.username == register_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already registered"
        )

    # Check if email already exists
    existing_email = db.query(DBUser).filter(DBUser.email == register_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already registered"
        )

    # Get default role (contributor)
    default_role = db.query(Role).filter(Role.name == "contributor").first()
    if not default_role:
        # Fallback: create contributor role if it doesn't exist
        default_role = Role(
            name="contributor",
            display_name="Contributor",
            description="Can upload and manage own content",
            level=1,
            is_system_role=False,
        )
        db.add(default_role)
        db.flush()

    # Create new user
    hashed_password = pwd_context.hash(register_data.password)
    new_user = DBUser(
        username=register_data.username,
        email=register_data.email,
        full_name=register_data.full_name or register_data.username,
        hashed_password=hashed_password,
        is_active=True,
        role_id=default_role.id,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send welcome email asynchronously
    try:
        send_welcome_email.delay(
            user_id=str(new_user.id), username=new_user.username, email=new_user.email
        )
        logger.info(f"Queued welcome email for new user: {new_user.username}")
    except Exception as e:
        logger.warning(f"Failed to queue welcome email: {e}")

    # Generate access token for immediate login
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "id": str(new_user.id),
        "username": new_user.username,
        "email": new_user.email,
        "full_name": new_user.full_name,
        "message": "Account created successfully",
    }


async def get_current_user(
    request: Request, token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token.

    SECURITY: No authentication bypass - all requests require valid tokens
    Token can be provided via Authorization header OR HttpOnly cookie
    """
    # REMOVED: Development bypass to prevent accidental production exposure
    # If you need testing, create a test user account instead

    # Check for token in Authorization header first, then cookie
    if not token:
        token = request.cookies.get("ocean_portal_token")

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


@router.post("/refresh")
async def refresh_token(
    request: Request, response: Response, current_user: User = Depends(get_current_user)
):
    """Refresh authentication token to extend session."""
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.username}, expires_delta=access_token_expires
    )

    # Update cookie with new token
    is_secure = request.url.scheme == "https"
    environment = os.getenv("ENVIRONMENT", "development").lower()
    samesite_policy = "strict" if environment == "production" else "lax"

    response.set_cookie(
        key="ocean_portal_token",
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        httponly=True,
        secure=is_secure,
        samesite=samesite_policy,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "id": getattr(current_user, "id", current_user.username),
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
    }


@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information"""
    return current_user
