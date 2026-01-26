"""
Authentication module for user management.
Handles password hashing, JWT token creation/validation, and user verification.
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from pydantic import BaseModel
import hashlib
import base64

from config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
from database import get_db

import logging

logger = logging.getLogger(__name__)

# Password hashing context
# Use plain bcrypt for backward compatibility
# We manually pre-hash long passwords with SHA256 before bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# Pydantic models for request/response
class UserCreate(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    username: str
    schema_name: str
    created_at: datetime

    class Config:
        from_attributes = True


def _pre_hash_password(password: str) -> bytes:
    """
    Pre-hash password with SHA256 to handle passwords longer than 72 bytes.
    Returns base64-encoded SHA256 hash (always 44 bytes, safe for bcrypt).
    """
    # Hash with SHA256 and encode to base64
    sha256_hash = hashlib.sha256(password.encode('utf-8')).digest()
    return base64.b64encode(sha256_hash)


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt.
    For passwords longer than 72 bytes, pre-hash with SHA256 first.
    """
    # Check if password is longer than 72 bytes
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        # Pre-hash with SHA256 to ensure it's always <= 72 bytes
        pre_hashed = _pre_hash_password(password)
        # Use a special prefix to identify pre-hashed passwords
        # Format: $2b$12$<bcrypt_hash_of_prehashed_password>
        return pwd_context.hash(pre_hashed.decode('utf-8'))
    else:
        # Use plain bcrypt for short passwords (backward compatibility)
        return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash.
    Handles both plain bcrypt hashes and pre-hashed (SHA256) bcrypt hashes.
    """
    password_bytes = plain_password.encode('utf-8')
    
    # If password is longer than 72 bytes, always pre-hash it before verification
    if len(password_bytes) > 72:
        pre_hashed = _pre_hash_password(plain_password)
        return pwd_context.verify(pre_hashed.decode('utf-8'), hashed_password)
    else:
        # For passwords <= 72 bytes, try plain password first (for backward compatibility)
        try:
            if pwd_context.verify(plain_password, hashed_password):
                return True
        except (ValueError, Exception):
            # If verification fails or raises an error, try pre-hashed version
            # (handles edge cases where hash might have been created differently)
            pass
        
        # Try pre-hashed version as fallback
        pre_hashed = _pre_hash_password(plain_password)
        return pwd_context.verify(pre_hashed.decode('utf-8'), hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.
    
    Args:
        data: Dictionary containing claims to encode (e.g., user_id, username)
        expires_delta: Optional custom expiration time
        
    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    """
    Decode and validate a JWT token.
    
    Args:
        token: JWT token string
        
    Returns:
        TokenData if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("user_id")
        username: str = payload.get("username")
        
        if user_id is None:
            return None
            
        return TokenData(user_id=user_id, username=username)
    except JWTError as e:
        logger.debug(f"JWT decode error: {e}")
        return None


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Dependency to get the current authenticated user.
    
    Args:
        token: JWT token from Authorization header
        db: Database session
        
    Returns:
        User object if authenticated
        
    Raises:
        HTTPException: If not authenticated or invalid token
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if token is None:
        raise credentials_exception
    
    token_data = decode_token(token)
    if token_data is None:
        raise credentials_exception
    
    # Import here to avoid circular imports
    from models import User
    
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Dependency to optionally get the current authenticated user.
    Returns None if not authenticated (doesn't raise exception).
    
    Args:
        token: JWT token from Authorization header
        db: Database session
        
    Returns:
        User object if authenticated, None otherwise
    """
    if token is None:
        return None
    
    token_data = decode_token(token)
    if token_data is None:
        return None
    
    # Import here to avoid circular imports
    from models import User
    
    user = db.query(User).filter(User.id == token_data.user_id).first()
    return user


def get_user_by_username(db: Session, username: str):
    """Get a user by username."""
    from models import User
    return db.query(User).filter(User.username == username).first()


def get_user_by_id(db: Session, user_id: int):
    """Get a user by ID."""
    from models import User
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, user_data: UserCreate):
    """
    Create a new user in the database.
    
    Args:
        db: Database session
        user_data: User creation data
        
    Returns:
        Created User object
    """
    from models import User
    from database import create_user_schema, get_user_schema_name
    
    # Hash the password
    hashed_password = hash_password(user_data.password)
    
    # Create a temporary schema name (will be updated after we get the user ID)
    temp_schema = f"user_temp_{datetime.utcnow().timestamp()}"
    
    # Create user record
    db_user = User(
        username=user_data.username,
        hashed_password=hashed_password,
        schema_name=temp_schema
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Now update with the real schema name based on user ID
    real_schema_name = get_user_schema_name(db_user.id)
    db_user.schema_name = real_schema_name
    db.commit()
    db.refresh(db_user)
    
    # Create the user's schema and tables
    create_user_schema(db_user.id)
    
    logger.info(f"Created user {db_user.username} with schema {real_schema_name}")
    
    return db_user


def authenticate_user(db: Session, username: str, password: str):
    """
    Authenticate a user by username and password.
    
    Args:
        db: Database session
        username: Username to authenticate
        password: Plain text password
        
    Returns:
        User object if authenticated, None otherwise
    """
    user = get_user_by_username(db, username)
    
    if not user:
        return None
    
    if not verify_password(password, user.hashed_password):
        return None
    
    return user
