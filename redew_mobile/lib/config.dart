import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  static String get apiBaseUrl {
    return dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:8000';
  }

  static String get wsBaseUrl {
    return apiBaseUrl.replaceFirst('http://', 'ws://').replaceFirst('https://', 'wss://');
  }
}
