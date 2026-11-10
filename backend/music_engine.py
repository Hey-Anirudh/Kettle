import asyncio
import os
import time
import logging
import yt_dlp
import httpx
from typing import Union, Optional, Dict, List, Tuple
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("KettleMusicEngine")

# Cache TTLs (googlevideo stream URLs stay valid ~6 hours)
STREAM_TTL = 3 * 3600   # 3 hours
RELATED_TTL = 1800      # 30 minutes for radio-mix lists

# googlevideo edges (and some ISP middleboxes) reject large or open-ended
# Range requests with 403 — only small CLOSED ranges return bytes. Relaying in
# 256 KB closed-range chunks (verified working) makes playback robust everywhere.
RELAY_CHUNK = 256 * 1024

class MusicEngine:
    def __init__(self, config=None):
        self.config = config or {}
        
        # Safe writable download folder (in %APPDATA%/Kettle/downloads or local dev)
        import sys
        if getattr(sys, 'frozen', False):
            base_app_data = os.getenv('APPDATA', os.path.expanduser('~'))
            self.download_folder = os.path.join(base_app_data, 'Kettle', 'downloads')
        else:
            self.download_folder = os.path.abspath("downloads")
        
        # Spotify Settings
        self.spotify_id = self.config.get("SPOTIFY_CLIENT_ID")
        self.spotify_secret = self.config.get("SPOTIFY_CLIENT_SECRET")
        self.spotify = None
        if self.spotify_id and self.spotify_secret:
            try:
                self.spotify = spotipy.Spotify(
                    client_credentials_manager=SpotifyClientCredentials(
                        self.spotify_id, self.spotify_secret
                    )
                )
            except Exception as e:
                logger.warning(f"Spotify Init Failed: {e}")

        # Local cache folder for downloaded audio
        os.makedirs(self.download_folder, exist_ok=True)

        # Warm caches for instant playback
        self._stream_cache = {}   # video_id -> (url, headers, expires_at) — audio
        self._video_cache = {}    # video_id -> (url, headers, expires_at) — muted <video> visual
        self._related_cache = {}  # video_id -> (songs, fetched_at)
        # Per-key locks: concurrent requests for the same video share one
        # extraction/download instead of racing on the same files
        self._key_locks: Dict[str, asyncio.Lock] = {}

    @staticmethod
    def _is_live_entry(item) -> bool:
        """True for ongoing live streams (e.g. 24/7 radios) — this engine cannot
        relay them (they 404 on extraction), so they must never appear in
        search/recommendation results where they would fail silently."""
        try:
            return (item.get('live_status') or '').lower() == 'is_live'
        except Exception:
            return False

    @staticmethod
    def _fmt_duration(secs) -> str:
        try:
            s = int(float(secs))
            return f"{s // 60}:{s % 60:02d}"
        except (TypeError, ValueError):
            return "0:00"

    async def search(self, query: str, limit: int = 20):
        """Search YouTube via yt-dlp flat extraction — fast, no extra dependencies."""
        print(f"DEBUG: Searching for '{query}'...")
        # If Spotify Link — wrapped so a spotipy/network error returns [] instead
        # of a 500 (this branch runs before the main try/except below)
        if "spotify.com" in query:
            try:
                return await self._handle_spotify(query)
            except Exception as e:
                print(f"DEBUG: Spotify search error: {e}")
                return []

        def _extract():
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': 'in_playlist',   # search page only, no per-video fetches
                'skip_download': True,
                'playlist_items': f'1-{limit}',
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(f"ytsearch{limit}:{query.strip()}", download=False)

        try:
            info = await asyncio.get_running_loop().run_in_executor(None, _extract)
            songs = []
            for item in (info or {}).get('entries') or []:
                if not item:
                    continue
                if self._is_live_entry(item):
                    continue  # 24/7 live streams cannot be relayed — skip them
                vid = item.get('id') or ''
                if not vid:
                    continue
                thumbs = item.get('thumbnails') or []
                thumb = (thumbs[-1].get('url', '') if thumbs else '') or \
                        f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                songs.append({
                    "id": vid,
                    "title": item.get('title') or "Unknown",
                    "duration": self._fmt_duration(item.get('duration')),
                    "thumbnail": thumb,
                    "link": item.get('url') or f"https://www.youtube.com/watch?v={vid}",
                    "channel": item.get('channel') or item.get('uploader')
                              or item.get('uploader_id') or "Unknown",
                })
            print(f"DEBUG: Found {len(songs)} results")
            return songs
        except Exception as e:
            print(f"DEBUG: Search Error: {e}")
            return []

    async def get_related_videos(self, video_id: str, limit: int = 25):
        """Get YouTube's own radio mix recommendations for a video"""
        # Cached radio mix = instant recommendations for repeat plays
        cached = self._related_cache.get(video_id)
        if cached and time.time() - cached[1] < RELATED_TTL:
            return cached[0]

        print(f"DEBUG: Getting related videos for {video_id}...")
        try:
            # Use YouTube's Radio Mix playlist — this is YouTube's own recommendation engine
            mix_url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
            
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
                'skip_download': True,
                'playlist_items': f'1-{limit + 5}', # Fetch a few extra for filtering
                'extractor_args': {'youtube': ['player_client=android']}
            }

            def _extract():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(mix_url, download=False)
                    return info

            info = await asyncio.get_running_loop().run_in_executor(None, _extract)
            
            songs = []
            entries = info.get('entries', []) if info else []
            for item in entries:
                if not item:
                    continue
                if self._is_live_entry(item):
                    continue  # 24/7 live streams cannot be relayed — skip them
                vid = item.get('id', '')
                if vid == video_id:
                    continue  # Skip the current song
                songs.append({
                    "id": vid,
                    "title": item.get('title', 'Unknown') or 'Unknown',
                    "duration": str(item.get('duration', 0) or 0),
                    "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else "",
                    "link": f"https://www.youtube.com/watch?v={vid}" if vid else "",
                    "channel": item.get('uploader', 'Unknown') or item.get('channel', 'Unknown') or 'Unknown'
                })
                if len(songs) >= limit:
                    break
            
            # Format duration from seconds to MM:SS
            for song in songs:
                try:
                    secs = int(song['duration'])
                    song['duration'] = f"{secs // 60}:{secs % 60:02d}"
                except (TypeError, ValueError):
                    song['duration'] = "0:00"
            
            print(f"DEBUG: Found {len(songs)} related videos")
            if songs:
                self._related_cache[video_id] = (songs, time.time())
            return songs
        except Exception as e:
            print(f"DEBUG: Related videos error: {e}")
            return []

    async def _handle_spotify(self, link: str):
        if not self.spotify:
            return []
        
        if "/track/" in link:
            track = await asyncio.to_thread(self.spotify.track, link)
            artists = track.get('artists') or []
            artist_name = artists[0].get('name', '') if artists else ''
            query = f"{track.get('name', '')} {artist_name}".strip()
            if not query:
                return []
            return await self.search(query, limit=1)
        elif "/playlist/" in link:
            # For simplicity, we'll just search for the first few tracks
            pass
        return []

    async def get_stream_url(self, video_id: str):
        """Extract a direct googlevideo URL (kept for prefetch warming)."""
        src = await self.get_stream_source(video_id)
        return src[0] if src else None

    async def get_stream_source(self, video_id: str) -> Optional[Tuple[str, dict]]:
        """Return (url, http_headers) for the best audio format, cached."""
        # Cache hit = instant start (no yt-dlp round-trip)
        cached = self._stream_cache.get(video_id)
        if cached and time.time() < cached[2]:
            return cached[0], cached[1]

        url = f"https://www.youtube.com/watch?v={video_id}"

        def _extract(client):
            ydl_opts = {
                # Top audio quality: best Opus direct stream first (YouTube's
                # 160 kbps Opus is the best quality it offers), then any direct
                # https audio — never m3u8 playlists, which the closed-range
                # relay cannot carry.
                'format': 'bestaudio[acodec=opus][protocol=https]/bestaudio[protocol=https]/bestaudio',
                'quiet': True,
                'no_warnings': True,
                'force_generic_extractor': False,
            }
            if client:
                ydl_opts['extractor_args'] = {'youtube': [f'player_client={client}']}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                # Direct URL (googlevideo) — fast even when not HLS.
                # The matching http_headers MUST accompany the URL — the edge
                # 403s requests whose headers don't match the issued client.
                return info.get('url'), dict(info.get('http_headers') or {})

        # Single-flight: N simultaneous requests for the same video share one
        # extraction instead of all hammering YouTube
        lock = self._key_locks.setdefault(f"stream:{video_id}", asyncio.Lock())
        async with lock:
            cached = self._stream_cache.get(video_id)
            if cached and time.time() < cached[2]:
                return cached[0], cached[1]
            loop = asyncio.get_running_loop()
            try:
                try:
                    stream_url, headers = await loop.run_in_executor(None, _extract, 'android')
                except Exception as android_err:
                    # Some videos reject the android client — retry with the default web client
                    logger.warning(f"android client failed for {video_id}, retrying default: {android_err}")
                    stream_url, headers = await loop.run_in_executor(None, _extract, None)
                if stream_url:
                    self._stream_cache[video_id] = (stream_url, headers, time.time() + STREAM_TTL)
                    # Evict expired entries so the cache can't grow forever
                    if len(self._stream_cache) > 500:
                        now = time.time()
                        self._stream_cache = {
                            k: v for k, v in self._stream_cache.items() if now < v[2]
                        }
                return (stream_url, headers) if stream_url else None
            except Exception as e:
                logger.error(f"Stream extraction failed: {e}")
                return None

    def invalidate_stream(self, video_id: str):
        """Drop a cached stream URL (called when the edge rejects it)."""
        self._stream_cache.pop(video_id, None)

    async def get_video_source(self, video_id: str) -> Optional[Tuple[str, dict]]:
        """Return (url, http_headers) for a lean ≤480p/360p video, cached.

        A video-only DASH format is fine: the <video> element we feed is
        muted — the audio element plays the soundtrack — so no audio codec
        is required on this stream. We deliberately target SD/MP4 H.264,
        not 1080p — an 80 MB buffer takes too long to start on slow links
        and triggers 'video not available' on flaky connections.
        """
        cached = self._video_cache.get(video_id)
        if cached and time.time() < cached[2]:
            return cached[0], cached[1]

        url = f"https://www.youtube.com/watch?v={video_id}"

        def _extract(client):
            ydl_opts = {
                # Lean SD video: direct 360/480p mp4, H.264 first (Chromium
                # decodes it universally); AV1 video-only as a fallback.
                # Smaller buffer = first frame much sooner on slow connections.
                'format': 'bestvideo[height<=480][ext=mp4][protocol=https][vcodec^=avc]/bestvideo[height<=360][ext=mp4][protocol=https][vcodec^=avc]/bestvideo[height<=480][ext=mp4][protocol=https]/bestvideo[height<=360][ext=mp4][protocol=https]/bestvideo[height<=480][protocol=https]',
                'quiet': True,
                'no_warnings': True,
                'force_generic_extractor': False,
            }
            if client:
                ydl_opts['extractor_args'] = {'youtube': [f'player_client={client}']}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info.get('url'), dict(info.get('http_headers') or {})

        lock = self._key_locks.setdefault(f"video:{video_id}", asyncio.Lock())
        async with lock:
            cached = self._video_cache.get(video_id)
            if cached and time.time() < cached[2]:
                return cached[0], cached[1]
            loop = asyncio.get_running_loop()
            try:
                try:
                    stream_url, headers = await loop.run_in_executor(None, _extract, 'android')
                except Exception as android_err:
                    # android is usually fast; ios is the other safe client.
                    # Deliberately NO default-web-client retry: it hangs on the
                    # JS challenge for minutes with no JS runtime configured.
                    logger.warning(f"android client failed for video {video_id}, retrying ios: {android_err}")
                    stream_url, headers = await loop.run_in_executor(None, _extract, 'ios')
                if stream_url:
                    self._video_cache[video_id] = (stream_url, headers, time.time() + STREAM_TTL)
                    if len(self._video_cache) > 200:
                        now = time.time()
                        self._video_cache = {
                            k: v for k, v in self._video_cache.items() if now < v[2]
                        }
                return (stream_url, headers) if stream_url else None
            except Exception as e:
                logger.error(f"Video stream extraction failed: {e}")
                return None

    def invalidate_video(self, video_id: str):
        """Drop a cached video URL (called when the edge rejects it)."""
        self._video_cache.pop(video_id, None)

    async def _source(self, video_id: str, kind: str):
        """Pick the cached/extractor stream source by media kind."""
        if kind == "video":
            return await self.get_video_source(video_id)
        return await self.get_stream_source(video_id)

    def _invalidate(self, video_id: str, kind: str):
        if kind == "video":
            self.invalidate_video(video_id)
        else:
            self.invalidate_stream(video_id)

    async def probe_media(self, video_id: str, kind: str = "audio") -> Tuple[Optional[int], Optional[str]]:
        """Learn (total_size, content_type) via a 1-byte closed range request."""
        src = await self._source(video_id, kind)
        if not src:
            return None, None
        url, headers = src
        default_ctype = "video/mp4" if kind == "video" else "audio/webm"
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
                r = await c.get(url, headers={**headers, "Range": "bytes=0-0"})
                if r.status_code == 206:
                    cr = r.headers.get("content-range", "")
                    total = int(cr.rsplit("/", 1)[-1]) if "/" in cr else None
                    ctype = r.headers.get("content-type") or default_ctype
                    if total:
                        return total, ctype
                elif r.status_code in (403, 410, 416):
                    # URL expired/edge-rejected — refresh and retry once
                    self._invalidate(video_id, kind)
                    src = await self._source(video_id, kind)
                    if src:
                        url, headers = src
                        r = await c.get(url, headers={**headers, "Range": "bytes=0-0"})
                        if r.status_code == 206:
                            cr = r.headers.get("content-range", "")
                            total = int(cr.rsplit("/", 1)[-1]) if "/" in cr else None
                            ctype = r.headers.get("content-type") or default_ctype
                            if total:
                                return total, ctype
        except Exception as e:
            logger.error(f"probe_media failed for {video_id}: {e}")
        return None, None

    async def relay_chunks(self, video_id: str, start: int, end: int, kind: str = "audio"):
        """Yield media bytes for [start..end] using small CLOSED ranges.

        Some networks/edges 403 open-ended (bytes=0-) or large range requests,
        which kills both a raw redirect and yt-dlp downloads. Relaying fixed
        256 KB closed chunks with the client's native headers always works,
        and re-extracts once if the URL expires mid-stream.
        """
        pos = start
        retries = 0
        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
                while pos <= end:
                    src = await self._source(video_id, kind)
                    if not src:
                        logger.error(f"relay: no {kind} stream source for {video_id}")
                        return
                    url, headers = src
                    chunk_end = min(pos + RELAY_CHUNK - 1, end)
                    try:
                        async with c.stream(
                            "GET", url,
                            headers={**headers, "Range": f"bytes={pos}-{chunk_end}"},
                        ) as r:
                            logger.debug(f"relay chunk {video_id} bytes={pos}-{chunk_end} -> {r.status_code}")
                            if r.status_code == 206 or r.status_code == 200:
                                if r.status_code == 200:
                                    # Edge ignored the Range and is streaming the
                                    # whole body with no Content-Range header —
                                    # we must slice the bytes we need out of the
                                    # full body ourselves, otherwise the client
                                    # receives wrong bytes under a Range promise.
                                    span_start, span_end = pos, chunk_end + 1
                                    skipped = 0
                                    delivered = 0
                                    async for block in r.aiter_bytes():
                                        block_start = skipped
                                        skipped += len(block)
                                        lo = max(block_start, span_start)
                                        hi = min(skipped, span_end)
                                        if hi > lo:
                                            yield block[lo - block_start: hi - block_start]
                                            delivered += hi - lo
                                    pos = span_start + delivered
                                    logger.debug(f"relay range-ignored fallback {video_id} delivered {delivered}")
                                    if delivered == 0:
                                        raise httpx.HTTPError("empty 200 body")
                                    retries = 0
                                    continue
                                received = 0
                                async for block in r.aiter_bytes():
                                    received += len(block)
                                    yield block
                                if received == 0:
                                    raise httpx.HTTPError("empty 206 body")
                                pos += received
                                retries = 0
                                continue
                            if r.status_code in (403, 410, 416):
                                # URL went stale or edge hiccup — refresh & retry
                                self._invalidate(video_id, kind)
                            else:
                                logger.warning(
                                    f"relay unexpected status {r.status_code} "
                                    f"at byte {pos} for {video_id}")
                    except (httpx.HTTPError, OSError) as e:
                        logger.warning(f"relay chunk error at {pos}: {e}")
                        self._invalidate(video_id, kind)
                    retries += 1
                    if retries > 4:
                        logger.error(f"relay giving up on {video_id} at byte {pos}")
                        return
                    await asyncio.sleep(0.2 * retries)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"relay failed for {video_id}: {e}")

    async def get_audio_path(self, video_id: str, title: str = None):
        """Local cache first, then direct YouTube download via yt-dlp."""
        # 1. Local cache check
        local_path = os.path.join(self.download_folder, f"{video_id}.mp3")
        if os.path.exists(local_path):
            return local_path

        # 2. Fallback: yt-dlp (Direct YouTube Retrieval)
        # Per-video lock prevents two concurrent requests from downloading to
        # the same output path simultaneously (Windows rename collisions)
        lock = self._key_locks.setdefault(f"dl:{video_id}", asyncio.Lock())
        async with lock:
            if os.path.exists(local_path):
                return local_path
            return await self._download_ytdlp(video_id)

    async def _download_ytdlp(self, video_id):
        file_path = os.path.join(self.download_folder, f"{video_id}.mp3")
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Quality Handling: In a real app, we'd adjust based on 'quality' param
        # Here we use 'bestaudio' which is the standard High Quality
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': file_path.replace('.mp3', ''),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192', # High quality bitrate
            }],
            'quiet': True,
            'no_warnings': True,
            'extractor_args': {'youtube': ['player_client=android']}
        }
        
        def _dl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        
        try:
            await asyncio.get_running_loop().run_in_executor(None, _dl)
        except Exception as e:
            # Download may have succeeded while only FFmpeg post-processing
            # failed — don't give up, fall through and look for raw output
            logger.error(f"yt-dlp failed: {e}")

        # Check for various extensions (runs even after a post-process error)
        for ext in ['.mp3', '.m4a', '.webm']:
            p = file_path.replace('.mp3', ext)
            if os.path.exists(p):
                if ext != '.mp3':
                    try:
                        os.replace(p, file_path)
                    except OSError:
                        # Another request renamed it first — serve theirs
                        if os.path.exists(file_path):
                            return file_path
                        continue
                return file_path
        return None
