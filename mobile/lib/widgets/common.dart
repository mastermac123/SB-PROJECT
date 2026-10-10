import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api.dart';
import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import 'motion.dart';

void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

String errorText(Object e) => e is ApiError ? e.message : 'Something went wrong. Please try again.';

/// Runs an action, shows the server's error as a toast if it fails. Returns true on success.
Future<bool> attempt(BuildContext context, Future<void> Function() action, {String? success}) async {
  try {
    await action();
    if (success != null && context.mounted) toast(context, success);
    return true;
  } catch (e) {
    if (context.mounted) toast(context, errorText(e));
    return false;
  }
}

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.photo, this.size = 44});
  final String name;
  final String? photo;
  final double size;

  ImageProvider? get _image {
    final p = photo;
    if (p == null || p.isEmpty) return null;
    if (p.startsWith('data:')) {
      try {
        return MemoryImage(base64Decode(p.substring(p.indexOf(',') + 1)));
      } catch (_) {
        return null;
      }
    }
    if (p.startsWith('https://')) return NetworkImage(p);
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).take(2).map((s) => s[0].toUpperCase()).join();
    final img = _image;
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: RS.primary100,
      foregroundImage: img,
      child: Text(initials.isEmpty ? '?' : initials, style: RS.heading(size * 0.36, color: RS.primary700)),
    );
  }
}

class RatingText extends StatelessWidget {
  const RatingText(this.user, {super.key});
  final PublicUser user;
  @override
  Widget build(BuildContext context) {
    if (user.ratingCount == 0) {
      return const Text('New', style: TextStyle(color: RS.ink500, fontWeight: FontWeight.w600, fontSize: 13));
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.star_rounded, size: 16, color: Color(0xFFF5A524)),
      const SizedBox(width: 2),
      Text(user.rating.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
      Text(' (${user.ratingCount})', style: const TextStyle(color: RS.ink500, fontSize: 13)),
    ]);
  }
}

class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.color = RS.primary, this.background = RS.primary50, this.icon});
  final String label;
  final Color color;
  final Color background;
  final IconData? icon;

  factory Pill.status(String status, String label) {
    final (c, b) = switch (status) {
      'completed' || 'confirmed' || 'received' || 'paid_online' => (RS.success, RS.success50),
      'pending' || 'accepted' || 'marked_paid' => (RS.warning, RS.warning50),
      'cancelled' || 'rejected' || 'refunded' => (RS.danger, RS.danger50),
      _ => (RS.primary, RS.primary50),
    };
    return Pill(label, color: c, background: b);
  }

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 4)],
          Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ]),
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
        child: Row(children: [
          Expanded(child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: RS.ink500))),
          ?trailing,
        ]),
      );
}

class Notice extends StatelessWidget {
  const Notice(this.text, {super.key, this.tone = 'info', this.icon});
  final String text;
  final String tone;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final (fg, bg, ic) = switch (tone) {
      'error' => (RS.danger, RS.danger50, Icons.error_outline),
      'warning' => (RS.warning, RS.warning50, Icons.warning_amber_rounded),
      'success' => (RS.success, RS.success50, Icons.check_circle_outline),
      _ => (RS.primary700, RS.primary50, Icons.info_outline),
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(RS.radiusMd)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon ?? ic, color: fg, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: TextStyle(color: fg, height: 1.35))),
      ]),
    );
  }
}

class Busy extends StatelessWidget {
  const Busy({super.key});
  @override
  Widget build(BuildContext context) => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: RS.primary)));
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body, this.action});
  final IconData icon;
  final String title;
  final String body;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(color: RS.primary50, shape: BoxShape.circle),
            child: Icon(icon, color: RS.primary, size: 30),
          ),
          const SizedBox(height: 16),
          Text(title, style: RS.heading(18), textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(body, style: const TextStyle(color: RS.ink500, height: 1.4), textAlign: TextAlign.center),
          if (action != null) ...[const SizedBox(height: 18), action!],
        ]),
      );
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => EmptyState(
        icon: Icons.wifi_off_rounded,
        title: 'Couldn’t load this',
        body: errorText(error),
        action: OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
      );
}

class LoadingButton extends StatelessWidget {
  const LoadingButton({super.key, required this.label, required this.onPressed, this.loading = false, this.icon, this.secondary = false, this.danger = false});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool secondary;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: secondary ? RS.primary : Colors.white))
        : Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
          ]);
    final press = loading ? null : onPressed;
    if (secondary) {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton(onPressed: press, style: danger ? OutlinedButton.styleFrom(foregroundColor: RS.danger) : null, child: child),
      );
    }
    return SizedBox(
      width: double.infinity,
      child: FilledButton(onPressed: press, style: danger ? FilledButton.styleFrom(backgroundColor: RS.danger) : null, child: child),
    );
  }
}

class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => PressScale(
        onTap: onTap,
        child: Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
        ),
      );
}

/// Loads data and reloads it whenever the server says something changed —
/// so every screen stays live like a ride app should.
class LiveLoader<T> extends StatefulWidget {
  const LiveLoader({super.key, required this.load, required this.builder, this.empty, this.loading, this.refreshable = true});
  final Future<T> Function(Api api) load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final Widget? empty;

  /// Shown on first load (defaults to shimmering placeholder cards).
  final Widget? loading;

  /// Pull to refresh. Off for map screens, where the sheet itself scrolls.
  final bool refreshable;

  @override
  State<LiveLoader<T>> createState() => _LiveLoaderState<T>();
}

class _LiveLoaderState<T> extends State<LiveLoader<T>> with WidgetsBindingObserver {
  T? _data;
  Object? _error;
  bool _loading = true;
  StreamSubscription<void>? _sub;
  Timer? _debounce;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _reload();
    WidgetsBinding.instance.addObserver(this);
    // Safety net: if the live connection is delayed (e.g. through a tunnel), refresh every 15 s.
    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _reload(quiet: true));
    _sub = context.read<Session>().events?.onSync.listen((_) {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 250), () => _reload(quiet: true));
    });
  }

  Future<void> _reload({bool quiet = false}) async {
    if (!quiet && mounted) setState(() => _loading = _data == null);
    try {
      final d = await widget.load(context.read<Session>().api);
      if (mounted) setState(() => (_data = d, _error = null, _loading = false));
    } catch (e) {
      if (mounted) setState(() => (_error = quiet && _data != null ? _error : e, _loading = false));
    }
  }

  /// Refresh as soon as the app comes back to the foreground.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _reload(quiet: true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    _debounce?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return widget.loading ?? const SkeletonList();
    if (_data == null) return Material(color: RS.canvas, child: SafeArea(child: Center(child: ErrorRetry(error: _error ?? 'error', onRetry: _reload))));
    final body = widget.builder(context, _data as T, _reload);
    return widget.refreshable ? RefreshIndicator(color: RS.primary, onRefresh: _reload, child: body) : body;
  }
}

/// Blue tick next to a name: this student's VIT ID card was checked.
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({super.key, this.size = 16});
  final double size;
  @override
  Widget build(BuildContext context) => Tooltip(
        message: 'Verified student',
        child: Icon(Icons.verified, size: size, color: RS.route, semanticLabel: 'Verified student'),
      );
}

/// Name with the verified tick when it applies.
class NameWithBadge extends StatelessWidget {
  const NameWithBadge(this.user, {super.key, this.style, this.text});
  final PublicUser user;
  final TextStyle? style;

  /// Defaults to the full name.
  final String? text;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Flexible(child: Text(text ?? user.name, style: style, overflow: TextOverflow.ellipsis)),
        if (user.verified) ...[const SizedBox(width: 4), const VerifiedBadge()],
      ]);
}

class WomenOnlyPill extends StatelessWidget {
  const WomenOnlyPill({super.key});
  static const fg = Color(0xFFD6336C);
  static const bg = Color(0xFFFFE3EC);
  @override
  Widget build(BuildContext context) => const Pill('Women only', icon: Icons.female_rounded, color: fg, background: bg);
}
