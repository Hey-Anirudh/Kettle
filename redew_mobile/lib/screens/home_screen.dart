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

                const SizedBox(height: 80), // space for player bar
              ],
            ),
          ),
          // Mini player at bottom
          bottomSheet: music.currentTrack != null ? _MiniPlayer(music: music) : null,
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
                (auth.user?.username ?? 'G')[0].toUpperCase(),
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 12),
            Text(auth.user?.username ?? 'Guest', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Text(auth.user?.email ?? '', style: TextStyle(color: Colors.grey[400])),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  auth.logout();
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

class _MiniPlayer extends StatelessWidget {
  final MusicProvider music;

  const _MiniPlayer({required this.music});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showFullPlayer(context),
      child: Container(
        height: 64,
        decoration: const BoxDecoration(
          color: Color(0xFF1E1E1E),
          border: Border(top: BorderSide(color: Color(0xFF282828))),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Image.network(
                music.currentTrack!.thumbnail,
                width: 48,
                height: 48,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  width: 48, height: 48,
                  color: Colors.grey[800],
                  child: const Icon(Icons.music_note, size: 24, color: Colors.grey),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    music.currentTrack!.title.split('|')[0].trim(),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    music.currentTrack!.channel,
                    style: TextStyle(fontSize: 11, color: Colors.grey[400]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            IconButton(
              icon: Icon(
                music.isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
                color: const Color(0xFFE60000),
                size: 32,
              ),
              onPressed: () => music.togglePlay(),
            ),
          ],
        ),
      ),
    );
  }

  void _showFullPlayer(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChangeNotifierProvider.value(
          value: music,
          child: const _FullPlayerScreen(),
        ),
      ),
    );
  }
}

class _FullPlayerScreen extends StatelessWidget {
  const _FullPlayerScreen();

  @override
  Widget build(BuildContext context) {
    return Consumer<MusicProvider>(
      builder: (context, music, _) {
        return Scaffold(
          backgroundColor: const Color(0xFF0A0A0A),
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.keyboard_arrow_down),
              onPressed: () => Navigator.pop(context),
            ),
          ),
          body: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              children: [
                // Album Art
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    music.currentTrack?.thumbnail ?? '',
                    height: 300,
                    width: 300,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      height: 300, width: 300,
                      color: Colors.grey[800],
                      child: const Icon(Icons.music_note, size: 80, color: Colors.grey),
                    ),
                  ),
                ),
                const SizedBox(height: 32),

                // Track info
                Text(
                  music.currentTrack?.title.split('|')[0].trim() ?? '',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text(
                  music.currentTrack?.channel ?? '',
                  style: TextStyle(fontSize: 16, color: Colors.grey[400]),
                ),
                const SizedBox(height: 32),

                // Progress bar
                Row(
                  children: [
                    Text(_formatDuration(music.position), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    Expanded(
                      child: SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          activeTrackColor: const Color(0xFFE60000),
                          inactiveTrackColor: const Color(0xFF282828),
                          thumbColor: const Color(0xFFE60000),
                          overlayColor: const Color(0x29E60000),
                        ),
                        child: Slider(
                          value: music.duration.inSeconds > 0
                              ? music.position.inSeconds / music.duration.inSeconds
                              : 0,
                          onChanged: (v) => music.seek(Duration(seconds: (v * music.duration.inSeconds).round())),
                        ),
                      ),
                    ),
                    Text(_formatDuration(music.duration), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ],
                ),
                const SizedBox(height: 16),

                // Controls
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    IconButton(
                      icon: Icon(Icons.shuffle, color: music.isShuffled ? const Color(0xFFE60000) : Colors.grey),
                      onPressed: music.toggleShuffle,
                    ),
                    IconButton(
                      icon: const Icon(Icons.skip_previous, color: Colors.white, size: 32),
                      onPressed: music.previous,
                    ),
                    Container(
                      decoration: const BoxDecoration(
                        color: Color(0xFFE60000),
                        shape: BoxShape.circle,
                      ),
                      child: IconButton(
                        icon: Icon(music.isPlaying ? Icons.pause : Icons.play_arrow, color: Colors.white, size: 36),
                        onPressed: music.togglePlay,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.skip_next, color: Colors.white, size: 32),
                      onPressed: music.next,
                    ),
                    IconButton(
                      icon: Icon(Icons.repeat, color: music.repeatMode != 'none' ? const Color(0xFFE60000) : Colors.grey),
                      onPressed: music.cycleRepeat,
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Volume
                Row(
                  children: [
                    const Icon(Icons.volume_down, color: Colors.grey, size: 18),
                    Expanded(
                      child: SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          activeTrackColor: Colors.grey,
                          inactiveTrackColor: const Color(0xFF282828),
                          thumbColor: Colors.white,
                          overlayColor: const Color(0x29FFFFFF),
                        ),
                        child: Slider(
                          value: music.volume,
                          onChanged: music.setVolume,
                        ),
                      ),
                    ),
                    const Icon(Icons.volume_up, color: Colors.grey, size: 18),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60);
    final seconds = d.inSeconds.remainder(60);
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
