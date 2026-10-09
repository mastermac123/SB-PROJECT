import 'dart:math' as math;

import '../api/models.dart';

/// Straight-line distance in km.
double haversineKm(LatLngPoint a, LatLngPoint b) {
  const r = 6371.0;
  final dLat = (b.lat - a.lat) * math.pi / 180;
  final dLng = (b.lng - a.lng) * math.pi / 180;
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(a.lat * math.pi / 180) * math.cos(b.lat * math.pi / 180) * math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.sqrt(h));
}

/// Rough minutes by car in Mumbai traffic (road ≈ 1.35× straight line, ~22 km/h).
int etaMinutes(LatLngPoint from, LatLngPoint to) => math.max(1, (haversineKm(from, to) * 1.35 / 22 * 60).round());
