import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';

/// "48 min · 22 km · arrive 5:03 AM", plus live traffic ("Heavy traffic now · +8 min")
/// when the trip starts within 90 minutes or is under way. Refreshes every 2 minutes.
class TripTime extends StatefulWidget {
  const TripTime({super.key, required this.from, required this.to, required this.departAt, required this.plannedMin, required this.distanceKm, this.live = false});
  final LatLngPoint from;
  final LatLngPoint to;
  final DateTime departAt;
  final int plannedMin;
  final double distanceKm;
  final bool live;

  @override
  State<TripTime> createState() => _TripTimeState();
}

class _TripTimeState extends State<TripTime> {
  LiveEta? _eta;
  Timer? _timer;
  String? _key;

  bool get _soon => widget.live || widget.departAt.difference(DateTime.now()).inMinutes < 90;
  // ~1 km steps for a moving car, so live GPS doesn't trigger a lookup on every update.
  String get _k => '${widget.from.lat.toStringAsFixed(2)},${widget.from.lng.toStringAsFixed(2)}|${widget.to.lat},${widget.to.lng}';

  void _load() {
    if (!_soon) return;
    context.read<Session>().api.eta(widget.from, widget.to).then((r) {
      if (mounted) setState(() => _eta = r);
    }).catchError((_) {});
  }

  void _restart() {
    _key = _k;
    _timer?.cancel();
    _load();
    _timer = Timer.periodic(const Duration(minutes: 2), (_) => _load());
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restart());
  }

  @override
  void didUpdateWidget(TripTime old) {
    super.didUpdateWidget(old);
    if (_k != _key) _restart();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = _eta;
    final mins = e?.durationMin ?? widget.plannedMin;
    final start = widget.live || widget.departAt.isBefore(DateTime.now()) ? DateTime.now() : widget.departAt;
    final arrive = start.add(Duration(minutes: mins));
    final color = switch (e?.traffic) { 'heavy' => RS.danger, 'moderate' => RS.warning, _ => RS.success };
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Icon(Icons.schedule, size: 18, color: RS.ink500),
        const SizedBox(width: 6),
        Expanded(child: Text('${minutes(mins)} · ${km(widget.distanceKm)} · arrive ~${timeOf(arrive)}', style: const TextStyle(fontWeight: FontWeight.w600))),
      ]),
      if (e?.traffic != null)
        Padding(
          padding: const EdgeInsets.only(left: 24, top: 2),
          child: Text(
            e!.traffic == 'light' ? 'Light traffic now · live' : '${e.traffic == 'heavy' ? 'Heavy' : 'Some'} traffic now · +${e.trafficDelayMin} min · live',
            style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
    ]);
  }
}
