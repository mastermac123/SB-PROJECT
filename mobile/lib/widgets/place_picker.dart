import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../data/places.dart';
import '../state/session.dart';
import '../theme.dart';
import 'common.dart';
import 'pin_picker.dart';

/// Full-screen search for a place: popular VIT places, server search and GPS.
Future<Place?> pickPlace(BuildContext context, {required String title}) =>
    Navigator.of(context).push<Place>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => _PlacePicker(title: title)));

IconData _iconFor(String? kind) => switch (kind) {
      'campus' => Icons.school_rounded,
      'station' => Icons.train_rounded,
      'airport' => Icons.flight_rounded,
      'area' => Icons.apartment_rounded,
      _ => Icons.place_rounded,
    };

class _PlacePicker extends StatefulWidget {
  const _PlacePicker({required this.title});
  final String title;
  @override
  State<_PlacePicker> createState() => _PlacePickerState();
}

class _PlacePickerState extends State<_PlacePicker> {
  final _q = TextEditingController();
  List<Place> _remote = [];
  Timer? _debounce;
  bool _locating = false;
  String? _resolving;
  String? _error;
  // One search session: typing + the final pick count as one Google lookup on the server.
  String _session = _newSession();

  static String _newSession() {
    final r = Random.secure();
    String hex(int n) => List.generate(n, (_) => r.nextInt(16).toRadixString(16)).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}';
  }

  List<Place> get _local {
    final q = _q.text.trim().toLowerCase();
    if (q.isEmpty) return popularPlaces;
    return popularPlaces.where((p) => p.name.toLowerCase().contains(q) || p.area.toLowerCase().contains(q)).toList();
  }

  void _onChanged(String v) {
    setState(() => _remote = []);
    _debounce?.cancel();
    if (v.trim().length < 3) return;
    _debounce = Timer(const Duration(milliseconds: 450), () async {
      try {
        final r = await context.read<Session>().api.searchPlaces(v.trim(), _session);
        if (mounted && _q.text == v) setState(() => _remote = r);
      } catch (_) {}
    });
  }

  Future<void> _pick(Place p) async {
    if (p.googlePlaceId == null) return Navigator.pop(context, p);
    setState(() => (_resolving = p.id, _error = null));
    try {
      final full = await context.read<Session>().api.resolvePlace(p.googlePlaceId!, _session);
      _session = _newSession();
      if (mounted) Navigator.pop(context, Place(id: full.id, name: p.name, area: p.area.isEmpty ? full.area : p.area, lat: full.lat, lng: full.lng, kind: 'custom'));
    } catch (e) {
      if (mounted) setState(() => (_error = errorText(e), _resolving = null));
    }
  }

  /// GPS → then let the student fine-tune the pin on their building (GPS can be tens of metres off).
  Future<void> _useLocation() async {
    setState(() => (_locating = true, _error = null));
    try {
      final pos = await preciseLocation();
      if (!mounted) return;
      setState(() => _locating = false);
      final p = await pickOnMap(context, title: widget.title, start: LatLngPoint(pos.latitude, pos.longitude), accuracy: pos.accuracy);
      if (p != null && mounted) Navigator.pop(context, p);
    } catch (e) {
      if (mounted) setState(() => (_error = e is String ? e : 'Couldn’t get your location. Try again, or choose on the map.', _locating = false));
    }
  }

  Future<void> _chooseOnMap() async {
    final p = await pickOnMap(context, title: widget.title);
    if (p != null && mounted) Navigator.pop(context, p);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final local = _local;
    final names = local.map((p) => p.name.toLowerCase()).toSet();
    final extra = _remote.where((p) => !names.contains(p.name.toLowerCase())).toList();
    return Scaffold(
      backgroundColor: RS.surface,
      appBar: AppBar(backgroundColor: RS.surface, title: Text(widget.title)),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: TextField(
            controller: _q,
            autofocus: true,
            onChanged: _onChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search places, stations, areas',
              prefixIcon: const Icon(Icons.search),
              fillColor: RS.sunken,
              suffixIcon: _q.text.isEmpty ? null : IconButton(icon: const Icon(Icons.close), onPressed: () {
                      _q.clear();
                      setState(() => _remote = []);
                    }),
            ),
          ),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: Notice(_error!, tone: 'warning')),
        Expanded(
          child: ListView(children: [
            if (_q.text.isEmpty)
              ListTile(
                leading: const CircleAvatar(backgroundColor: RS.primary50, child: Icon(Icons.my_location, color: RS.primary)),
                title: Text(_locating ? 'Finding your location…' : 'Use current location', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Uses your phone’s GPS — then adjust the pin'),
                onTap: _locating ? null : _useLocation,
              ),
            if (_q.text.isEmpty)
              ListTile(
                leading: const CircleAvatar(backgroundColor: RS.sunken, child: Icon(Icons.pin_drop_outlined, color: RS.ink700)),
                title: const Text('Choose on map', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Drag the map to your exact building or gate'),
                onTap: _chooseOnMap,
              ),
            if (_q.text.isEmpty) const Padding(padding: EdgeInsets.fromLTRB(16, 12, 16, 0), child: SectionTitle('Popular with VIT students')),
            for (final p in local) _row(p),
            if (extra.isNotEmpty) const Padding(padding: EdgeInsets.fromLTRB(16, 4, 16, 0), child: SectionTitle('More places')),
            for (final p in extra) _row(p),
            if (_q.text.isNotEmpty && local.isEmpty && extra.isEmpty)
              Padding(padding: const EdgeInsets.all(32), child: Text('No places match “${_q.text}”. Try a landmark or area name.', textAlign: TextAlign.center, style: const TextStyle(color: RS.ink500))),
          ]),
        ),
      ]),
    );
  }

  Widget _row(Place p) => ListTile(
        leading: CircleAvatar(backgroundColor: RS.sunken, child: Icon(_iconFor(p.kind), color: RS.ink700, size: 20)),
        title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(_resolving == p.id ? 'Loading…' : p.area, maxLines: 1, overflow: TextOverflow.ellipsis),
        onTap: () => _pick(p),
      );
}
