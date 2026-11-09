import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/music_provider.dart';
import '../models/song.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MusicProvider>().loadTrending();
    });
  }

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final greeting = hour >= 6 && hour < 12
        ? 'Good Morning'
        : hour >= 12 && hour < 18
            ? 'Good Afternoon'
            : hour >= 18 && hour < 22
                ? 'Good Evening'
                : 'Late Night';

    return Consumer2<MusicProvider, AuthProvider>(
      builder: (context, music, auth, _) {
        return Scaffold(
          appBar: AppBar(
            title: Row(
              children: [
                const Icon(Icons.music_note, color: Color(0xFFE60000)),
                const SizedBox(width: 8),
                Text('Redew', style: TextStyle(color: Colors.grey[300], fontWeight: FontWeight.bold)),
              ],
            ),
            backgroundColor: const Color(0xFF0A0A0A),
            actions: [
              IconButton(
                icon: const Icon(Icons.person_outline),
                onPressed: () => _showAccountSheet(context, auth),
              ),
            ],
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Greeting
                Text(
                  greeting,
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 24),

                // Trending section
                const Text(
                  'Trending Now',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 200,
                  child: music.isLoading
                      ? const Center(child: CircularProgressIndicator(color: Color(0xFFE60000)))
                      : ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: music.trending.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 12),
                          itemBuilder: (context, i) {
                            final track = music.trending[i];
                            return _MusicCard(
                              track: track,
                              onTap: () => music.play(track, music.trending),
                            );
                          },
                        ),
                ),
                const SizedBox(height: 32),

                // Quick Play section
                const Text(
                  'Quick Picks',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                _QuickPickCard(
                  title: 'Chill Vibes',
                  subtitle: 'Lo-fi, ambient & smooth beats',
                  color: const Color(0xFF1DB954),
                  icon: Icons.nightlight_round,
                  onTap: () => _searchAndPlay(music, 'chill vibes'),
                ),
                const SizedBox(height: 8),
                _QuickPickCard(
                  title: 'Bollywood Hits',
                  subtitle: 'Top Bollywood tracks',
                  color: const Color(0xFFE60000),
                  icon: Icons.star,
                  onTap: () => _searchAndPlay(music, 'bollywood hits 2026'),
                ),
                const SizedBox(height: 8),
                _QuickPickCard(
                  title: 'Workout Energy',
                  subtitle: 'High energy pump-up tracks',
                  color: const Color(0xFFFF6B35),
                  icon: Icons.fitness_center,
                  onTap: () => _searchAndPlay(music, 'workout music energetic'),
                ),
                const SizedBox(height: 8),
                _QuickPickCard(
                  title: 'Punjabi 2026',
                  subtitle: 'Latest Punjabi bangers',
                  color: const Color(0xFF450af5),
                  icon: Icons.headphones,
                  onTap: () => _searchAndPlay(music, 'punjabi songs 2026'),
                ),

                const SizedBox(height: 80),
              ],
            ),
          ),
        );
      },
    );
  }

  void _searchAndPlay(MusicProvider music, String query) async {
    await music.search(query);
    if (music.searchResults.isNotEmpty) {
      music.play(music.searchResults[0], music.searchResults);
    }
  }

  void _showAccountSheet(BuildContext context, AuthProvider auth) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E1E1E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: const Color(0xFFE60000),
              child: Text(
                auth.username[0].toUpperCase(),
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 12),
            Text(auth.username, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Text('Local Mode', style: TextStyle(color: Colors.grey[400])),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  Navigator.pop(ctx);
                  await auth.logout();
                },
                icon: const Icon(Icons.logout, color: Colors.red),
                label: const Text('Log out', style: TextStyle(color: Colors.red)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.red)),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _MusicCard extends StatelessWidget {
  final Song track;
  final VoidCallback onTap;

  const _MusicCard({required this.track, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 150,
        decoration: BoxDecoration(
          color: const Color(0xFF121212),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              child: Image.network(
                track.thumbnail,
                height: 150,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  height: 150,
                  color: Colors.grey[800],
                  child: const Icon(Icons.music_note, size: 48, color: Colors.grey),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    track.title.split('|')[0].trim(),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    track.channel,
                    style: TextStyle(fontSize: 10, color: Colors.grey[400]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickPickCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  const _QuickPickCard({
    required this.title,
    required this.subtitle,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF121212),
      child: ListTile(
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(color: color.withAlpha(50), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(subtitle, style: TextStyle(color: Colors.grey[400])),
        trailing: const Icon(Icons.play_circle_outline, color: Color(0xFFE60000)),
        onTap: onTap,
      ),
    );
  }
}


