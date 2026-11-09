import 'song.dart';

class Playlist {
  final int? id;
  final String name;
  final String? description;
  final String? image;
  final String? type;
  List<Song>? songs; // mutable to allow adding songs

  Playlist({
    this.id,
    required this.name,
    this.description,
    this.image,
    this.type,
    this.songs,
  });

  factory Playlist.fromJson(Map<String, dynamic> json) {
    return Playlist(
      id: json['id'] as int?,
      name: json['name']?.toString() ?? 'Untitled',
      description: json['description']?.toString(),
      image: json['image']?.toString(),
      type: json['type']?.toString(),
      songs: json['songs'] != null
          ? (json['songs'] as List).map((s) => Song.fromJson(s)).toList()
          : null,
    );
  }
}
