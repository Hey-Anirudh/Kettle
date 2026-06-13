class User {
  final int? id;
  final String username;
  final String? email;
  final String? profilePhoto;
  final bool? onboardingCompleted;

  User({
    this.id,
    required this.username,
    this.email,
    this.profilePhoto,
    this.onboardingCompleted,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as int?,
      username: json['username']?.toString() ?? 'Guest',
      email: json['email']?.toString(),
      profilePhoto: json['profile_photo']?.toString(),
      onboardingCompleted: json['onboarding_completed'] as bool?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'username': username,
    'email': email,
    'profile_photo': profilePhoto,
    'onboarding_completed': onboardingCompleted,
  };
}
