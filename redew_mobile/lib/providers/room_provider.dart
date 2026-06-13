import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config.dart';
import '../models/song.dart';
import '../services/api_service.dart';

class RoomProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  WebSocketChannel? _channel;
  String? _roomCode;
  List<String> _participants = [];
  bool _isHost = false;
  bool _allowSkips = true;
  bool _allowAddToQueue = true;
  bool _isPrivate = false;
  Song? _currentRoomTrack;
  bool _isPlaying = false;

  String? get roomCode => _roomCode;
  List<String> get participants => _participants;
  bool get isHost => _isHost;
  bool get allowSkips => _allowSkips;
  bool get allowAddToQueue => _allowAddToQueue;
  bool get isPrivate => _isPrivate;
  Song? get currentRoomTrack => _currentRoomTrack;
  bool get isPlaying => _isPlaying;

  Future<String> createRoom(String name) async {
    final data = await _api.createRoom(name);
    _roomCode = data['room_code'];
    _isHost = true;
    notifyListeners();
    return _roomCode!;
  }

  Future<void> joinRoom(String code, String username) async {
    _roomCode = code;
    final wsUrl = '${AppConfig.wsBaseUrl}/ws/room/$code?username=${Uri.encodeComponent(username)}';
    _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    _isHost = false;

    _channel!.stream.listen((message) {
      final msg = jsonDecode(message);
      _handleMessage(msg);
    });
    notifyListeners();
  }

  void _handleMessage(Map<String, dynamic> msg) {
    switch (msg['type']) {
      case 'PARTICIPANT_LIST':
        _participants = List<String>.from(msg['participants'] ?? []);
        break;
      case 'USER_JOIN':
        final username = msg['username'] as String;
        if (!_participants.contains(username)) {
          _participants.add(username);
        }
        break;
      case 'USER_LEAVE':
        _participants.remove(msg['username']);
        break;
      case 'SYNC_PLAY':
      case 'PLAY':
        final track = msg['track'];
        if (track != null) {
          _currentRoomTrack = Song.fromJson(track);
          _isPlaying = true;
        }
        break;
      case 'PAUSE':
        _isPlaying = false;
        break;
      case 'ROOM_SETTINGS':
        final settings = msg['settings'] ?? {};
        _allowSkips = settings['allow_skips'] ?? _allowSkips;
        _allowAddToQueue = settings['allow_add_to_queue'] ?? _allowAddToQueue;
        _isPrivate = settings['private_room'] ?? _isPrivate;
        break;
    }
    notifyListeners();
  }

  void broadcastRoomState(String type, Map<String, dynamic> data) {
    if (_channel == null) return;
    _channel!.sink.add(jsonEncode({
      'type': type,
      ...data,
    }));
  }

  void updateSettings(Map<String, dynamic> settings) {
    broadcastRoomState('UPDATE_SETTINGS', {'settings': settings});
    _allowSkips = settings['allow_skips'] ?? _allowSkips;
    _allowAddToQueue = settings['allow_add_to_queue'] ?? _allowAddToQueue;
    _isPrivate = settings['private_room'] ?? _isPrivate;
    notifyListeners();
  }

  Future<void> leaveRoom() async {
    _channel?.sink.close();
    _channel = null;
    _roomCode = null;
    _participants = [];
    _isHost = false;
    _currentRoomTrack = null;
    _isPlaying = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _channel?.sink.close();
    super.dispose();
  }
}
