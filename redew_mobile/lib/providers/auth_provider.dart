import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AuthStatus { uninitialized, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus _status = AuthStatus.uninitialized;
  String _username = 'Guest';
  String? _error;

  AuthStatus get status => _status;
  String get username => _username;
  String? get error => _error;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  /// Try to restore a saved username on startup.
  Future<void> tryAutoLogin() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUsername = prefs.getString('username');
    if (savedUsername != null && savedUsername.isNotEmpty) {
      _username = savedUsername;
      _status = AuthStatus.authenticated;
    } else {
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  /// "Login" — just saves the username locally.
  Future<bool> login(String username) async {
    if (username.trim().isEmpty) {
      _error = 'Username cannot be empty';
      notifyListeners();
      return false;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('username', username.trim());
    _username = username.trim();
    _status = AuthStatus.authenticated;
    _error = null;
    notifyListeners();
    return true;
  }

  /// "Register" is the same as login in local mode.
  Future<bool> register(String username, String email, String password) async {
    return login(username);
  }

  /// Enter as a guest with a default name.
  void enterAsGuest() {
    final guestId = DateTime.now().millisecondsSinceEpoch % 10000;
    _username = 'Guest$guestId';
    _status = AuthStatus.authenticated;
    _error = null;
    notifyListeners();
  }

  /// Logout — clear stored username.
  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('username');
    _username = 'Guest';
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
