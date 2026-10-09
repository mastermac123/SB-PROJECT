import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// A soft moving highlight over grey placeholders while content loads.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;
  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (context, child) => ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) {
            final x = -1.0 + 3 * _c.value;
            return LinearGradient(
              begin: Alignment(x - 1, 0),
              end: Alignment(x, 0),
              colors: const [RS.sunken, Color(0xFFFBFAFF), RS.sunken],
            ).createShader(rect);
          },
          child: child,
        ),
      );
}

class _Bone extends StatelessWidget {
  const _Bone({this.width, required this.height, this.radius = 8});
  final double? width;
  final double height;
  final double radius;
  @override
  Widget build(BuildContext context) => Container(width: width, height: height, decoration: BoxDecoration(color: RS.sunken, borderRadius: BorderRadius.circular(radius)));
}

/// Placeholder ride cards shown while a list loads.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 3});
  final int count;
  @override
  Widget build(BuildContext context) => Shimmer(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            for (var i = 0; i < count; i++)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: RS.surface, borderRadius: BorderRadius.circular(RS.radiusLg), border: Border.all(color: RS.line)),
                child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [_Bone(width: 120, height: 16), Spacer(), _Bone(width: 48, height: 18)]),
                  SizedBox(height: 14),
                  _Bone(width: 180, height: 12),
                  SizedBox(height: 10),
                  _Bone(width: 150, height: 12),
                  SizedBox(height: 16),
                  Row(children: [_Bone(width: 40, height: 40, radius: 20), SizedBox(width: 12), _Bone(width: 140, height: 14)]),
                ]),
              ),
          ],
        ),
      );
}

/// Fades and slides a child in, staggered by [index] — for lists of cards.
class FadeSlideIn extends StatelessWidget {
  const FadeSlideIn({super.key, required this.child, this.index = 0});
  final Widget child;
  final int index;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: Duration(milliseconds: 380 + 60 * math.min(index, 6)),
        curve: Curves.easeOutCubic,
        builder: (context, t, child) => Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 18 * (1 - t)), child: child)),
        child: child,
      );
}

/// Shrinks slightly while pressed, like native ride apps.
class PressScale extends StatefulWidget {
  const PressScale({super.key, required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;
  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _down = false;
  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;
    return Listener(
      onPointerDown: (_) => setState(() => _down = true),
      onPointerUp: (_) => setState(() => _down = false),
      onPointerCancel: (_) => setState(() => _down = false),
      child: AnimatedScale(scale: _down ? 0.975 : 1, duration: const Duration(milliseconds: 120), child: widget.child),
    );
  }
}

/// Full-screen tick that draws itself, then closes — after booking, paying, publishing.
Future<void> showSuccess(BuildContext context, String title, {String? subtitle}) {
  final nav = Navigator.of(context);
  Future.delayed(const Duration(milliseconds: 1700), () {
    if (nav.canPop()) nav.pop();
  });
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Done',
    barrierColor: const Color(0x6615182E),
    transitionDuration: const Duration(milliseconds: 260),
    pageBuilder: (_, _, _) => const SizedBox(),
    transitionBuilder: (context, anim, _, _) => FadeTransition(
      opacity: anim,
      child: ScaleTransition(
        scale: Tween(begin: 0.9, end: 1.0).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutBack)),
        child: Center(
          child: Material(
            color: RS.surface,
            borderRadius: BorderRadius.circular(RS.radiusXl),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(32, 32, 32, 28),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: 1),
                  duration: const Duration(milliseconds: 700),
                  curve: Curves.easeOutCubic,
                  builder: (_, t, _) => CustomPaint(size: const Size(84, 84), painter: _TickPainter(t)),
                ),
                const SizedBox(height: 18),
                Text(title, style: RS.heading(20), textAlign: TextAlign.center),
                if (subtitle != null) ...[
                  const SizedBox(height: 6),
                  ConstrainedBox(constraints: const BoxConstraints(maxWidth: 260), child: Text(subtitle, style: const TextStyle(color: RS.ink500, height: 1.4), textAlign: TextAlign.center)),
                ],
              ]),
            ),
          ),
        ),
      ),
    ),
  );
}

class _TickPainter extends CustomPainter {
  _TickPainter(this.t);
  final double t;
  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    canvas.drawCircle(c, r * Curves.easeOutBack.transform(math.min(1, t * 1.6)).clamp(0, 1.2), Paint()..color = RS.success50);
    final ring = Paint()
      ..color = RS.success
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(Rect.fromCircle(center: c, radius: r - 4), -math.pi / 2, 2 * math.pi * math.min(1, t * 1.4), false, ring);
    final tick = Path()
      ..moveTo(c.dx - r * 0.32, c.dy + r * 0.02)
      ..lineTo(c.dx - r * 0.08, c.dy + r * 0.26)
      ..lineTo(c.dx + r * 0.36, c.dy - r * 0.22);
    final k = ((t - 0.35) / 0.65).clamp(0.0, 1.0);
    for (final m in tick.computeMetrics()) {
      canvas.drawPath(m.extractPath(0, m.length * k), ring..strokeWidth = 5);
    }
  }

  @override
  bool shouldRepaint(_TickPainter old) => old.t != t;
}

/// Gentle pulsing dot — "live", "searching", "driver on the way".
class LiveDot extends StatefulWidget {
  const LiveDot({super.key, this.color = RS.success, this.size = 10});
  final Color color;
  final double size;
  @override
  State<LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<LiveDot> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: widget.size * 2.4,
        height: widget.size * 2.4,
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, _) => Stack(alignment: Alignment.center, children: [
            Container(
              width: widget.size * (1 + 1.4 * _c.value),
              height: widget.size * (1 + 1.4 * _c.value),
              decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color.withValues(alpha: 0.35 * (1 - _c.value))),
            ),
            Container(width: widget.size, height: widget.size, decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color)),
          ]),
        ),
      );
}
