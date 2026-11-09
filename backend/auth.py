from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv

load_dotenv()

def _load_secret_key() -> str:
    """Resolve the JWT signing key.

    Priority: SECRET_KEY env var > persisted per-machine key file.
    The old hardcoded fallback was forgeable by anyone with the repo, so we
    generate a strong random key on first run and persist it (LOCALAPPDATA is
    writable even when the app itself is installed under Program Files).
    """
    key = os.getenv("SECRET_KEY")
    if key:
        return key
    try:
        import secrets
        key_file = os.path.join(
            os.getenv("LOCALAPPDATA") or os.path.expanduser("~"),
            "RedewMusic", ".secret_key",
        )
        if os.path.exists(key_file):
            with open(key_file, "r") as f:
                stored = f.read().strip()
            if stored:
                return stored
        new_key = secrets.token_urlsafe(48)
        os.makedirs(os.path.dirname(key_file), exist_ok=True)
        # Write with user-only permissions where the OS supports it
        fd = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(new_key)
        return new_key
    except Exception:
        # Last resort: random per-process key (logins reset on restart,
        # but never forgeable from source code)
        import secrets
        return secrets.token_urlsafe(48)

SECRET_KEY = _load_secret_key()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")
# Same scheme but tolerates a missing header (for endpoints that work for guests too)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/login", auto_error=False)

def verify_password(plain_password, hashed_password):
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (ValueError, TypeError):
        # Malformed/unknown hash format — treat as mismatch, not a 500
        return False

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return username
    except JWTError:
        raise credentials_exception
