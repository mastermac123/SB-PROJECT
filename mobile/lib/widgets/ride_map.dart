import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../api/models.dart';
import '../data/places.dart';
import '../theme.dart';

class MapPin {
  final LatLngPoint at;
  final String kind; // pickup | drop | car | me
  final String? label;
  final double? heading;
  const MapPin(this.at, this.kind, {this.label, this.heading});
}

/// OpenStreetMap map with the route and pickup/drop/car markers.
class RideMap extends StatefulWidget {
  const RideMap({super.key, this.route = const [], this.pins = const [], this.follow, this.height});
  final List<LatLngPoint> route;
  final List<MapPin> pins;

  /// Keep this point in view as it moves (the driver's car).
  final LatLngPoint? follow;
  final double? height;

  @override
  State<RideMap> createState() => _RideMapState();
}

class _RideMapState extends State<RideMap> {
  final _controller = MapController();
  bool _ready = false;

  List<LatLng> get _points => [
        ...widget.route.map((p) => LatLng(p.lat, p.lng)),
        ...widget.pins.map((p) => LatLng(p.at.lat, p.at.lng)),
      ];

  void _fit() {
    if (!_ready) return;
    final pts = _points;
    if (pts.isEmpty) return;
    if (pts.length == 1) {
      _controller.move(pts.first, 14);
      return;
    }
    _controller.fitCamera(CameraFit.coordinates(coordinates: pts, padding: const EdgeInsets.fromLTRB(48, 64, 48, 48), maxZoom: 15));
  }

  @override
  void didUpdateWidget(covariant RideMap old) {
    super.didUpdateWidget(old);
    final f = widget.follow;
    if (f != null && _ready) {
      final b = _controller.camera.visibleBounds;
      if (!b.contains(LatLng(f.lat, f.lng))) _controller.move(LatLng(f.lat, f.lng), _controller.camera.zoom);
    } else if (old.route.length != widget.route.length || old.pins.length != widget.pins.length) {
      _fit();
    }
  }

  Widget _marker(MapPin p) {
    switch (p.kind) {
      case 'car':
        return Container(
          decoration: BoxDecoration(color: RS.primary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3), boxShadow: const [BoxShadow(blurRadius: 8, color: Color(0x5515182E))]),
          child: Transform.rotate(angle: (p.heading ?? 0) * 3.14159 / 180, child: const Icon(Icons.navigation_rounded, color: Colors.white, size: 18)),
        );
      case 'drop':
        return Container(
          decoration: BoxDecoration(color: RS.primary, borderRadius: BorderRadius.circular(4), border: Border.all(color: Colors.white, width: 4), boxShadow: const [BoxShadow(blurRadius: 6, color: Color(0x5515182E))]),
        );
      case 'me':
        return Container(decoration: BoxDecoration(color: RS.secondary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)));
      default:
        return Container(
          decoration: BoxDecoration(color: RS.ink900, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 4), boxShadow: const [BoxShadow(blurRadius: 6, color: Color(0x5515182E))]),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final pts = widget.route.map((p) => LatLng(p.lat, p.lng)).toList();
    final map = FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCenter: LatLng(campus.lat, campus.lng),
        initialZoom: 12,
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        onMapReady: () {
          _ready = true;
          _fit();
        },
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png',
          subdomains: const ['a', 'b', 'c', 'd'],
          userAgentPackageName: 'com.ridesync.ridesync',
          retinaMode: RetinaMode.isHighDensity(context),
        ),
        if (pts.length > 1)
          PolylineLayer(polylines: [
            Polyline(points: pts, strokeWidth: 9, color: Colors.white),
            Polyline(points: pts, strokeWidth: 5, color: RS.primary),
          ]),
        MarkerLayer(markers: [
          for (final p in widget.pins)
            Marker(point: LatLng(p.at.lat, p.at.lng), width: p.kind == 'car' ? 36 : 20, height: p.kind == 'car' ? 36 : 20, child: _marker(p)),
        ]),
        const SimpleAttributionWidget(source: Text('© OpenStreetMap · CARTO')),
      ],
    );
    return widget.height == null ? map : SizedBox(height: widget.height, child: map);
  }
}
