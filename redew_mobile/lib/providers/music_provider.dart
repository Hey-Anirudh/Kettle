import 'dart:async';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart' hide Playlist;
import '../models/song.dart';
import '../models/playlist.dart';
import '../services/api_service.dart';

class MusicProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  final AudioPlayer _player = AudioPlayer();
  final YoutubeExplode _yt = YoutubeExplode();

  // Player state
  Song? _currentTrack;
  List<Song> _queue = [];
  int _currentIndex = 0;
  bool _isPlaying = false;
  double _volume = 0.5;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _isShuffled = false;
  String _repeatMode = 'none'; // none, one, all

  // UI state
  List<Song> _searchResults = [];
  List<Song> _trending = [];
  List<Playlist> _playlists = [];
  List<Song> _likedSongs = [];
  Set<String> _likedIds = {};
  bool _isSearching = false;
  bool _isLoading = false;
  String _currentPage = 'home';
  Playlist? _currentPlaylist;

  // Audio player listeners
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
  }

  void setPage(String page) {
    _currentPage = page;
    notifyListeners();
  }

  // ─── Search ──────────────────────────────────────────
  Future<void> search(String query) async {
    if (query.length < 2) return;
    _isSearching = true;
    notifyListeners();
    try {
      _searchResults = await _api.search(query);
      _api.recordSearchHistory(query);
    } catch (e) {
      _searchResults = [];
    }
    _isSearching = false;
    notifyListeners();
  }

  // ─── Trending ────────────────────────────────────────
  Future<void> loadTrending() async {
    _isLoading = true;
    notifyListeners();
    try {
      _trending = await _api.getTrending();
    } catch (e) {
      _trending = [];
    }
    _isLoading = false;
    notifyListeners();
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
    notifyListeners();

    try {
      // Get audio URL from YouTube
      final manifest = await _yt.videos.streamsClient.getManifest(track.id);
      final audioUrl = manifest.audioOnly.first.url.toString();
      await _player.setAudioSource(AudioSource.uri(Uri.parse(audioUrl)));
      await _player.play();
    } catch (e) {
      // Fallback: try audio-only stream
      try {
        final streamInfo = await _yt.videos.streamsClient.getManifest(track.id);
        final audio = streamInfo.audioOnly.first;
        await _player.setAudioSource(AudioSource.uri(audio.url));
        await _player.play();
      } catch (e2) {
        debugPrint('Playback error: $e2');
      }
    }
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
      nextIdx = (_currentIndex + 1) % _queue.length;
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

  // ─── Library ──────────────────────────────────────────
  Future<void> loadLibrary() async {
    try {
      _likedSongs = await _api.getLikedSongs();
      _likedIds = _likedSongs.map((s) => s.id).toSet();
      _playlists = await _api.getPlaylists();
    } catch (e) {
      // ignore
    }
    notifyListeners();
  }

  Future<void> toggleLike(Song track) async {
    try {
      if (_likedIds.contains(track.id)) {
        await _api.unlikeSong(track.id);
        _likedIds.remove(track.id);
        _likedSongs.removeWhere((s) => s.id == track.id);
      } else {
        await _api.likeSong(track.id);
        _likedIds.add(track.id);
        _likedSongs.add(track);
      }
    } catch (e) {
      // ignore
    }
    notifyListeners();
  }

  // ─── Playlists ────────────────────────────────────────
  Future<void> createPlaylist(String name) async {
    try {
      await _api.createPlaylist(name);
      _playlists = await _api.getPlaylists();
    } catch (e) {
      // ignore
    }
    notifyListeners();
  }

  Future<void> loadPlaylist(int id) async {
    try {
      _currentPlaylist = await _api.getPlaylist(id);
      setPage('playlist');
    } catch (e) {
      // ignore
    }
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

  void playNext(Song track) {
    _queue.insert(_currentIndex + 1, track);
    notifyListeners();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _playerStateSub?.cancel();
    _player.dispose();
    _yt.close();
    super.dispose();
  }
}
