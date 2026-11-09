import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/music_provider.dart';
import 'providers/room_provider.dart';
import 'screens/home_screen.dart';
import 'screens/auth_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const RedewApp());
}

class RedewApp extends StatelessWidget {
  const RedewApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()..tryAutoLogin()),
        ChangeNotifierProvider(create: (_) => MusicProvider()),
        ChangeNotifierProvider(create: (_) => RoomProvider()),
      ],
      child: MaterialApp(
        title: 'Redew Music',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          brightness: Brightness.dark,
          scaffoldBackgroundColor: const Color(0xFF0A0A0A),
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFFE60000),
            secondary: Color(0xFF1DB954),
            surface: Color(0xFF121212),
          ),
          fontFamily: 'Inter',
          useMaterial3: true,
        ),
        home: const AppShell(),
      ),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _currentNavIndex = 0;

  final List<Widget> _pages = const [
    HomeScreen(),
    SearchScreen(),
    LibraryScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, auth, _) {
        if (auth.status == AuthStatus.uninitialized) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator(color: Color(0xFFE60000))),
          );
        }
        if (auth.status == AuthStatus.unauthenticated) {
          return const AuthScreen();
        }
        // Authenticated — build with global mini player
        return Consumer<MusicProvider>(
          builder: (context, music, _) {
            // Show playback error snackbar
            final error = music.lastPlaybackError;
            if (error != null) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (context.mounted && music.lastPlaybackError != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(error, style: const TextStyle(color: Colors.white)),
                      backgroundColor: Colors.red.shade800,
                      action: SnackBarAction(label: 'OK', onPressed: () => music.clearError()),
                      duration: const Duration(seconds: 4),
                    ),
                  );
                  music.clearError();
                }
              });
            }

            return Scaffold(
              body: _pages[_currentNavIndex],
              bottomNavigationBar: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Global mini player (visible on all tabs)
                  if (music.currentTrack != null)
                    _GlobalMiniPlayer(music: music),
                  BottomNavigationBar(
                    currentIndex: _currentNavIndex,
                    onTap: (i) => setState(() => _currentNavIndex = i),
                    backgroundColor: const Color(0xFF0A0A0A),
                    selectedItemColor: const Color(0xFFE60000),
                    unselectedItemColor: Colors.grey,
                    type: BottomNavigationBarType.fixed,
                    items: const [
                      BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Home'),
                      BottomNavigationBarItem(icon: Icon(Icons.search_outlined), activeIcon: Icon(Icons.search), label: 'Search'),
                      BottomNavigationBarItem(icon: Icon(Icons.library_music_outlined), activeIcon: Icon(Icons.library_music), label: 'Library'),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

// ─── Search Screen (embedded in main) ──────────────────────
class SearchScreen extends StatelessWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<MusicProvider>(
      builder: (context, music, _) {
        return Scaffold(
          appBar: AppBar(
            title: TextField(
              decoration: InputDecoration(
                hintText: 'Search for music...',
                hintStyle: TextStyle(color: Colors.grey[600]),
                border: InputBorder.none,
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
              ),
              style: const TextStyle(color: Colors.white, fontSize: 16),
              onChanged: (q) => music.search(q),
            ),
            backgroundColor: const Color(0xFF0A0A0A),
          ),
          body: music.isSearching
              ? const Center(child: CircularProgressIndicator(color: Color(0xFFE60000)))
              : music.searchResults.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.search, size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text('Find your favorite songs', style: TextStyle(color: Colors.grey, fontSize: 18)),
                          SizedBox(height: 8),
                          Text('Search for songs, artists, and albums', style: TextStyle(color: Colors.grey)),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: music.searchResults.length,
                      itemBuilder: (context, i) {
                        final track = music.searchResults[i];
                        return _TrackListItem(
                          track: track,
                          onTap: () => music.play(track, music.searchResults),
                          isLiked: music.likedIds.contains(track.id),
                          onLike: () => music.toggleLike(track),
                        );
                      },
                    ),
        );
      },
    );
  }
}

// ─── Library Screen (embedded in main) ────────────────────
class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<MusicProvider>(
      builder: (context, music, _) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Your Library', style: TextStyle(fontWeight: FontWeight.bold)),
            backgroundColor: const Color(0xFF0A0A0A),
            actions: [
              IconButton(
                icon: const Icon(Icons.add),
                onPressed: () => _showCreatePlaylistDialog(context),
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Liked Songs
              Card(
                color: const Color(0xFF121212),
                child: ListTile(
                  leading: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      gradient: const LinearGradient(colors: [Color(0xFF450af5), Color(0xFFc4efd9)]),
                    ),
                    child: const Icon(Icons.favorite, color: Colors.white),
                  ),
                  title: const Text('Liked Songs', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text('${music.likedSongs.length} songs'),
                  onTap: () {
                    if (music.likedSongs.isNotEmpty) {
                      music.play(music.likedSongs[0], music.likedSongs);
                    }
                  },
                ),
              ),
              const SizedBox(height: 16),
              // Playlists
              ...music.playlists.map((pl) => Card(
                color: const Color(0xFF121212),
                child: ListTile(
                  leading: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      color: const Color(0xFF282828),
                    ),
                    child: const Icon(Icons.playlist_play, color: Colors.white),
                  ),
                  title: Text(pl.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('Playlist'),
                  onTap: () => music.playFromPlaylist(pl),
                ),
              )),
            ],
          ),
        );
      },
    );
  }

  void _showCreatePlaylistDialog(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF282828),
        title: const Text('Create Playlist', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Playlist name',
            hintStyle: TextStyle(color: Colors.grey),
          ),
          style: const TextStyle(color: Colors.white),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                context.read<MusicProvider>().createPlaylist(controller.text);
                Navigator.pop(ctx);
              }
            },
            child: const Text('Create', style: TextStyle(color: Color(0xFFE60000))),
          ),
        ],
      ),
    );
  }
}

// ─── Global Mini Player ────────────────────────────────────
class _GlobalMiniPlayer extends StatelessWidget {
  final MusicProvider music;

  const _GlobalMiniPlayer({required this.music});

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

// ─── Full Player Screen ────────────────────────────────────
class _FullPlayerScreen extends StatelessWidget {
  const _FullPlayerScreen();

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60);
    final seconds = d.inSeconds.remainder(60);
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

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
}

// ─── Shared Track List Item ───────────────────────────────
class _TrackListItem extends StatelessWidget {
  final dynamic track;
  final VoidCallback onTap;
  final bool isLiked;
  final VoidCallback onLike;

  const _TrackListItem({
    required this.track,
    required this.onTap,
    required this.isLiked,
    required this.onLike,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Image.network(
                track.thumbnail,
                width: 48,
                height: 48,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  width: 48, height: 48,
                  color: Colors.grey[800],
                  child: const Icon(Icons.music_note, color: Colors.grey),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    track.title.split('|')[0].trim(),
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    track.channel,
                    style: TextStyle(fontSize: 12, color: Colors.grey[400]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            IconButton(
              icon: Icon(
                isLiked ? Icons.favorite : Icons.favorite_border,
                color: isLiked ? const Color(0xFF1DB954) : Colors.grey,
                size: 20,
              ),
              onPressed: onLike,
            ),
          ],
        ),
      ),
    );
  }
}
