import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart'
    hide Playlist;
import '../models/song.dart';
import '../models/playlist.dart';

class MusicProvider extends ChangeNotifier {
  final AudioPlayer _player = AudioPlayer();
  final Random _random = Random();

  // ─── YouTube / Piped ─────────────────────────────────
  YoutubeExplode? _yt;

  YoutubeExplode get _youtube {
    _yt ??= YoutubeExplode();
    return _yt!;
  }

  // Piped fallback instances
  static final List<String> _pipedInstances = [
    'https://pipedapi.com',
    'https://pipedapi.kavin.rocks',
    'https://piped.tokhmi.xyz',
    'https://pipedapi.smnz.de',
    'https://pipedapi.leptons.xyz',
    'https://api.piped.privacydev.net',
  ];
  String? _workingApi;

  // Invidious fallback instances
  static final List<String> _invidiousInstances = [
    'https://yewtu.be',
    'https://inv.nadeko.net',
    'https://invidious.private.coffee',
    'https://invidious.lunar.icu',
    'https://inv.odyssey346.dev',
  ];
  String? _workingInvidious;

  // Player state
  Song? _currentTrack;
  List<Song> _queue = [];
  int _currentIndex = 0;
  bool _isPlaying = false;
  double _volume = 0.5;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _isShuffled = false;
  String _repeatMode = 'none';

  // Local data
  List<Song> _searchResults = [];
  List<Song> _trending = [];
  List<Playlist> _playlists = [];
  List<Song> _likedSongs = [];
  Set<String> _likedIds = {};
  bool _isSearching = false;
  bool _isLoading = false;
  String _currentPage = 'home';
  Playlist? _currentPlaylist;
  String? _lastPlaybackError;

  // Rate limit retry
  static const int _maxRetries = 2;

  // Listeners
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<PlayerState>? _playerStateSub;

  Song? get currentTrack => _currentTrack;
  List<Song> get queue => _queue;
  bool get isPlaying => _isPlaying;
  double get volume => _volume;
  Duration get position => _position;
  Duration get duration => _duration;
  bool get isShuffled => _isShuffled;
  String get repeatMode => _repeatMode;
  List<Song> get searchResults => _searchResults;
  List<Song> get trending => _trending;
  List<Playlist> get playlists => _playlists;
  List<Song> get likedSongs => _likedSongs;
  Set<String> get likedIds => _likedIds;
  bool get isSearching => _isSearching;
  bool get isLoading => _isLoading;
  String get currentPage => _currentPage;
  Playlist? get currentPlaylist => _currentPlaylist;
  String? get lastPlaybackError => _lastPlaybackError;

  MusicProvider() {
    _positionSub = _player.positionStream.listen((p) {
      _position = p;
      notifyListeners();
    });
    _playerStateSub = _player.playerStateStream.listen((state) {
      _isPlaying = state.playing;
      if (state.processingState == ProcessingState.completed) {
        _onTrackComplete();
      }
      notifyListeners();
    });
    _loadLocalData();
  }

  // ─── Local Storage ──────────────────────────────────
  Future<void> _loadLocalData() async {
    final prefs = await SharedPreferences.getInstance();
    final likedJson = prefs.getString('liked_songs');
    if (likedJson != null) {
      final list = jsonDecode(likedJson) as List;
      _likedSongs = list.map((s) => Song.fromJson(s)).toList();
      _likedIds = _likedSongs.map((s) => s.id).toSet();
    }
    final plJson = prefs.getString('playlists');
    if (plJson != null) {
      final list = jsonDecode(plJson) as List;
      _playlists = list.map((p) => Playlist.fromJson(p)).toList();
    }
  }

  Future<void> _saveLikedSongs() async {
    final prefs = await SharedPreferences.getInstance();
    final json = jsonEncode(_likedSongs.map((s) => s.toJson()).toList());
    await prefs.setString('liked_songs', json);
  }

  Future<void> _savePlaylists() async {
    final prefs = await SharedPreferences.getInstance();
    final json = jsonEncode(_playlists.map((p) => {
      'name': p.name,
      'songs': p.songs?.map((s) => s.toJson()).toList(),
    }).toList());
    await prefs.setString('playlists', json);
  }

  void setPage(String page) {
    _currentPage = page;
    notifyListeners();
  }

  // ─── Piped API helpers (fallback) ─────────────────────
  Future<http.Response?> _pipedGet(String path) async {
    final instances = _workingApi != null ? [_workingApi!] : _pipedInstances;
    for (final base in instances) {
      try {
        final uri = Uri.parse('$base$path');
        final res = await http
            .get(uri, headers: {'Accept': 'application/json'})
            .timeout(const Duration(seconds: 8));
        if (res.statusCode == 200) {
          _workingApi = base;
          return res;
        }
      } catch (e) {
        print('Piped instance $base failed: $e');
      }
    }
    _workingApi = null;
    return null;
  }

  String _parseDuration(dynamic d) {
    if (d == null) return '0:00';
    if (d is int) {
      if (d <= 0) return '0:00';
      final minutes = (d ~/ 60).toString().padLeft(2, '0');
      final seconds = (d % 60).toString().padLeft(2, '0');
      return '$minutes:$seconds';
    }
    if (d is String) {
      final n = int.tryParse(d);
      if (n == null || n <= 0) return '0:00';
      final minutes = (n ~/ 60).toString().padLeft(2, '0');
      final seconds = (n % 60).toString().padLeft(2, '0');
      return '$minutes:$seconds';
    }
    return '0:00';
  }

  Future<List<Song>> _pipedSearch(String query) async {
    final res =
        await _pipedGet('/search?q=${Uri.encodeComponent(query)}&filter=videos');
    if (res == null) return [];
    final data = jsonDecode(res.body);
    final items = data['items'] as List? ?? [];
    return items.map((item) {
      final url = item['url']?.toString() ?? '';
      final videoId = url.startsWith('/watch?v=') ? url.substring(9) : url;
      return Song(
        id: videoId,
        title: item['title']?.toString() ?? 'Unknown',
        channel: item['uploaderName']?.toString() ?? 'Unknown Artist',
        thumbnail: item['thumbnail']?.toString() ?? '',
        duration: _parseDuration(item['duration']),
      );
    }).toList();
  }

  Future<String?> _pipedStreamUrl(String videoId) async {
    final res = await _pipedGet('/streams/$videoId');
    if (res == null) return null;
    final data = jsonDecode(res.body);
    final audioStreams = data['audioStreams'] as List? ?? [];
    if (audioStreams.isEmpty) return null;
    for (final s in audioStreams) {
      final url = s['url']?.toString();
      if (url != null && url.isNotEmpty) return url;
    }
    return null;
  }

  // ─── Invidious API helpers (fallback) ───────────────────
  Future<http.Response?> _invidiousGet(String path) async {
    final instances =
        _workingInvidious != null ? [_workingInvidious!] : _invidiousInstances;
    for (final base in instances) {
      try {
        final uri = Uri.parse('$base$path');
        final res = await http
            .get(uri, headers: {'Accept': 'application/json'})
            .timeout(const Duration(seconds: 8));
        if (res.statusCode == 200) {
          _workingInvidious = base;
          return res;
        }
      } catch (e) {
        print('Invidious instance $base failed: $e');
      }
    }
    _workingInvidious = null;
    return null;
  }

  Future<List<Song>> _invidiousSearch(String query) async {
    final res = await _invidiousGet(
        '/api/v1/search?q=${Uri.encodeComponent(query)}&type=video');
    if (res == null) return [];
    final items = jsonDecode(res.body) as List? ?? [];
    return items.map((item) {
      final secs = item['lengthSeconds'] is int ? item['lengthSeconds'] as int : 0;
      final mins = (secs ~/ 60).toString().padLeft(2, '0');
      final secsStr = (secs % 60).toString().padLeft(2, '0');
      final thumbs = item['videoThumbnails'] as List? ?? [];
      final thumb =
          thumbs.isNotEmpty ? thumbs[0]['url']?.toString() ?? '' : '';
      return Song(
        id: item['videoId']?.toString() ?? '',
        title: item['title']?.toString() ?? 'Unknown',
        channel: item['author']?.toString() ?? 'Unknown Artist',
        thumbnail: thumb,
        duration: '$mins:$secsStr',
      );
    }).toList();
  }

  Future<String?> _invidiousStreamUrl(String videoId) async {
    final res = await _invidiousGet('/api/v1/videos/$videoId');
    if (res == null) return null;
    final data = jsonDecode(res.body);
    final formats = data['adaptiveFormats'] as List? ?? [];
    if (formats.isEmpty) return null;
    // Prefer audio-only with highest bitrate
    String? bestUrl;
    int bestBitrate = 0;
    for (final f in formats) {
      final type = f['type']?.toString() ?? '';
      if (type.startsWith('audio')) {
        final url = f['url']?.toString();
        final bitrate = f['bitrate'] is int ? f['bitrate'] as int : 0;
        if (url != null && url.isNotEmpty && bitrate > bestBitrate) {
          bestUrl = url;
          bestBitrate = bitrate;
        }
      }
    }
    return bestUrl;
  }

  // ─── YouTube Explode helpers (primary) ─────────────────
  /// Run a [fn] that uses youtube_explode_dart, retrying up to [maxRetries]
  /// times with exponential backoff when rate-limited.
  Future<T> _ytWithRetry<T>(Future<T> Function() fn,
      {int retries = _maxRetries}) async {
    for (int attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        final isRateLimit = e.toString().contains('RequestLimitExceeded') ||
            e.toString().contains('rate limit') ||
            e.toString().contains('429');
        if (isRateLimit && attempt < retries) {
          final delay = Duration(seconds: 1 << (attempt + 1)); // 2s, 4s
          print(
              'YouTube rate limited (attempt ${attempt + 1}/$retries), retrying in ${delay.inSeconds}s...');
          await Future.delayed(delay);
          continue;
        }
        rethrow;
      }
    }
    throw Exception('All retries exhausted');
  }

  Future<List<Song>> _ytSearch(String query) async {
    try {
      final results = await _ytWithRetry(
        () => _youtube.search.search(query),
        retries: 1,
      );
      final songs = <Song>[];
      for (final result in results) {
        final secsTotal = result.duration?.inSeconds ?? 0;
        final mins = (secsTotal ~/ 60).toString().padLeft(2, '0');
        final secs = (secsTotal % 60).toString().padLeft(2, '0');
        songs.add(Song(
          id: result.id.value,
          title: result.title,
          channel: result.author,
          thumbnail: result.thumbnails.mediumResUrl,
          duration: '$mins:$secs',
        ));
      }
      return songs;
    } catch (e) {
      print('YouTube search error: $e');
      rethrow;
    }
  }

  /// Get stream URL from YouTube using youtube_explode_dart with retry.
  Future<String?> _ytStreamUrl(String videoId) async {
    try {
      final manifest = await _ytWithRetry(
        () => _youtube.videos.streams.getManifest(videoId),
        retries: _maxRetries,
      );
      final audio = manifest.audioOnly;
      if (audio.isEmpty) return null;
      // Prefer the highest quality audio
      final best = audio.last;
      return best.url.toString();
    } catch (e) {
      print('YouTube stream error: $e');
      return null;
    }
  }

  // ─── Combined search ──────────────────────────────────
  Future<List<Song>> _searchAll(String query,
      {bool isTrending = false}) async {
    // 1) Try youtube_explode_dart (works on most networks)
    try {
      final results = await _ytSearch(query);
      if (results.isNotEmpty) return results;
    } catch (e) {
      print('yt-explode search failed, trying Piped fallback: $e');
    }

    // 2) Fallback: try Piped instances
    try {
      final results = await _pipedSearch(query);
      if (results.isNotEmpty) return results;
    } catch (e) {
      print('Piped search fallback failed, trying Invidious: $e');
    }

    // 3) Fallback: try Invidious instances
    try {
      final results = await _invidiousSearch(query);
      if (results.isNotEmpty) return results;
    } catch (e) {
      print('Invidious search also failed: $e');
    }

    return [];
  }

  // ─── Search ──────────────────────────────────────────
  Future<void> search(String query) async {
    if (query.length < 2) return;
    _isSearching = true;
    notifyListeners();
    _searchResults = await _searchAll(query);
    _isSearching = false;
    notifyListeners();
  }

  // ─── Trending ────────────────────────────────────────
  Future<void> loadTrending() async {
    _isLoading = true;
    notifyListeners();
    try {
      _trending = await _searchAll('latest trending music', isTrending: true);
      if (_trending.isEmpty) {
        _trending = await _searchAll('trending music 2026', isTrending: true);
      }
    } catch (e) {
      print('Trending error: $e');
      _trending = [];
    }
    _isLoading = false;
    notifyListeners();
  }

  // ─── Quick Search ────────────────────────────────────
  Future<List<Song>> searchQuick(String query) async {
    try {
      return await _searchAll(query);
    } catch (e) {
      return [];
    }
  }

  // ─── Playback ────────────────────────────────────────
  Future<void> play(Song track, [List<Song>? trackList]) async {
    if (trackList != null) {
      _queue = trackList;
      _currentIndex = trackList.indexWhere((t) => t.id == track.id);
      if (_currentIndex == -1) _currentIndex = 0;
    } else {
      if (!_queue.any((t) => t.id == track.id)) {
        _queue.add(track);
        _currentIndex = _queue.length - 1;
      } else {
        _currentIndex = _queue.indexWhere((t) => t.id == track.id);
      }
    }
    _currentTrack = track;
    _lastPlaybackError = null;
    notifyListeners();

    try {
      print('Fetching stream for: ${track.id} - ${track.title}');

      String? streamUrl;

      // 1) Try Piped first (proxy-based, avoids YouTube rate limiting)
      streamUrl = await _pipedStreamUrl(track.id);
      if (streamUrl != null) {
        print('Using Piped stream URL');
      }

      // 2) Try Invidious (another proxy, might not be DNS-blocked)
      if (streamUrl == null) {
        print('Piped failed, trying Invidious...');
        streamUrl = await _invidiousStreamUrl(track.id);
        if (streamUrl != null) {
          print('Using Invidious stream URL');
        }
      }

      // 3) Fallback: youtube_explode_dart (direct from YouTube)
      if (streamUrl == null) {
        print('Invidious failed, trying youtube_explode_dart...');
        streamUrl = await _ytStreamUrl(track.id);
        if (streamUrl != null) {
          print('Using YouTube stream URL');
        }
      }

      if (streamUrl == null) {
        _lastPlaybackError =
            'Cannot play this track. Try again in a few minutes or use a VPN.';
        notifyListeners();
        return;
      }

      print('Audio stream URL: $streamUrl');
      await _player.setAudioSource(AudioSource.uri(Uri.parse(streamUrl)));
      await _player.play();
      print('Playback started successfully');
    } catch (e) {
      final errMsg = e.toString();
      if (errMsg.contains('RequestLimitExceeded') ||
          errMsg.contains('rate limit') ||
          errMsg.contains('429')) {
        _lastPlaybackError =
            'YouTube rate limit reached. Please wait a minute and try again, or use a VPN.';
      } else {
        _lastPlaybackError = 'Playback failed: ${e.toString().split('\n').first}';
      }
      print('Playback error: $e');
      notifyListeners();
    }
  }

  void clearError() {
    _lastPlaybackError = null;
    notifyListeners();
  }

  void togglePlay() {
    if (_player.playing) {
      _player.pause();
    } else {
      _player.play();
    }
  }

  void seek(Duration pos) => _player.seek(pos);

  void setVolume(double vol) {
    _volume = vol;
    _player.setVolume(vol);
    notifyListeners();
  }

  void next() {
    if (_queue.isEmpty) return;
    if (_repeatMode == 'one') {
      _player.seek(Duration.zero);
      _player.play();
      return;
    }
    int nextIdx;
    if (_isShuffled) {
      nextIdx = _random.nextInt(_queue.length);
      while (nextIdx == _currentIndex && _queue.length > 1) {
        nextIdx = _random.nextInt(_queue.length);
      }
    } else {
      nextIdx = (_currentIndex + 1) % _queue.length;
    }
    if (nextIdx == 0 && _repeatMode == 'none') {
      _player.pause();
      return;
    }
    _currentIndex = nextIdx;
    play(_queue[_currentIndex]);
  }

  void previous() {
    if (_queue.isEmpty) return;
    if (_position.inSeconds > 3) {
      _player.seek(Duration.zero);
      return;
    }
    _currentIndex = (_currentIndex - 1 + _queue.length) % _queue.length;
    play(_queue[_currentIndex]);
  }

  void toggleShuffle() {
    _isShuffled = !_isShuffled;
    notifyListeners();
  }

  void cycleRepeat() {
    if (_repeatMode == 'none') _repeatMode = 'all';
    else if (_repeatMode == 'all') _repeatMode = 'one';
    else _repeatMode = 'none';
    notifyListeners();
  }

  void _onTrackComplete() {
    next();
  }

  // ─── Library (Local) ────────────────────────────────
  Future<void> toggleLike(Song track) async {
    if (_likedIds.contains(track.id)) {
      _likedIds.remove(track.id);
      _likedSongs.removeWhere((s) => s.id == track.id);
    } else {
      _likedIds.add(track.id);
      _likedSongs.add(track);
    }
    await _saveLikedSongs();
    notifyListeners();
  }

  // ─── Playlists (Local) ──────────────────────────────
  Future<void> createPlaylist(String name) async {
    final pl = Playlist(name: name, songs: []);
    _playlists.add(pl);
    await _savePlaylists();
    notifyListeners();
  }

  Future<void> addToPlaylist(String playlistName, Song track) async {
    for (var pl in _playlists) {
      if (pl.name == playlistName) {
        pl.songs ??= [];
        pl.songs!.add(track);
        break;
      }
    }
    await _savePlaylists();
    notifyListeners();
  }

  void playFromPlaylist(Playlist playlist, [int startIndex = 0]) {
    if (playlist.songs == null || playlist.songs!.isEmpty) return;
    play(playlist.songs![startIndex], playlist.songs);
  }

  // ─── Queue Management ────────────────────────────────
  void addToQueue(Song track) {
    _queue.add(track);
    notifyListeners();
  }

  void removeFromQueue(int index) {
    if (index >= 0 && index < _queue.length) {
      _queue.removeAt(index);
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _yt?.close();
    _positionSub?.cancel();
    _playerStateSub?.cancel();
    _player.dispose();
    super.dispose();
  }
}
