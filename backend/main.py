import httpx
import os
import aiosqlite
import greenlet
import passlib.handlers.pbkdf2
import passlib.handlers.bcrypt
import passlib.handlers.sha2_crypt

from fastapi import FastAPI, HTTPException, Query, Depends, status, WebSocket, WebSocketDisconnect, UploadFile, File, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from music_engine import MusicEngine
from database import init_db, get_db
from models import User, Song, Playlist, LikedSong, ListenHistory, Room, RoomParticipant, SearchHistory, Friendship
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, oauth2_scheme, oauth2_scheme_optional,
    SECRET_KEY, ALGORITHM,
)
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from jose import JWTError, jwt

import asyncio
import time
import re
from datetime import datetime, timedelta

# Load .env from either the bundled location (next to the PyInstaller exe,
# where electron-builder places extraResources), the legacy userData dir,
# or the current working directory (dev mode runs from backend/).
def _resolve_dotenv_path() -> str | None:
    import sys
    candidates = []
    # 1) Bundled: next to the running exe (electron-builder extraResources)
    exe_dir = os.path.dirname(getattr(sys, 'executable', '')) or os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(exe_dir, '.env'))
    # 2) PyInstaller one-file extraction dir (as returned by _MEIPASS)
    meipass = getattr(sys, '_MEIPASS', None)
    if meipass:
        candidates.append(os.path.join(meipass, '.env'))
    # 3) userData resources (older electron-builder target dirs)
    appdata = os.getenv('APPDATA') or os.path.expanduser('~')
    candidates.append(os.path.join(appdata, 'Kettle', '.env'))
    # 4) cwd (dev: python main.py / uvicorn launched from backend/)
    candidates.append(os.path.abspath('.env'))
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    return None

_dotenv_path = _resolve_dotenv_path()
if _dotenv_path:
    load_dotenv(_dotenv_path)

app = FastAPI(title="Kettle API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Engine initialization
engine_config = {
    "SPOTIFY_CLIENT_ID": os.getenv("SPOTIFY_CLIENT_ID"),
    "SPOTIFY_CLIENT_SECRET": os.getenv("SPOTIFY_CLIENT_SECRET"),
}
music_engine = MusicEngine(engine_config)

@app.on_event("startup")
async def on_startup():
    await init_db()

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r'^[A-Za-z0-9_.-]+$')
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)

UserCreate = RegisterRequest

class Token(BaseModel):
    access_token: str
    token_type: str

class LikeRequest(BaseModel):
    video_id: str
    title: str
    channel: str
    thumbnail: str
    duration: str

async def get_optional_user(token: Optional[str] = Depends(oauth2_scheme_optional)):
    """Returns username if authenticated, None otherwise (never 401s)"""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

# --- AUTH ROUTES ---

@app.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).filter(User.username == user.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
    # Email also has a unique DB index â€” pre-check to return 400 instead of 500
    email_result = await db.execute(select(User).filter(User.email == user.email))
    if email_result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password)
    )
    db.add(db_user)
    try:
        await db.commit()
    except IntegrityError:
        # Race with a concurrent registration hitting the same unique index
        await db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already registered")
    return {"message": "User created successfully"}

class LoginRequest(BaseModel):
    username: str
    password: str

# Note: /login used to force the register schema (username/email/password).
# The split model keeps email out of the login contract; extra fields sent
# by legacy clients are silently ignored by pydantic.

@app.post("/login", response_model=Token)
async def login(form_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == form_data.username))
    user = result.scalars().first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    access_token = create_access_token(data={"sub": user.username, "uid": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

# Generate a unique, human-shareable friend code like "KT-AB4FCK" â€” 6 chars
# from a no-ambiguous alphabet (no 0, O, 1, I, L). Collision-safe: retries
# up to 10 times with progressively longer suffix if needed (uncommon).
_FRIEND_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

def _generate_friend_code() -> str:
    import random
    from datetime import timezone
    return f"KT-{''.join(random.choice(_FRIEND_ALPHABET) for _ in range(6))}"

async def _ensure_friend_code(user, db: AsyncSession):
    if user.friend_code:
        return user.friend_code
    for _ in range(10):
        code = _generate_friend_code()
        existing = await db.execute(select(User).filter(User.friend_code == code))
        if existing.scalars().first() is None:
            user.friend_code = code
            return code
    user.friend_code = f"KT-{user.id:06d}"
    return user.friend_code


def _is_online(user):
    if not user.last_seen:
        return False
    delta = datetime.utcnow() - user.last_seen
    return delta.total_seconds() < 300  # 5 min freshness window


def _user_public(user, mut: bool = False):
    """Public-safe subset of profile fields â€” friends can see these."""
    return {
        "id": user.id,
        "username": user.username,
        "friend_code": user.friend_code,
        "bio": getattr(user, 'bio', '') or '',
        "profile_photo": user.profile_photo,
        "created_at": user.created_at.isoformat() if getattr(user, 'created_at', None) else None,
        "last_seen": (user.last_seen.isoformat() if getattr(user, 'last_seen', None) else None),
        "is_online": _is_online(user),
    }


def _escape_like(value: str) -> str:
    """Escape user input for SQL LIKE (backslash-escaped, case already handled)."""
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _discoverable():
    """Social discovery predicate.

    Excludes (a) throwaway/test usernames created through the API and
    (b) accounts that never finished onboarding (no genres picked â€” no
    taste to overlap). Friend links, code-based adding and Jam invites are
    unaffected; only discovery lists use this.
    """
    return (User.onboarding_completed == True) & (~func.lower(User.username).startswith('test_'))

class FriendRequest(BaseModel):
    friend_code: Optional[str] = None
    username: Optional[str] = None
    message: Optional[str] = ""

class FriendAction(BaseModel):
    action: str  # "accept" | "decline"

class ProfilePatch(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    bio: Optional[str] = None


@app.get("/users/me")
async def read_users_me(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    just_generated = user.friend_code is None
    if just_generated:
        await _ensure_friend_code(user, db)
    now = datetime.utcnow()
    stale = (user.last_seen is None) or ((now - user.last_seen).total_seconds() > 60)
    if stale:
        user.last_seen = now
    if stale or just_generated:
        try:
            await db.commit()
        except IntegrityError:
            # Lost a friend_code race with a concurrent /users/me — retry once
            await db.rollback()
            if just_generated:
                await _ensure_friend_code(user, db)
                if stale:
                    user.last_seen = now
                try:
                    await db.commit()
                except IntegrityError:
                    await db.rollback()  # another writer won; code is set now
        await db.refresh(user)
    friend_count = (await db.execute(select(func.count()).select_from(Friendship).filter(
        Friendship.status == 'accepted',
        ((Friendship.requester_id == user.id) | (Friendship.addressee_id == user.id))
    ))).scalar() or 0
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "onboarding_completed": user.onboarding_completed,
        "profile_photo": user.profile_photo,
        "current_queue": user.current_queue,
        "playback_state": user.playback_state,
        "friend_code": user.friend_code,
        "bio": user.bio or '',
        "last_seen": user.last_seen.isoformat() if user.last_seen else None,
        "friend_count": friend_count,
        "created_at": user.created_at.isoformat() if user.created_at else None
    }

# --- FRIENDS / SOCIAL -------------------------------------------------

@app.get("/users/search")
async def search_users(
    q: str = Query(..., min_length=1),
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find users by username substring or exact friend code."""
    me = (await db.execute(select(User).filter(User.username == username))).scalars().first()
    if not me:
        raise HTTPException(status_code=404, detail="User not found")
    q_l = q.strip().lower()
    if not q_l:
        return []
    # Friend-code lookup: accept "ktfp868s", "kt-fp868s", "FP868S", full codes,
    # or just the random tail. Strip dashes, then only a LEADING "kt" (the
    # body itself contains K and T freely). Escape LIKE wildcards throughout.
    scrub = q_l.replace("-", "")
    if scrub.startswith("kt"):
        scrub = scrub[2:]
    q_esc = _escape_like(q_l)
    code_token = "KT-" + _escape_like(scrub.upper()) + "%"
    if scrub and len(scrub) >= 2:
        code_clause = func.upper(User.friend_code).like(code_token, escape='\\')
    else:
        code_clause = False
    # Code lookup works for everyone (friends add each other without picking
    # genres); name-substring browsing only sees completed, real accounts.
    stmt = select(User).where(
        User.id != me.id,
        or_(
            func.lower(User.username).like(f"%{q_esc}%", escape='\\') & _discoverable(),
            code_clause,
        ),
    ).order_by(User.last_seen.desc().nulls_last()).limit(20)
    rows = (await db.execute(stmt)).scalars().all()
    return [_user_public(u) for u in rows]

@app.post("/friends/request")
async def send_friend_request(
    data: FriendRequest,
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = (await db.execute(select(User).filter(User.username == username))).scalars().first()
    if not me:
        raise HTTPException(status_code=404, detail="User not found")

    target = None
    if data.friend_code:
        # Strip dashes/spaces, then only a LEADING "KT" — body letters K/T are fine
        scrub = data.friend_code.upper().replace("-", "").replace(" ", "")
        if scrub.startswith("KT"):
            scrub = scrub[2:]
        normalized = f"KT-{scrub}"
        target = (await db.execute(select(User).where(func.upper(User.friend_code) == normalized))).scalars().first()
    elif data.username:
        target = (await db.execute(select(User).where(User.username == data.username))).scalars().first()
    else:
        raise HTTPException(status_code=400, detail="Provide friend_code or username")

    if not target:
        raise HTTPException(status_code=404, detail="No user matches that code or username")
    if target.id == me.id:
        raise HTTPException(status_code=400, detail="That's you â€” you can't friend yourself")

    existing = (await db.execute(select(Friendship).where(or_(
        (Friendship.requester_id == me.id) & (Friendship.addressee_id == target.id),
        (Friendship.requester_id == target.id) & (Friendship.addressee_id == me.id),
    )))).scalars().first()

    if existing:
        if existing.status == 'accepted':
            return {"status": "already_friends", "user": _user_public(target)}
        if existing.status == 'pending':
            direction = "outgoing" if existing.requester_id == me.id else "incoming"
            return {"status": "pending", "direction": direction, "friendship_id": existing.id}
        # Re-activate declined requests
        existing.requester_id = me.id
        existing.addressee_id = target.id
        existing.status = 'pending'
        existing.request_message = data.message or ''
        existing.created_at = datetime.utcnow()
        existing.responded_at = None
        await db.commit()
        return {"status": "pending", "direction": "outgoing", "friendship_id": existing.id}

    newf = Friendship(
        requester_id=me.id,
        addressee_id=target.id,
        status='pending',
        request_message=data.message or '',
    )
    db.add(newf)
    await db.commit()
    return {"status": "pending", "direction": "outgoing", "friendship_id": newf.id, "user": _user_public(target)}

@app.get("/friends")
async def list_friends(
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = (await db.execute(select(User).filter(User.username == username))).scalars().first()
    if not me:
        raise HTTPException(status_code=404, detail="User not found")
    rows = (await db.execute(select(Friendship).where(
        Friendship.status == 'accepted',
        or_(Friendship.requester_id == me.id, Friendship.addressee_id == me.id),
    ))).scalars().all()
    if not rows:
        return []
    other_ids = [f.addressee_id if f.requester_id == me.id else f.requester_id for f in rows]
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(other_ids)))).scalars().all()}
    out = []
    for f in rows:
        oid = f.addressee_id if f.requester_id == me.id else f.requester_id
        o = users.get(oid)
        if o:
            out.append({
                "friendship_id": f.id,
                "since": f.created_at.isoformat() if f.created_at else None,
                **_user_public(o),
            })
    return out

@app.get("/friend-requests")
async def list_friend_requests(
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = (await db.execute(select(User).filter(User.username == username))).scalars().first()
    if not me:
        raise HTTPException(status_code=404, detail="User not found")
    rows = (await db.execute(select(Friendship).where(
        Friendship.addressee_id == me.id,
        Friendship.status == 'pending',
    ).order_by(Friendship.created_at.desc()))).scalars().all()
    if not rows:
        return []
    req_ids = [f.requester_id for f in rows]
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(req_ids)))).scalars().all()}
    out = []
    for f in rows:
        r = users.get(f.requester_id)
        if r:
            out.append({
                "friendship_id": f.id,
                "message": f.request_message or "",
                "sent_at": f.created_at.isoformat() if f.created_at else None,
                **_user_public(r),
            })
    return out

@app.post("/friends/respond/{friendship_id}")
async def respond_friend_request(
    friendship_id: int,
    data: FriendAction,
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = (await db.execute(select(User).filter(User.username == username))).scalars().first()
    if not me:
        raise HTTPException(status_code=404, detail="User not found")
    f = await db.get(Friendship, friendship_id)
    if not f:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if f.addressee_id != me.id:
        raise HTTPException(status_code=403, detail="Not your friend request")
    if f.status != 'pending':
        raise HTTPException(status_code=400, detail="Request already handled")
    if data.action == 'accept':
        f.status = 'accepted'
        f.responded_at = datetime.utcnow()
    elif data.action == 'decline':
        f.status = 'declined'
        f.responded_at = datetime.utcnow()
    else:
        raise HTTPException(status_code=400, detail="Action must be 'accept' or 'decline'")
    await db.commit()
    return {"status": f.status, "friendship_id": f.id}

@app.delete("/friends/{friendship_id}")
async def remove_friend(
    friendship_id: int,
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = (await db.execute(select(User).filter(User.username == username))).scalars().first()
    if not me:
        raise HTTPException(status_code=404, detail="User not found")
    f = await db.get(Friendship, friendship_id)
    if not f:
        raise HTTPException(status_code=404, detail="Friend entry not found")
    if f.requester_id != me.id and f.addressee_id != me.id:
        raise HTTPException(status_code=403, detail="Not yours")
    await db.delete(f)
    await db.commit()
    return {"status": "removed", "friendship_id": friendship_id}

@app.get("/suggested-friends")
async def suggested_friends(
    username: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Taste-overlap suggestions: ranked by preferred_genres overlap with you."""
    me = (await db.execute(select(User).filter(User.username == username))).scalars().first()
    if not me:
        raise HTTPException(status_code=404, detail="User not found")

    pairs_q = await db.execute(select(Friendship).where(or_(
        Friendship.requester_id == me.id,
        Friendship.addressee_id == me.id,
    )))
    touched = set()
    for f in pairs_q.scalars().all():
        touched.add(f.requester_id)
        touched.add(f.addressee_id)

    my_genres = set(g for g in (me.preferred_genres or []) if isinstance(g, str))
    rows_q = await db.execute(
        select(User).where(
            User.id != me.id,
            _discoverable(),
            ~User.id.in_(touched) if touched else True,
        ).order_by(User.last_seen.desc().nulls_last()).limit(80)
    )
    rows = rows_q.scalars().all()

    scored = []
    for u in rows:
        their = set(g for g in (u.preferred_genres or []) if isinstance(g, str))
        overlap = len(my_genres & their)
        recency = (datetime.utcnow() - u.last_seen).total_seconds() if u.last_seen else 1e18
        scored.append((overlap, recency, u))
    # Prefer genre-match, then recency
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [_user_public(u) for _, _, u in scored[:8]]

class OnboardingData(BaseModel):
    genres: List[str]
    artists: List[str]

@app.post("/users/onboarding")
async def save_onboarding(data: OnboardingData, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.preferred_genres = data.genres
    user.preferred_artists = data.artists
    user.onboarding_completed = True
    await db.commit()
    return {"message": "Onboarding completed"}

class SyncState(BaseModel):
    current_queue: List[dict]
    playback_state: dict

@app.post("/users/sync-state")
async def sync_state(data: SyncState, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.current_queue = data.current_queue
    user.playback_state = data.playback_state
    await db.commit()
    return {"status": "synced"}

@app.post("/users/search-history")
async def add_search_history(q: Optional[str] = Query(None, alias="q"),
                             query: Optional[str] = Query(None),
                             username: str = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    # The frontend posts `?q=...`; accept both spellings so it never 422s.
    text = (q or query or "").strip()
    if not text:
        return {"status": "ignored"}
    text = text[:300]
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    history = SearchHistory(user_id=user.id, query=text)
    db.add(history)
    await db.commit()
    return {"status": "recorded"}


def _parse_duration(raw):
    """'3:45' / '1:02:03' / '225' -> seconds (or None)."""
    try:
        if raw is None or raw == "":
            return None
        parts = str(raw).strip().split(":")
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        return int(parts[0])
    except (ValueError, TypeError):
        return None


def _fmt_duration(secs):
    if not secs:
        return "0:00"
    secs = int(secs)
    return f"{secs // 60}:{secs % 60:02d}"


# YouTube IDs are exactly 11 chars from [A-Za-z0-9_-] — reject everything else
_VIDEO_ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')

def _require_video_id(video_id: str) -> str:
    if not _VIDEO_ID_RE.match(video_id or ''):
        raise HTTPException(status_code=400, detail="Invalid video id")
    return video_id


def _parse_range(rng: Optional[str], total: int):
    """Shared Range-header parsing (start..end, end inclusive)."""
    start, end = 0, total - 1
    s = (rng or '').strip()
    if s.startswith('bytes='):
        spec = s[6:].split(',')[0].strip()
        s0, _, e0 = spec.partition('-')
        try:
            if s0:
                start = int(s0)
                if e0:
                    end = min(int(e0), total - 1)
            elif e0:
                start = max(0, total - int(e0))
        except ValueError:
            pass
    return start, end


class ListenIn(BaseModel):
    # Frontend track shape (MusicContext playTrack)
    id: str
    title: str
    channel: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[str] = None


@app.post("/users/listen")
async def record_listen(data: ListenIn, username: str = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    """Record a play â€” feeds Continue Listening and the per-user taste engine."""
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    song_result = await db.execute(select(Song).filter(Song.video_id == data.id))
    song = song_result.scalars().first()
    if not song:
        song = Song(video_id=data.id, title=data.title, artist=data.channel,
                    thumbnail=data.thumbnail, duration=_parse_duration(data.duration))
        db.add(song)
        await db.commit()
        await db.refresh(song)
    else:
        # Backfill metadata for songs first created by the stream/like paths
        changed = False
        if data.title and not song.title:
            song.title = data.title; changed = True
        if data.channel and not song.artist:
            song.artist = data.channel; changed = True
        if data.thumbnail and not song.thumbnail:
            song.thumbnail = data.thumbnail; changed = True
        if song.duration is None and _parse_duration(data.duration):
            song.duration = _parse_duration(data.duration); changed = True
        if changed:
            await db.commit()

    # One history row per song per 60s (browser re-requests / src restarts)
    recent_cutoff = datetime.utcnow() - timedelta(seconds=60)
    dup = await db.execute(
        select(ListenHistory)
        .filter(ListenHistory.user_id == user.id, ListenHistory.song_id == song.id,
                ListenHistory.played_at >= recent_cutoff)
        .limit(1)
    )
    if dup.scalars().first() is None:
        song.play_count = (song.play_count or 0) + 1
        db.add(ListenHistory(user_id=user.id, song_id=song.id))
        await db.commit()
    return {"status": "recorded"}


@app.get("/users/listen-history")
async def get_listen_history(limit: int = Query(30, ge=1, le=100),
                             username: str = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    """Most recent distinct plays for the Continue Listening list."""
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    rows = (await db.execute(
        select(ListenHistory, Song)
        .join(Song, ListenHistory.song_id == Song.id)
        .filter(ListenHistory.user_id == user.id)
        .order_by(ListenHistory.played_at.desc())
        .limit(limit * 3)   # dedupe in python, then cut to limit
    )).all()

    seen, tracks = set(), []
    for _, song in rows:
        if not song.video_id or song.video_id in seen:
            continue
        seen.add(song.video_id)
        tracks.append({
            "id": song.video_id,
            "title": song.title or "",
            "channel": song.artist or "Unknown",
            "thumbnail": song.thumbnail or "",
            "duration": _fmt_duration(song.duration),
        })
        if len(tracks) >= limit:
            break
    return {"tracks": tracks}


@app.get("/users/search-history")
async def get_search_history(limit: int = Query(30, ge=1, le=100),
                             username: str = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    """Recent search queries â€” a core signal for per-user personalization."""
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    rows = (await db.execute(
        select(SearchHistory.query)
        .filter(SearchHistory.user_id == user.id)
        .order_by(SearchHistory.searched_at.desc())
        .limit(limit)
    )).scalars().all()
    return {"queries": [q for q in rows if q]}


class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    profile_photo: Optional[str] = None
    bio: Optional[str] = None

@app.put("/users/profile")
async def update_profile(data: UserProfileUpdate, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.username:
        check = await db.execute(select(User).filter(User.username == data.username, User.id != user.id))
        if check.scalars().first():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = data.username

    if data.email:
        # Verify the email isn't already registered by someone else
        echeck = await db.execute(select(User).filter(User.email == data.email, User.id != user.id))
        if echeck.scalars().first():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email
    if data.bio is not None:
        user.bio = data.bio[:160]  # keep short

    if data.profile_photo:
        user.profile_photo = data.profile_photo

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already taken")
    await db.refresh(user)
    return {
        "message": "Profile updated",
        "username": user.username,
        "email": user.email,
        "profile_photo": user.profile_photo,
        "bio": user.bio,
    }

@app.post("/upload-to-catbox")
async def upload_proxy(file: UploadFile = File(...), username: str = Depends(get_current_user)):
    # Profile pictures are images only — no arbitrary executable/web-payload hosting
    content_type = (file.content_type or '').lower()
    filename = (file.filename or '').lower()
    allowed_ext = ('.jpg', '.jpeg', '.png', '.gif', '.webp')
    if not content_type.startswith('image/') or not any(filename.endswith(ext) for ext in allowed_ext):
        raise HTTPException(status_code=415, detail="Only .jpg/.jpeg/.png/.gif/.webp images are allowed")
    MAX_UPLOAD = 10 * 1024 * 1024  # Avatar uploads never legitimately exceed 10 MB
    # Bounded read: at most MAX+1 bytes are buffered, even against hostile clients
    payload = await file.read(MAX_UPLOAD + 1)
    if len(payload) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            safe_name = filename.rsplit('/', 1)[-1].rsplit('\\', 1)[-1] or 'avatar.jpg'
            files = {'fileToUpload': (safe_name, payload, content_type)}
            data = {'reqtype': 'fileupload'}
            response = await client.post('https://catbox.moe/user/api.php', data=data, files=files)
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Catbox upload failed")
            url = response.text.strip()
            if not url.startswith('https://'):
                raise HTTPException(status_code=502, detail="Catbox upload failed")
            return {"url": url}
    except HTTPException:
        raise
    except Exception:
        # Generic message only — raw httpx errors leak host/proxy internals
        raise HTTPException(status_code=502, detail="Catbox upload failed")

@app.get("/health")
async def health():
    """Liveness probe for Render/load balancers and local tooling."""
    return {"status": "ok", "service": "kettle-api"}

# --- MUSIC ROUTES ---

@app.get("/search")
async def search(q: str = Query(...), db: AsyncSession = Depends(get_db)):
    # Local DB lookup and YouTube search run concurrently for minimum latency
    db_task = db.execute(select(Song).filter(Song.title.ilike(f"%{q}%")).limit(5))
    yt_task = music_engine.search(q, limit=15)
    db_results, yt_results = await asyncio.gather(db_task, yt_task)
    local_songs = db_results.scalars().all()

    return {
        "local": local_songs,
        "results": yt_results[:15]
    }

@app.get("/recommendations")
async def recommendations(title: str = Query(...), channel: str = Query(...), current_id: str = Query(...)):
    """Spotify-grade vibe-matching recommendation engine"""
    results = []
    
    # Strategy 1: YouTube Radio Mix (Highest Quality Vibe Matching)
    try:
        related = await music_engine.get_related_videos(current_id, limit=25)
        if related and len(related) > 5:
            results = related
            print(f"DEBUG: Using Radio Mix for {current_id}")
    except Exception as e:
        print(f"DEBUG: Radio Mix failed: {e}")

    # Strategy 2: Search-based Vibe Matching (Fallback)
    if not results:
        import re
        clean_title = re.sub(
            r'\(?(official\s*(music\s*)?video|lyric(al)?\s*video|audio|full\s*song|hd|4k|official\s*audio|visualizer)\)?',
            '', title, flags=re.IGNORECASE
        ).strip()
        clean_title = re.sub(r'[\|\-\[\]()]', ' ', clean_title).strip()
        clean_title = re.sub(r'\s+', ' ', clean_title)
        
        # Try a "Related" keyword search
        query = f"{clean_title} {channel} similar music mix"
        yt_results = await music_engine.search(query, limit=15)
        results = [track for track in yt_results if track["id"] != current_id]
        print(f"DEBUG: Using Search-based fallback for {current_id}")

    # Final filter and variety sort
    if results:
        # Occasionally shuffle for variety, but keep top matches first
        return {"results": results}
    
    return {"results": []}

@app.get("/stream-live/{video_id}")
async def stream_live(video_id: str, request: Request):
    _require_video_id(video_id)
    """Relay the googlevideo audio stream to the player.

    We can't redirect the <audio> element to googlevideo directly: it always
    sends an open-ended `Range: bytes=0-`, which many edges/networks answer
    with 403. Instead the backend translates the browser's Range into small
    CLOSED in-bounds chunks (verified to return 206 everywhere) and streams
    them through, with automatic re-extraction if the URL expires.
    """
    total, ctype = await music_engine.probe_media(video_id)
    if not total:
        raise HTTPException(status_code=404, detail="Live stream not found")

    # Parse the browser's Range header (usually `bytes=0-`, or `bytes=N-` on seek)
    start, end = 0, total - 1
    rng = (request.headers.get("range") or "").strip()
    if rng.startswith("bytes="):
        spec = rng[6:].split(",")[0].strip()
        s, _, e = spec.partition("-")
        try:
            if s:
                start = int(s)
                if e:
                    end = min(int(e), total - 1)
            elif e:
                # Suffix range: bytes=-N (last N bytes)
                start = max(0, total - int(e))
        except ValueError:
            pass

    if start >= total or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{total}"})

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "no-store",
    }
    if start > 0 or end < total - 1:
        headers["Content-Range"] = f"bytes {start}-{end}/{total}"

    generator = music_engine.relay_chunks(video_id, start, end)
    return StreamingResponse(
        generator,
        status_code=206 if (start > 0 or end < total - 1) else 200,
        media_type=ctype or "audio/webm",
        headers=headers,
    )

@app.get("/prefetch/{video_id}")
async def prefetch(video_id: str):
    """Warm the stream-URL cache for a track so playback starts instantly."""
    _require_video_id(video_id)
    url = await music_engine.get_stream_url(video_id)
    return {"status": "warmed" if url else "failed", "video_id": video_id}

@app.get("/stream/{video_id}")
async def stream(video_id: str, title: Optional[str] = None, request: Request = None, username: str = Depends(get_optional_user), db: AsyncSession = Depends(get_db)):
    _require_video_id(video_id)
    # History is recorded ONLY when the stream is actually servable, so
    # failed streams and browser re-requests don't inflate play counts.
    # Dedupe: multiple GETs for one playback within 60s count once.
    file_path = os.path.join(music_engine.download_folder, f"{video_id}.mp3")
    cached = os.path.exists(file_path)
    if cached:
        ctype = "audio/webm"
        total = None
    else:
        # Probe remote audio only if not cached; 404 before counting anything
        total, ctype = await music_engine.probe_media(video_id)
        if not total:
            raise HTTPException(status_code=404, detail="Audio not found")

    if username:
        result = await db.execute(select(User).filter(User.username == username))
        user = result.scalars().first()

        # Find or create song in DB
        song_result = await db.execute(select(Song).filter(Song.video_id == video_id))
        song = song_result.scalars().first()

        if not song and title:
            song = Song(video_id=video_id, title=title)
            db.add(song)
            try:
                await db.commit()
                await db.refresh(song)
            except IntegrityError:
                await db.rollback()
                song = (await db.execute(select(Song).filter(Song.video_id == video_id))).scalars().first()

        if song and user:
            recent_cutoff = datetime.utcnow() - timedelta(seconds=60)
            dup = await db.execute(
                select(ListenHistory)
                .filter(ListenHistory.user_id == user.id, ListenHistory.song_id == song.id,
                        ListenHistory.played_at >= recent_cutoff)
                .limit(1)
            )
            if dup.scalars().first() is None:
                history = ListenHistory(user_id=user.id, song_id=song.id)
                song.play_count = (song.play_count or 0) + 1
                db.add(history)
                await db.commit()

    if cached:
        content_type_map = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".webm": "audio/webm"}
        ext = os.path.splitext(file_path)[1].lower()
        media_type = content_type_map.get(ext, "audio/mpeg")
        return FileResponse(file_path, media_type=media_type,
                            headers={"Accept-Ranges": "bytes"})

    # ...otherwise relay the live stream (never 404: the old yt-dlp download
    # fallback 403'd on networks that cap Range sizes, killing playback).
    total, ctype = await music_engine.probe_media(video_id)
    if not total:
        raise HTTPException(status_code=404, detail="Audio not found")

    start, end = 0, total - 1
    rng = request.headers.get("range") if request else None
    start, end = _parse_range(rng, total)
    if start >= total or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{total}"})

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "no-store",
    }
    if start > 0 or end < total - 1:
        headers["Content-Range"] = f"bytes {start}-{end}/{total}"
    return StreamingResponse(
        music_engine.relay_chunks(video_id, start, end),
        status_code=206 if (start > 0 or end < total - 1) else 200,
        media_type=ctype or "audio/webm",
        headers=headers,
    )

@app.get("/stream-video/{video_id}")
async def stream_video(video_id: str, request: Request):
    _require_video_id(video_id)
    """Relay the googlevideo â‰¤720p video stream for the muted <video> visual.

    The <video> element is hard-synced and MUTED in the app â€” the audio path
    plays the soundtrack â€” so this endpoint never records listen history and
    needs no user auth (mirrors how YouTube Music pairs a video feed with its
    audio feed). Same closed-range chunk relay as audio, same 206/416 handling.
    """
    total, ctype = await music_engine.probe_media(video_id, "video")
    if not total:
        raise HTTPException(status_code=404, detail="Video stream not found")

    start, end = 0, total - 1
    rng = request.headers.get("range")
    start, end = _parse_range(rng, total)
    if start >= total or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{total}"})

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "no-store",
    }
    if start > 0 or end < total - 1:
        headers["Content-Range"] = f"bytes {start}-{end}/{total}"
    return StreamingResponse(
        music_engine.relay_chunks(video_id, start, end, "video"),
        status_code=206 if (start > 0 or end < total - 1) else 200,
        media_type=ctype or "video/mp4",
        headers=headers,
    )

# --- LIKED SONGS ROUTES ---

@app.post("/like")
async def toggle_like(req: LikeRequest, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_video_id(req.video_id)
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find or create song
    song_result = await db.execute(select(Song).filter(Song.video_id == req.video_id))
    song = song_result.scalars().first()
    if not song:
        song = Song(
            video_id=req.video_id,
            title=req.title,
            artist=req.channel or 'Unknown',
            duration=_parse_duration(req.duration),
            thumbnail=req.thumbnail,
        )
        db.add(song)
        try:
            await db.commit()
            await db.refresh(song)
        except IntegrityError:
            # Lost a concurrent-create race on video_id — just re-read
            await db.rollback()
            song = (await db.execute(select(Song).filter(Song.video_id == req.video_id))).scalars().first()

    # Check if already liked
    like_result = await db.execute(
        select(LikedSong).filter(LikedSong.user_id == user.id, LikedSong.song_id == song.id)
    )
    existing = like_result.scalars().first()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"liked": False, "video_id": req.video_id}
    else:
        new_like = LikedSong(user_id=user.id, song_id=song.id)
        db.add(new_like)
        try:
            await db.commit()
        except IntegrityError:
            # Double-tap / concurrent retry — idempotent like
            await db.rollback()
        return {"liked": True, "video_id": req.video_id}

@app.get("/liked-songs")
async def get_liked_songs(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    liked = await db.execute(
        select(LikedSong, Song)
        .join(Song, LikedSong.song_id == Song.id)
        .filter(LikedSong.user_id == user.id)
        .order_by(LikedSong.created_at.desc())
    )
    rows = liked.all()
    songs = []
    for like, song in rows:
        songs.append({
            "id": song.video_id,
            "title": song.title,
            "channel": song.artist or "Unknown",
            "thumbnail": song.thumbnail or "",
            "duration": _fmt_duration(song.duration) if song.duration else "0:00",
            "video_id": song.video_id
        })
    return {"songs": songs}

# --- PLAYLIST ROUTES ---

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None

class PlaylistAddSong(BaseModel):
    video_id: str
    title: str
    channel: str
    thumbnail: str
    duration: str

@app.post("/playlists")
async def create_playlist(req: PlaylistCreate, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    playlist = Playlist(name=req.name, description=req.description, owner_id=user.id)
    db.add(playlist)
    await db.commit()
    await db.refresh(playlist)
    return {"id": playlist.id, "name": playlist.name}

@app.get("/playlists")
async def get_playlists(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    pl_result = await db.execute(select(Playlist).filter(Playlist.owner_id == user.id))
    playlists = pl_result.scalars().all()
    return [{"id": p.id, "name": p.name, "description": p.description} for p in playlists]

@app.post("/playlists/{playlist_id}/add")
async def add_to_playlist(playlist_id: int, req: PlaylistAddSong, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Verify owner
    user_res = await db.execute(select(User).filter(User.username == username))
    user = user_res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    pl_res = await db.execute(select(Playlist).filter(Playlist.id == playlist_id, Playlist.owner_id == user.id))
    playlist = pl_res.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Get or create song
    song_res = await db.execute(select(Song).filter(Song.video_id == req.video_id))
    song = song_res.scalars().first()
    if not song:
        song = Song(video_id=req.video_id, title=req.title, artist=req.channel, thumbnail=req.thumbnail)
        db.add(song)
        await db.commit()
        await db.refresh(song)
    
    # Add to junction table if not already there
    from models import playlist_songs
    check = await db.execute(playlist_songs.select().where(playlist_songs.c.playlist_id == playlist_id, playlist_songs.c.song_id == song.id))
    if not check.first():
        await db.execute(playlist_songs.insert().values(playlist_id=playlist_id, song_id=song.id))
        await db.commit()
    
    return {"message": "Added to playlist"}

@app.get("/playlists/{playlist_id}")
async def get_playlist_details(playlist_id: int, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Owner-only access prevents IDOR on private playlists
    user_res = await db.execute(select(User).filter(User.username == username))
    user = user_res.scalars().first()

    pl_res = await db.execute(
        select(Playlist).filter(Playlist.id == playlist_id, Playlist.owner_id == (user.id if user else -1))
    )
    playlist = pl_res.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    from models import playlist_songs
    songs_res = await db.execute(
        select(Song)
        .join(playlist_songs, Song.id == playlist_songs.c.song_id)
        .where(playlist_songs.c.playlist_id == playlist_id)
    )
    songs = songs_res.scalars().all()
    
    return {
        "id": playlist.id,
        "name": playlist.name,
        "description": playlist.description,
        "songs": [{
            "id": s.video_id,
            "title": s.title,
            "channel": s.artist or "Unknown",
            "thumbnail": s.thumbnail,
            "duration": "0:00"
        } for s in songs]
    }

# Featured playlists cache (avoids hitting YouTube on every app launch)
_featured_cache = {"data": None, "ts": 0.0}
FEATURED_CACHE_TTL = 600  # 10 minutes

@app.get("/featured-playlists")
async def featured_playlists():
    """Returns mood and artist-dedicated playlists with live YouTube thumbnails"""
    categories = [
        {"id": "chart_global", "name": "Top 50 - Global", "type": "trending", "query": "top 50 global songs this week"},
        {"id": "chart_india", "name": "Top 50 - India", "type": "trending", "query": "top 50 india bollywood hits"},
        {"id": "mood_party", "name": "Party Mashup", "type": "mood", "query": "latest bollywood party mashup 2024"},
        {"id": "mood_romance", "name": "Romantic Melodies", "type": "mood", "query": "best romantic hindi songs hits"},
        {"id": "mood_focus", "name": "Lofi Study", "type": "mood", "query": "lofi hip hop study beats 24/7"},
        {"id": "mood_retro", "name": "Golden Hits", "type": "mood", "query": "70s 80s kishore kumar lata hits"},
        {"id": "artist_arijit", "name": "Arijit Singh Radio", "type": "artist", "query": "Arijit Singh greatest hits"},
        {"id": "artist_sidhu", "name": "Sidhu Moose Wala", "type": "artist", "query": "Sidhu Moose Wala legendary tracks"},
        {"id": "artist_diljit", "name": "Diljit Dosanjh", "type": "artist", "query": "Diljit Dosanjh G.O.A.T hits"},
        {"id": "artist_weeknd", "name": "The Weeknd Mix", "type": "artist", "query": "The Weeknd essential mix"},
        {"id": "artist_karan", "name": "Karan Aujla", "type": "artist", "query": "Karan Aujla geetan di machine hits"},
        {"id": "artist_badshah", "name": "Badshah Radio", "type": "artist", "query": "Badshah club party hits"}
    ]
    
    # Serve from cache when fresh so the home page loads instantly
    now = time.time()
    if _featured_cache["data"] and now - _featured_cache["ts"] < FEATURED_CACHE_TTL:
        return _featured_cache["data"]

    fallback_img = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=400"

    async def _cover(cat):
        try:
            # Top search result's thumbnail as the playlist cover
            search_results = await music_engine.search(cat["query"], limit=1)
            cat["image"] = search_results[0]["thumbnail"] if search_results else fallback_img
        except Exception:
            cat["image"] = fallback_img
        cat["description"] = f"Curated {cat['name']} collection"
        return cat

    # Fetch all covers concurrently instead of one-by-one
    results = list(await asyncio.gather(*(_cover(dict(c)) for c in categories)))
    _featured_cache["data"] = results
    _featured_cache["ts"] = now
    return results

# --- ROOMS (JAM) SYSTEM ---

_RELAY_TYPES = {'SYNC_PLAY', 'SYNC_PAUSE', 'SYNC_SEEK', 'SYNC_SETTINGS'}
_TRACK_FIELDS = ('id', 'title', 'channel', 'thumbnail', 'duration')
_SETTINGS_BOOL_FIELDS = ('allow_skips', 'allow_add_to_queue', 'private_room', 'only_host_controls')

def _validated_relay(data):
    """Per-type, minimal-surface validation of outbound room messages.

    Only the four documented control messages are ever relayed, and each
    is reconstructed field-by-field so unrelated keys never leave the
    process. Anything else is dropped (a malicious client can't inject
    arbitrary payloads or poll fields at the room).
    """
    if not isinstance(data, dict):
        return None
    mtype = data.get('type')
    if mtype not in _RELAY_TYPES:
        return None
    if mtype == 'SYNC_PLAY':
        track = data.get('track')
        progress = data.get('progress')
        if not isinstance(track, dict):
            return None
        if not isinstance(progress, (int, float)):
            return None
        if not track.get('id'):
            return None
        out_track = {k: track[k][:300] if isinstance(track.get(k), str) else track[k]
                     for k in _TRACK_FIELDS if isinstance(track.get(k), (str, int, float))}
        return {'type': 'SYNC_PLAY', 'track': out_track, 'progress': float(progress),
                'sentAt': data.get('sentAt')}
    if mtype == 'SYNC_PAUSE':
        return {'type': 'SYNC_PAUSE', 'sentAt': data.get('sentAt')}
    if mtype == 'SYNC_SEEK':
        progress = data.get('progress')
        if not isinstance(progress, (int, float)):
            return None
        return {'type': 'SYNC_SEEK', 'progress': float(progress), 'sentAt': data.get('sentAt')}
    if mtype == 'SYNC_SETTINGS':
        s = data.get('settings')
        if not isinstance(s, dict):
            return None
        out = {}
        for k in _SETTINGS_BOOL_FIELDS:
            if isinstance(s.get(k), bool):
                out[k] = s[k]
        mp = s.get('max_participants')
        if isinstance(mp, int) and 1 <= mp <= 100:
            out['max_participants'] = mp
        return {'type': 'SYNC_SETTINGS', 'settings': out}
    return None

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[dict]] = {}

    async def connect(self, room_code: str, websocket: WebSocket, username: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append({"ws": websocket, "user": username})
        return [c["user"] for c in self.active_connections[room_code]]

    def disconnect(self, room_code: str, websocket: WebSocket):
        if room_code in self.active_connections:
            self.active_connections[room_code] = [c for c in self.active_connections[room_code] if c["ws"] != websocket]
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast(self, room_code: str, message: dict):
        if room_code in self.active_connections:
            # Iterate over a copy: a failed send removes the dead peer mid-loop,
            # and one broken socket must never poison the whole room.
            for connection in list(self.active_connections[room_code]):
                try:
                    await connection["ws"].send_json(message)
                except (WebSocketDisconnect, RuntimeError, OSError):
                    self.disconnect(room_code, connection["ws"])

manager = ConnectionManager()

@app.post("/rooms")
async def create_room(name: str, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import uuid
    if not name or not (1 <= len(name.strip()) <= 80):
        raise HTTPException(status_code=400, detail="Room name must be 1-80 characters")

    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Retry up to 10 times on the (vanishingly rare) code collision
    for _ in range(10):
        room_code = uuid.uuid4().hex[:10].upper()
        room = Room(room_code=room_code, name=name.strip(), host_id=user.id,
                    is_playing=False, progress=0.0)
        db.add(room)
        try:
            await db.commit()
            await db.refresh(room)
            return room
        except IntegrityError:
            await db.rollback()
    raise HTTPException(status_code=503, detail="Could not allocate a room code — please retry")

@app.get("/rooms/{room_code}")
async def get_room(room_code: str, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Room).filter(Room.room_code == room_code.upper()))
    room = result.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@app.websocket("/ws/room/{room_code}")
async def room_websocket(websocket: WebSocket, room_code: str, token: str = Query(...)):
    # Auth: every socket must carry the user's JWT. Any client-supplied name
    # is ignored — identity comes from the token + DB.
    from database import async_session

    room_code = room_code.upper()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        await websocket.close(code=1008)  # policy violation
        return
    uid = payload.get("uid")
    try:
        uid_int = int(uid) if uid is not None else None
    except (TypeError, ValueError):
        uid_int = None
    sub = payload.get("sub")

    async with async_session() as session:
        if uid_int is not None:
            user = await session.get(User, uid_int)
        else:
            user = (await session.execute(select(User).filter(User.username == sub))).scalars().first()
        room = (await session.execute(select(Room).filter(Room.room_code == room_code))).scalars().first()

    if user is None:
        await websocket.close(code=1008)
        return
    if room is None:
        await websocket.close(code=1000)
        return

    username = user.username

    # Persist membership so rooms are auditable and recoverable
    async with async_session() as session:
        await session.execute(delete(RoomParticipant).where(
            RoomParticipant.room_id == room.id, RoomParticipant.user_id == user.id))
        session.add(RoomParticipant(room_id=room.id, user_id=user.id))
        await session.commit()

    participants = await manager.connect(room_code, websocket, username)
    # Send initial list to the new joiner
    await websocket.send_json({"type": "PARTICIPANT_LIST", "participants": participants})
    # Broadcast join to others
    await manager.broadcast(room_code, {"type": "USER_JOIN", "username": username})
    try:
        while True:
            data = await websocket.receive_json()
            out = _validated_relay(data)
            if out is not None:
                await manager.broadcast(room_code, out)
    except (WebSocketDisconnect, RuntimeError, ValueError, KeyError):
        # Malformed JSON, peer already closed, or normal disconnect — all
        # funnel through the same guaranteed cleanup below
        pass
    finally:
        manager.disconnect(room_code, websocket)
        async with async_session() as session:
            room_q = (await session.execute(select(Room).filter(Room.room_code == room_code))).scalars().first()
            if room_q is not None:
                await session.execute(delete(RoomParticipant).where(
                    RoomParticipant.room_id == room_q.id, RoomParticipant.user_id == user.id))
                await session.commit()
        await manager.broadcast(room_code, {"type": "USER_LEAVE", "username": username})


# --- ANALYTICS ---

@app.get("/analytics/top-songs")
async def top_songs(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Song).order_by(Song.play_count.desc().nulls_last()).limit(10))
    return result.scalars().all()


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
