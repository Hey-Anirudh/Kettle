/// App configuration for standalone (no-backend) mode.
/// Configuration values are now compile-time constants since there's no backend.
class AppConfig {
  /// No backend URL is needed — the app runs fully offline/on-device.
  static const String apiBaseUrl = '';
  static const String wsBaseUrl = '';
}
