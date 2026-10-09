import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import '../widgets/motion.dart';
import 'drive.dart';
import 'trip.dart';

/// All my rides — booked and offered — in Upcoming / Active / Completed / Cancelled.
class RidesTab extends StatefulWidget {
  const RidesTab({super.key});
  @override
  State<RidesTab> createState() => _RidesTabState();
}

enum _Tab { upcoming, active, completed, cancelled }

class _Item {
  _Item.booking(this.trip) : offer = null;
  _Item.offer(this.offer) : trip = null;
  final TripItem? trip;
  final OfferedItem? offer;
  Ride get ride => trip?.ride ?? offer!.ride;
  DateTime get at => ride.departAt;

  _Tab get tab {
    if (trip != null) {
      return switch (trip!.booking.status) {
        'driver_arriving' || 'driver_arrived' || 'in_progress' => _Tab.active,
        'completed' => _Tab.completed,
        'cancelled' || 'rejected' => _Tab.cancelled,
        _ => _Tab.upcoming,
      };
    }
    return switch (offer!.ride.status) {
      'in_progress' => _Tab.active,
      'completed' => _Tab.completed,
      'cancelled' => _Tab.cancelled,
      _ => _Tab.upcoming,
    };
  }
}

class _RidesTabState extends State<RidesTab> {
  _Tab? _picked;

  @override
  Widget build(BuildContext context) {
    final canDrive = context.watch<Session>().user!.commute != 'rider';
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Rides'),
        actions: [
          if (canDrive)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OfferRideScreen())), icon: const Icon(Icons.add), label: const Text('Offer')),
            ),
        ],
      ),
      body: LiveLoader<Trips>(
        load: (api) => api.trips(),
        builder: (context, trips, reload) {
          final all = [...trips.bookings.map(_Item.booking), ...trips.rides.map(_Item.offer)];
          final counts = {for (final t in _Tab.values) t: all.where((i) => i.tab == t).length};
          final tab = _picked ?? (counts[_Tab.active]! > 0 ? _Tab.active : _Tab.upcoming);
          final list = all.where((i) => i.tab == tab).toList()
            ..sort((a, b) => tab == _Tab.upcoming || tab == _Tab.active ? a.at.compareTo(b.at) : b.at.compareTo(a.at));
          return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
            // Text tabs with an underline (like the website) — all four always fit.
            DecoratedBox(
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: RS.line))),
              child: Row(children: [
                for (final t in _Tab.values)
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _picked = t),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: tab == t ? RS.primary : Colors.transparent, width: 2))),
                        child: Text(
                          '${_label(t)}${counts[t]! > 0 && (t == _Tab.upcoming || t == _Tab.active) ? ' ${counts[t]}' : ''}',
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.fade,
                          softWrap: false,
                          style: TextStyle(fontSize: 14, fontWeight: tab == t ? FontWeight.w700 : FontWeight.w500, color: tab == t ? RS.ink900 : RS.ink500),
                        ),
                      ),
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 12),
            if (list.isEmpty)
              _empty(context, tab, canDrive)
            else
              for (final (i, item) in list.indexed) FadeSlideIn(index: i, child: Padding(padding: const EdgeInsets.only(bottom: 10), child: _tile(context, item))),
          ]);
        },
      ),
    );
  }

  String _label(_Tab t) => switch (t) { _Tab.upcoming => 'Upcoming', _Tab.active => 'Active', _Tab.completed => 'Completed', _Tab.cancelled => 'Cancelled' };

  Widget _empty(BuildContext context, _Tab tab, bool canDrive) {
    final (title, body) = switch (tab) {
      _Tab.upcoming => ('No upcoming rides', 'Rides you book or offer will show up here.'),
      _Tab.active => ('Nothing in progress', 'When a ride starts, you can track it from here.'),
      _Tab.completed => ('No completed rides yet', 'Your ride history appears here after each trip.'),
      _Tab.cancelled => ('No cancelled rides', 'Good news — nothing has been cancelled.'),
    };
    return EmptyState(icon: Icons.route_outlined, title: title, body: body);
  }

  Widget _dateCol(DateTime at) => SizedBox(
        width: 44,
        child: Column(children: [
          Text('${at.day}', style: RS.heading(20)),
          Text(const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.month - 1], style: const TextStyle(color: RS.ink500, fontSize: 12)),
        ]),
      );

  Widget _tile(BuildContext context, _Item item) {
    final ride = item.ride;
    if (item.trip != null) {
      final t = item.trip!;
      final b = t.booking;
      return Panel(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TripScreen(bookingId: b.id))),
        child: Row(children: [
          _dateCol(item.at),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${b.pickup.name} → ${b.drop.name}', style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
              Text('${timeOf(ride.departAt)} · with ${t.driver.name}', style: const TextStyle(color: RS.ink500, fontSize: 13), overflow: TextOverflow.ellipsis),
              if (b.status == 'cancelled' && b.cancelReason != null)
                Text('${b.cancelledBy == 'driver' ? 'Driver cancelled' : 'You cancelled'} · ${b.cancelReason}', style: const TextStyle(color: RS.danger, fontSize: 12.5), overflow: TextOverflow.ellipsis),
              if (b.status == 'rejected') const Text('Driver couldn’t take this request', style: TextStyle(color: RS.danger, fontSize: 12.5)),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(money(b.fare), style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Pill.status(b.status, _shortStatus(b.status)),
          ]),
        ]),
      );
    }
    final o = item.offer!;
    return Panel(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DriveScreen(rideId: ride.id))),
      child: Row(children: [
        _dateCol(item.at),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${ride.origin.name} → ${ride.destination.name}', style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
            Text('${timeOf(ride.departAt)} · You drove · ${ride.seatsBooked}/${ride.seatsTotal} seats', style: const TextStyle(color: RS.ink500, fontSize: 13), overflow: TextOverflow.ellipsis),
          ]),
        ),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(ride.status == 'completed' ? '+${money(o.earned)}' : '${money(ride.farePerSeat)}/seat', style: TextStyle(fontWeight: FontWeight.w700, color: ride.status == 'completed' ? RS.success : RS.ink900)),
          const SizedBox(height: 4),
          if (o.pending > 0 && ride.status == 'scheduled')
            Pill('${o.pending} new', color: RS.danger, background: RS.danger50)
          else
            Pill.status(
              ride.status == 'scheduled' ? 'pending' : ride.status,
              switch (ride.status) { 'scheduled' => 'Driving', 'in_progress' => 'Live', 'completed' => 'Completed', _ => 'Cancelled' },
            ),
        ]),
      ]),
    );
  }

  String _shortStatus(String s) => switch (s) {
        'pending' => 'Requested',
        'accepted' => 'Accepted',
        'confirmed' => 'Confirmed',
        'driver_arriving' || 'driver_arrived' => 'Driver coming',
        'in_progress' => 'On ride',
        'completed' => 'Completed',
        'rejected' => 'Declined',
        'cancelled' => 'Cancelled',
        _ => s,
      };
}
