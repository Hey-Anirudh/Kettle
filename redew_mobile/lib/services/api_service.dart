import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../models/song.dart';
import '../models/user.dart';
import '../models/playlist.dart';
import 'storage_service.dart';

class ApiService {
  final StorageService _storage = StorageService();
  String get _baseUrl => AppConfig.apiBaseUrl;

  Future<Map<String, String>> _headers() async {
    final token = await _storage.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // ─── Auth ───────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String username, String password) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception(jsonDecode(res.body)['detail'] ?? 'Login failed');
  }

  Future<Map<String, dynamic>> register(String username, String email, String password) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'email': email, 'password': password}),
    );
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception(jsonDecode(res.body)['detail'] ?? 'Registration failed');
  }

  Future<String> getGoogleAuthUrl() async {
    final res = await http.get(Uri.parse('$_baseUrl/auth/google/start'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return data['url'];
    }
    throw Exception('Failed to start Google auth');
  }

  Future<Map<String, dynamic>?> pollGoogleAuth(String sessionId) async {
    final res = await http.get(Uri.parse('$_baseUrl/auth/google/poll/$sessionId'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      if (data['status'] == 'complete') return data;
    }
    return null;
  }

  // ─── User ───────────────────────────────────────────────
  Future<User> getMe() async {
    final res = await http.get(Uri.parse('$_baseUrl/users/me'), headers: await _headers());
    if (res.statusCode == 200) return User.fromJson(jsonDecode(res.body));
    throw Exception('Failed to get user');
  }

  Future<void> updateProfile({String? username, String? email, String? profilePhoto}) async {
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    if (email != null) body['email'] = email;
    if (profilePhoto != null) body['profile_photo'] = profilePhoto;
    await http.put(Uri.parse('$_baseUrl/users/profile'), headers: await _headers(), body: jsonEncode(body));
  }

  Future<void> submitOnboarding(List<String> genres, List<String> artists) async {
    await http.post(
      Uri.parse('$_baseUrl/users/onboarding'),
      headers: await _headers(),
      body: jsonEncode({'genres': genres, 'artists': artists}),
    );
  }

  // ─── Music ──────────────────────────────────────────────
  Future<List<Song>> search(String query) async {
    final res = await http.get(Uri.parse('$_baseUrl/search?q=${Uri.encodeComponent(query)}'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return (data['results'] as List).map((s) => Song.fromJson(s)).toList();
    }
    return [];
  }

  Future<List<Song>> getTrending() async {
    final res = await http.get(Uri.parse('$_baseUrl/search?q=latest+trending+music+hits'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return (data['results'] as List).map((s) => Song.fromJson(s)).toList();
    }
    return [];
  }

  Future<List<Playlist>> getFeaturedPlaylists() async {
    final res = await http.get(Uri.parse('$_baseUrl/featured-playlists'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return (data as List).map((p) => Playlist.fromJson(p)).toList();
    }
    return [];
  }

  Future<void> recordSearchHistory(String query) async {
    final token = await _storage.getToken();
    if (token == null) return;
    await http.post(
      Uri.parse('$_baseUrl/users/search-history?q=${Uri.encodeComponent(query)}'),
      headers: await _headers(),
    );
  }

  // ─── Library ────────────────────────────────────────────
  Future<List<Song>> getLikedSongs() async {
    final res = await http.get(Uri.parse('$_baseUrl/liked-songs'), headers: await _headers());
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return (data['songs'] as List).map((s) => Song.fromJson(s)).toList();
    }
    return [];
  }

  Future<void> likeSong(String songId) async {
    await http.post(Uri.parse('$_baseUrl/like/$songId'), headers: await _headers());
  }

  Future<void> unlikeSong(String songId) async {
    await http.delete(Uri.parse('$_baseUrl/like/$songId'), headers: await _headers());
  }

  // ─── Playlists ──────────────────────────────────────────
  Future<List<Playlist>> getPlaylists() async {
    final res = await http.get(Uri.parse('$_baseUrl/playlists'), headers: await _headers());
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return (data as List).map((p) => Playlist.fromJson(p)).toList();
    }
    return [];
  }

  Future<Playlist> getPlaylist(int id) async {
    final res = await http.get(Uri.parse('$_baseUrl/playlists/$id'), headers: await _headers());
    if (res.statusCode == 200) return Playlist.fromJson(jsonDecode(res.body));
    throw Exception('Playlist not found');
  }

  Future<Map<String, dynamic>> createPlaylist(String name) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/playlists'),
      headers: await _headers(),
      body: jsonEncode({'name': name}),
    );
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception('Failed to create playlist');
  }

  Future<void> addToPlaylist(int playlistId, String songId) async {
    await http.post(
      Uri.parse('$_baseUrl/playlists/$playlistId/songs'),
      headers: await _headers(),
      body: jsonEncode({'song_id': songId}),
    );
  }

  // ─── Rooms / Jam ────────────────────────────────────────
  Future<Map<String, dynamic>> createRoom(String name) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/rooms?name=${Uri.encodeComponent(name)}'),
      headers: await _headers(),
    );
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception('Failed to create room');
  }

  Future<Map<String, dynamic>> getRoom(String code) async {
    final res = await http.get(Uri.parse('$_baseUrl/rooms/$code'));
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception('Room not found');
  }
}
