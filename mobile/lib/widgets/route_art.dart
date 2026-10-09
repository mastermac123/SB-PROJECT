import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Looping illustration for the welcome screen: a road route draws itself across
/// a soft grid, a car follows it from the pickup to the campus pin.
class RouteArt extends StatefulWidget {
  const RouteArt({super.key, this.height = 260});
  final double height;
  @override
  State<RouteArt> createState() => _RouteArtState();
}

class _RouteArtState extends State<RouteArt> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 5200))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        height: widget.height,
        child: AnimatedBuilder(animation: _c, builder: (_, _) => CustomPaint(size: Size.infinite, painter: _RoutePainter(_c.value))),
      );
}

class _RoutePainter extends CustomPainter {
  _RoutePainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final bg = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(RS.radiusXl));
    canvas.drawRRect(bg, Paint()..shader = const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [RS.primary50, Color(0xFFEEF2FF)]).createShader(Offset.zero & size));
    canvas.save();
    canvas.clipRRect(bg);
    final grid = Paint()
      ..color = const Color(0x145038E6)
      ..strokeWidth = 1;
    for (var x = 0.0; x < w; x += 28) {
      canvas.drawLine(Offset(x, 0), Offset(x, h), grid);
    }
    for (var y = 0.0; y < h; y += 28) {
      canvas.drawLine(Offset(0, y), Offset(w, y), grid);
    }
    // a few "blocks" for a map feel
    final block = Paint()..color = const Color(0x0F15182E);
    for (final r in [Rect.fromLTWH(w * .08, h * .1, w * .2, h * .18), Rect.fromLTWH(w * .62, h * .62, w * .24, h * .2), Rect.fromLTWH(w * .7, h * .08, w * .16, h * .22)]) {
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), block);
    }

    final route = Path()
      ..moveTo(w * .14, h * .78)
      ..cubicTo(w * .3, h * .78, w * .28, h * .44, w * .48, h * .46)
      ..cubicTo(w * .68, h * .48, w * .62, h * .2, w * .84, h * .24);
    final metric = route.computeMetrics().first;
    final drawT = Curves.easeInOutCubic.transform(math.min(1, t / .45));
    final carT = Curves.easeInOut.transform(((t - .35) / .5).clamp(0.0, 1.0));
    final partial = metric.extractPath(0, metric.length * drawT);
    canvas.drawPath(partial, Paint()
      ..color = Colors.white
      ..strokeWidth = 12
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);
    canvas.drawPath(partial, Paint()
      ..color = RS.primary
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);

    // pickup pulse + pin
    final start = metric.getTangentForOffset(0)!.position;
    final pulse = (t * 2.5) % 1;
    canvas.drawCircle(start, 10 + 22 * pulse, Paint()..color = RS.primary.withValues(alpha: .25 * (1 - pulse)));
    canvas.drawCircle(start, 10, Paint()..color = Colors.white);
    canvas.drawCircle(start, 6, Paint()..color = RS.ink900);

    // campus pin
    final end = metric.getTangentForOffset(metric.length)!.position;
    final pin = Path()
      ..moveTo(end.dx, end.dy)
      ..quadraticBezierTo(end.dx - 16, end.dy - 22, end.dx, end.dy - 34)
      ..quadraticBezierTo(end.dx + 16, end.dy - 22, end.dx, end.dy);
    canvas.drawShadow(pin, const Color(0x5515182E), 4, false);
    canvas.drawPath(pin, Paint()..color = RS.primary);
    canvas.drawCircle(Offset(end.dx, end.dy - 22), 5.5, Paint()..color = Colors.white);

    // car
    if (t > .35 && t < .92) {
      final tan = metric.getTangentForOffset(metric.length * carT)!;
      canvas.save();
      canvas.translate(tan.position.dx, tan.position.dy);
      canvas.rotate(-tan.angle + math.pi / 2);
      canvas.drawCircle(Offset.zero, 15, Paint()..color = const Color(0x3315182E));
      canvas.drawCircle(Offset.zero, 13, Paint()..color = Colors.white);
      canvas.drawCircle(Offset.zero, 10, Paint()..color = RS.primary);
      final arrow = Path()
        ..moveTo(0, -6)
        ..lineTo(5, 5)
        ..lineTo(0, 2.5)
        ..lineTo(-5, 5)
        ..close();
      canvas.drawPath(arrow, Paint()..color = Colors.white);
      canvas.restore();
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_RoutePainter old) => old.t != t;
}
