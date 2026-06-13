class Song {
  final String id;
  final String title;
  final String channel;
  final String thumbnail;
  final String duration;
  final String? audioUrl;

  Song({
    required this.id,
    required this.title,
    required this.channel,
    required this.thumbnail,
    required this.duration,
    this.audioUrl,
  });

  factory Song.fromJson(Map<String, dynamic> json) {
    return Song(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Unknown',
      channel: json['channel']?.toString() ?? 'Unknown Artist',
      thumbnail: json['thumbnail']?.toString() ?? '',
      duration: json['duration']?.toString() ?? '0:00',
      audioUrl: json['audioUrl']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'channel': channel,
    'thumbnail': thumbnail,
    'duration': duration,
    'audioUrl': audioUrl,
  };
}
