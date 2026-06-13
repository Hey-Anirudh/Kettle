import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StorageService {
  static const _tokenKey = 'auth_token';
  static const _usernameKey = 'username';
  static const _userIdKey = 'user_id';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<String?> getToken() async {
    return await _storage.read(key: _tokenKey);
  }

  Future<void> deleteToken() async {
    await _storage.delete(key: _tokenKey);
  }

  Future<void> saveUser(String username, int userId) async {
    await _storage.write(key: _usernameKey, value: username);
    await _storage.write(key: _userIdKey, value: userId.toString());
  }

  Future<String?> getUsername() async {
    return await _storage.read(key: _usernameKey);
  }

  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
