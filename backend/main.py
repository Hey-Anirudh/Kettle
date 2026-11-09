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
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from music_engine import MusicEngine
from database import init_db, get_db
from models import User, Song, Playlist, LikedSong, ListenHistory, Room, RoomParticipant, SearchHistory
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, oauth2_scheme, oauth2_scheme_optional,
    SECRET_KEY, ALGORITHM,
)
from pydantic import BaseModel
from dotenv import load_dotenv
from jose import JWTError, jwt

import asyncio
import time
from datetime import datetime, timedelta

load_dotenv()

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

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleAuth(BaseModel):
    token: str

class LikeRequest(BaseModel):
    video_id: str
    title: str
    channel: str
    thumbnail: str
    duration: str

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

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
    # Email also has a unique DB index — pre-check to return 400 instead of 500
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

@app.post("/login", response_model=Token)
async def login(form_data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == form_data.username))
    user = result.scalars().first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "username": user.username, 
        "email": user.email, 
        "onboarding_completed": user.onboarding_completed,
        "profile_photo": user.profile_photo,
        "current_queue": user.current_queue,
        "playback_state": user.playback_state
    }

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
    """Record a play — feeds Continue Listening and the per-user taste engine."""
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
    """Recent search queries — a core signal for per-user personalization."""
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

@app.put("/users/profile")
async def update_profile(data: UserProfileUpdate, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if data.username:
        # Check if username is already taken by someone else
        check = await db.execute(select(User).filter(User.username == data.username, User.id != user.id))
        if check.scalars().first():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = data.username
    
    if data.email:
        user.email = data.email

    if data.profile_photo:
        user.profile_photo = data.profile_photo
        
    await db.commit()
    return {"message": "Profile updated", "username": user.username, "email": user.email, "profile_photo": user.profile_photo}

@app.post("/upload-to-catbox")
async def upload_proxy(file: UploadFile = File(...)):
    MAX_UPLOAD = 200 * 1024 * 1024  # Catbox's own limit; also caps memory use
    payload = await file.read()
    if len(payload) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="File too large")
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            files = {'fileToUpload': (file.filename, payload, file.content_type)}
            data = {'reqtype': 'fileupload'}
            response = await client.post('https://catbox.moe/user/api.php', data=data, files=files)
            
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Catbox upload failed")
            
            return {"url": response.text.strip()}
    except HTTPException:
        # Don't re-wrap our own deliberate status codes
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
    url = await music_engine.get_stream_url(video_id)
    return {"status": "warmed" if url else "failed", "video_id": video_id}

@app.get("/stream/{video_id}")
async def stream(video_id: str, title: str = None, request: Request = None, username: str = Depends(get_optional_user), db: AsyncSession = Depends(get_db)):
    # Record listen history ONLY when the stream is actually served, so
    # failed streams and browser re-requests don't inflate play counts.
    # Dedupe: multiple GETs for one playback within 60s count once.
    if username:
        result = await db.execute(select(User).filter(User.username == username))
        user = result.scalars().first()
        
        # Find or create song in DB
        song_result = await db.execute(select(Song).filter(Song.video_id == video_id))
        song = song_result.scalars().first()
        
        if not song and title:
            song = Song(video_id=video_id, title=title)
            db.add(song)
            await db.commit()
            await db.refresh(song)
        
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
                song.play_count += 1
                db.add(history)
                await db.commit()

    # Local cached file first (instant, no network)...
    file_path = os.path.join(music_engine.download_folder, f"{video_id}.mp3")
    if os.path.exists(file_path):
        media_type = "audio/mpeg"
        if file_path.endswith(".m4a"):
            media_type = "audio/mp4"
        elif file_path.endswith(".webm"):
            media_type = "audio/webm"
        return FileResponse(file_path, media_type=media_type,
                            headers={"Accept-Ranges": "bytes"})

    # ...otherwise relay the live stream (never 404: the old yt-dlp download
    # fallback 403'd on networks that cap Range sizes, killing playback).
    total, ctype = await music_engine.probe_media(video_id)
    if not total:
        raise HTTPException(status_code=404, detail="Audio not found")

    start, end = 0, total - 1
    rng = (request.headers.get("range") or "").strip() if request else ""
    if rng.startswith("bytes="):
        spec = rng[6:].split(",")[0].strip()
        s, _, e = spec.partition("-")
        try:
            if s:
                start = int(s)
                if e:
                    end = min(int(e), total - 1)
            elif e:
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
    return StreamingResponse(
        music_engine.relay_chunks(video_id, start, end),
        status_code=206 if (start > 0 or end < total - 1) else 200,
        media_type=ctype or "audio/webm",
        headers=headers,
    )

@app.get("/stream-video/{video_id}")
async def stream_video(video_id: str, request: Request):
    """Relay the googlevideo ≤720p video stream for the muted <video> visual.

    The <video> element is hard-synced and MUTED in the app — the audio path
    plays the soundtrack — so this endpoint never records listen history and
    needs no user auth (mirrors how YouTube Music pairs a video feed with its
    audio feed). Same closed-range chunk relay as audio, same 206/416 handling.
    """
    total, ctype = await music_engine.probe_media(video_id, "video")
    if not total:
        raise HTTPException(status_code=404, detail="Video stream not found")

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
    return StreamingResponse(
        music_engine.relay_chunks(video_id, start, end, "video"),
        status_code=206 if (start > 0 or end < total - 1) else 200,
        media_type=ctype or "video/mp4",
        headers=headers,
    )

# --- LIKED SONGS ROUTES ---

@app.post("/like")
async def toggle_like(req: LikeRequest, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find or create song
    song_result = await db.execute(select(Song).filter(Song.video_id == req.video_id))
    song = song_result.scalars().first()
    if not song:
        song = Song(video_id=req.video_id, title=req.title, thumbnail=req.thumbnail)
        db.add(song)
        await db.commit()
        await db.refresh(song)
    
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
        await db.commit()
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
            "duration": str(song.duration) if song.duration else "0:00",
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
    room_code = str(uuid.uuid4())[:8].upper()
    
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    room = Room(
        room_code=room_code,
        name=name,
        host_id=user.id,
        is_playing=False,
        progress=0.0
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room

@app.get("/rooms/{room_code}")
async def get_room(room_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Room).filter(Room.room_code == room_code))
    room = result.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@app.websocket("/ws/room/{room_code}")
async def room_websocket(websocket: WebSocket, room_code: str, username: str = "Anonymous"):
    participants = await manager.connect(room_code, websocket, username)
    # Send initial list to the new joiner
    await websocket.send_json({"type": "PARTICIPANT_LIST", "participants": participants})
    # Broadcast join to others
    await manager.broadcast(room_code, {"type": "USER_JOIN", "username": username})
    try:
        while True:
            data = await websocket.receive_json()
            # Only relay well-formed control messages with a known type —
            # arbitrary client JSON must not be echoed to every participant
            if not isinstance(data, dict) or not isinstance(data.get("type"), str):
                continue
            await manager.broadcast(room_code, data)
    except (WebSocketDisconnect, RuntimeError, ValueError, KeyError):
        # Malformed JSON, peer already closed, or normal disconnect — all
        # funnel through the same guaranteed cleanup below
        pass
    finally:
        manager.disconnect(room_code, websocket)
        await manager.broadcast(room_code, {"type": "USER_LEAVE", "username": username})

# --- ANALYTICS ---

@app.get("/analytics/top-songs")
async def top_songs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Song).order_by(Song.play_count.desc()).limit(10))
    return result.scalars().all()

# --- SERVER-SIDE GOOGLE OAUTH WITH PKCE (for Electron desktop app) ---

import uuid as _uuid
import hashlib
import base64
pending_google_auth = {}
GOOGLE_REDIRECT_URI = "http://127.0.0.1:8000/auth/google/callback"

def generate_pkce():
    verifier = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').replace('=', '')
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode('utf-8')).digest()).decode('utf-8').replace('=', '')
    return verifier, challenge

@app.get("/auth/google/start")
async def google_auth_start():
    session_id = str(_uuid.uuid4())[:12]
    verifier, challenge = generate_pkce()
    pending_google_auth[session_id] = {"status": "pending", "verifier": verifier}
    
    google_auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"state={session_id}&"
        f"code_challenge={challenge}&"
        f"code_challenge_method=S256&"
        f"prompt=select_account"
    )
    return {"url": google_auth_url, "session_id": session_id}

@app.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str):
    from fastapi.responses import HTMLResponse
    # json.dumps escapes quotes/backslashes so attacker-controlled query params
    # can't break out of the JS string literal (XSS)
    import json as _json
    code_js = _json.dumps(code)
    state_js = _json.dumps(state)
    # We have the code, now we tell the client to complete the exchange
    html = f"""<!DOCTYPE html>
<html><head><title>Kettle - Signing In</title>
<style>
body{{background:#121212;color:#fff;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
.card{{text-align:center;padding:40px;max-width:400px}}
.spinner{{width:40px;height:40px;border:3px solid #333;border-top:3px solid #1DB954;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
h1{{font-size:24px;margin-bottom:8px}}
p{{color:#b3b3b3;font-size:14px}}
.ok{{color:#1DB954}}
.err{{color:#e74c3c}}
</style></head><body>
<div class="card" id="c">
<div class="spinner"></div>
<h1>Completing login...</h1>
<p>You can close this window now.</p>
</div>
<script>
// Automatically send the code to our backend to exchange for a token
fetch('/auth/google/complete', {{
    method: 'POST',
    headers: {{ 'Content-Type': 'application/json' }},
    body: JSON.stringify({{ code: {code_js}, session_id: {state_js} }})
}})
.then(r => r.json())
.then(data => {{
    if (data.status === 'ok') {{
        document.getElementById('c').innerHTML = '<h1 class="ok">✓ Login Successful</h1><p>Return to the Kettle app to continue.</p>';
        setTimeout(() => window.close(), 3000);
    }} else {{
        document.getElementById('c').innerHTML = '<h1 class="err">Login Failed</h1><p>' + (data.detail || 'Error exchanging code') + '</p>';
    }}
}})
.catch(err => {{
    document.getElementById('c').innerHTML = '<h1 class="err">Login Failed</h1><p>Connection error.</p>';
}});
</script></body></html>"""
    return HTMLResponse(content=html)

class GoogleCompleteRequest(BaseModel):
    code: str
    session_id: str

@app.post("/auth/google/complete")
async def google_auth_complete(req: GoogleCompleteRequest, db: AsyncSession = Depends(get_db)):
    if req.session_id not in pending_google_auth:
        raise HTTPException(status_code=400, detail="Invalid session")
    
    session_data = pending_google_auth[req.session_id]
    
    # Exchange code for token using PKCE verifier
    async with httpx.AsyncClient() as client:
        token_res = await client.post('https://oauth2.googleapis.com/token', data={
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'code': req.code,
            'code_verifier': session_data['verifier'],
            'redirect_uri': GOOGLE_REDIRECT_URI,
            'grant_type': 'authorization_code'
        })
        
        if token_res.status_code != 200:
            print(f"Token exchange failed: {token_res.text}")
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")
        
        tokens = token_res.json()
        access_token = tokens.get('access_token')
        
        # Get user info
        user_res = await client.get('https://www.googleapis.com/oauth2/v3/userinfo',
                                  headers={'Authorization': f'Bearer {access_token}'})
        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        userinfo = user_res.json()

    email = userinfo.get('email')
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email address")
    name = userinfo.get('name') or email.split('@')[0]
    
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    
    if not user:
        uname_check = await db.execute(select(User).filter(User.username == name))
        if uname_check.scalars().first():
            import random
            name = f"{name}{random.randint(1000, 9999)}"
        # Random password: OAuth users must sign in via Google — never a
        # guessable scheme like google_user_<email> that allows password login
        import secrets
        user = User(username=name, email=email, hashed_password=get_password_hash(secrets.token_urlsafe(32)))
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    jwt_token = create_access_token(data={"sub": user.username})
    pending_google_auth[req.session_id] = {
        "status": "complete",
        "access_token": jwt_token,
        "username": user.username
    }
    return {"status": "ok"}

@app.get("/auth/google/poll/{session_id}")
async def google_auth_poll(session_id: str):
    if session_id not in pending_google_auth:
        raise HTTPException(status_code=404, detail="Session not found")
    session = pending_google_auth[session_id]
    if session["status"] == "complete":
        result = dict(session)
        del pending_google_auth[session_id]
        return result
    return {"status": "pending"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

