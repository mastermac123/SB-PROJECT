import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Welcome-screen illustration: a small, real-looking city map (creek, sea, park,
/// building blocks, highway, streets). The route draws itself in Google-style blue
/// with one slow orange stretch, and a car drives it from VIT to BKC on a loop.
class RouteArt extends StatefulWidget {
  const RouteArt({super.key, this.height = 260});
  final double height;
  @override
  State<RouteArt> createState() => _RouteArtState();
}

class _RouteArtState extends State<RouteArt> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 7000))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
        height: widget.height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(RS.radiusXl),
          boxShadow: const [BoxShadow(color: Color(0x1F15182E), blurRadius: 30, offset: Offset(0, 10))],
        ),
        child: AnimatedBuilder(animation: _c, builder: (_, _) => CustomPaint(size: Size.infinite, painter: _MapPainter(_c.value))),
      );
}

const _routeBlue = Color(0xFF1A73E8);

class _MapPainter extends CustomPainter {
  _MapPainter(this.t);
  final double t;

  void _label(Canvas c, Offset at, String title, String sub, {bool dark = false}) {
    final tp = TextPainter(
      text: TextSpan(children: [
        TextSpan(text: '$title\n', style: TextStyle(color: dark ? Colors.white : RS.ink900, fontSize: 11, fontWeight: FontWeight.w700, height: 1.25)),
        TextSpan(text: sub, style: TextStyle(color: dark ? const Color(0xFFC9CBE0) : RS.ink500, fontSize: 9.5, fontWeight: FontWeight.w500)),
      ]),
      textDirection: TextDirection.ltr,
    )..layout();
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(at.dx, at.dy, tp.width + 18, tp.height + 12), const Radius.circular(9));
    c.drawShadow(Path()..addRRect(r), const Color(0x6615182E), 4, false);
    c.drawRRect(r, Paint()..color = dark ? RS.ink900 : Colors.white);
    tp.paint(c, at + const Offset(9, 6));
  }

  void _text(Canvas c, Offset at, String s, Color color) {
    (TextPainter(text: TextSpan(text: s, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.8)), textDirection: TextDirection.ltr)..layout()).paint(c, at);
  }

  void _road(Canvas c, Path p, {double w = 8, Color casing = const Color(0xFFE3DDD2), Color fill = Colors.white}) {
    c.drawPath(p, Paint()
      ..color = casing
      ..strokeWidth = w + 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);
    c.drawPath(p, Paint()
      ..color = fill
      ..strokeWidth = w
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final bg = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(RS.radiusXl));
    canvas.save();
    canvas.clipRRect(bg);

    // Land and building blocks
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFFF5F2EC));
    final block = Paint()..color = const Color(0xFFE9E5DE);
    for (var y = 3.0; y < h; y += 30) {
      for (var x = 3.0; x < w; x += 34) {
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, y, 28, 24), const Radius.circular(3)), block);
      }
    }

    // Water: sea top-right, creek left, bay bottom
    final water = Paint()..color = const Color(0xFFBCDCF3);
    canvas.drawPath(Path()..moveTo(w * .69, 0)..cubicTo(w * .75, h * .1, w * .87, h * .12, w, h * .11)..lineTo(w, 0)..close(), water);
    canvas.drawPath(Path()..moveTo(0, h * .38)..cubicTo(w * .08, h * .4, w * .12, h * .5, w * .1, h * .6)..cubicTo(w * .09, h * .69, w * .02, h * .75, 0, h * .76)..close(), water);
    canvas.drawPath(Path()..moveTo(w * .25, h)..cubicTo(w * .31, h * .9, w * .44, h * .87, w * .52, h * .93)..cubicTo(w * .58, h * .97, w * .62, h, w * .62, h)..close(), water);

    // Parks
    final park = Paint()..color = const Color(0xFFCFE7C6);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(w * .73, h * .62, w * .19, h * .16), const Radius.circular(10)), park);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(w * .15, h * .1, w * .15, h * .13), const Radius.circular(10)), park);

    // Highway and streets
    _road(canvas, Path()..moveTo(-10, h * .52)..cubicTo(w * .25, h * .49, w * .62, h * .42, w + 10, h * .3), w: 9, casing: const Color(0xFFF2D27A), fill: const Color(0xFFFDE59A));
    for (final p in [
      Path()..moveTo(0, h * .72)..lineTo(w, h * .65),
      Path()..moveTo(0, h * .27)..lineTo(w, h * .21),
      Path()..moveTo(w * .35, 0)..lineTo(w * .43, h),
      Path()..moveTo(w * .62, 0)..lineTo(w * .69, h),
      Path()..moveTo(0, h * .9)..lineTo(w, h * .82),
    ]) {
      _road(canvas, p, w: 7);
    }

    _text(canvas, Offset(w * .09, h * .86), 'WADALA', const Color(0xFF8A8CA0));
    _text(canvas, Offset(w * .83, h * .39), 'BKC', const Color(0xFF8A8CA0));
    _text(canvas, Offset(w * .46, h * .36), 'SION', const Color(0xFF8A8CA0));
    _text(canvas, Offset(w * .86, h * .05), 'SEA', const Color(0xFF5F8FB6));

    // Route (VIT → BKC)
    final route = Path()
      ..moveTo(w * .19, h * .8)
      ..cubicTo(w * .31, h * .8, w * .31, h * .66, w * .41, h * .62)
      ..cubicTo(w * .5, h * .59, w * .56, h * .58, w * .6, h * .49)
      ..cubicTo(w * .65, h * .38, w * .68, h * .28, w * .82, h * .26);
    final m = route.computeMetrics().first;
    final drawT = Curves.easeInOutCubic.transform(math.min(1, t / .25));
    final partial = m.extractPath(0, m.length * drawT);
    canvas.drawPath(partial, Paint()
      ..color = Colors.white
      ..strokeWidth = 12
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);
    canvas.drawPath(partial, Paint()
      ..color = _routeBlue
      ..strokeWidth = 6.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);
    if (drawT >= 1) {
      canvas.drawPath(m.extractPath(m.length * .54, m.length * .66), Paint()
        ..color = const Color(0xFFF29900)
        ..strokeWidth = 6.5
        ..style = PaintingStyle.stroke);
    }

    // Pickup with pulse
    final start = m.getTangentForOffset(0)!.position;
    final pulse = (t * 3) % 1;
    canvas.drawCircle(start, 9 + 16 * pulse, Paint()..color = _routeBlue.withValues(alpha: .3 * (1 - pulse)));
    canvas.drawCircle(start, 10, Paint()..color = Colors.white);
    canvas.drawCircle(start, 6.5, Paint()..color = RS.ink900);
    canvas.drawCircle(start, 2.5, Paint()..color = Colors.white);

    // Destination
    final end = m.getTangentForOffset(m.length)!.position;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: end, width: 22, height: 22), const Radius.circular(6)), Paint()..color = Colors.white);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: end, width: 14, height: 14), const Radius.circular(4)), Paint()..color = RS.primary);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: end, width: 5, height: 5), const Radius.circular(1.5)), Paint()..color = Colors.white);

    // Car (top-down), driving and turning with the road
    final carT = Curves.easeInOut.transform(((t - .22) / .66).clamp(0.0, 1.0));
    if (t > .22) {
      final tan = m.getTangentForOffset(m.length * carT)!;
      canvas.save();
      canvas.translate(tan.position.dx, tan.position.dy);
      canvas.rotate(-tan.angle);
      final body = RRect.fromRectAndRadius(const Rect.fromLTWH(-12, -6.5, 24, 13), const Radius.circular(4));
      canvas.drawShadow(Path()..addRRect(body), const Color(0xAA15182E), 3, false);
      canvas.drawRRect(body, Paint()..color = RS.ink900);
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(2, -5, 6, 10), const Radius.circular(2)), Paint()..color = const Color(0xFF7FB2FF));
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(-9, -5, 4.5, 10), const Radius.circular(1.5)), Paint()..color = const Color(0xFF5E6488));
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(10, -5.5, 2, 3), const Radius.circular(1)), Paint()..color = const Color(0xFFFFE08A));
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(10, 2.5, 2, 3), const Radius.circular(1)), Paint()..color = const Color(0xFFFFE08A));
      canvas.restore();
    }

    // Labels and time bubble
    _label(canvas, Offset(start.dx - 36, start.dy - 48), 'VIT Wadala', 'Leave 8:40 AM', dark: true);
    _label(canvas, Offset(end.dx - 70, end.dy - 52), 'BKC', 'Arrive ~9:02 AM');
    if (drawT >= 1) {
      final mid = m.getTangentForOffset(m.length * .5)!.position;
      _label(canvas, Offset(mid.dx - 46, mid.dy - 54), '22 min', '● +4 min traffic', dark: true);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_MapPainter old) => old.t != t;
}
