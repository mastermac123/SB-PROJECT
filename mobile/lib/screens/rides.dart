import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import '../widgets/ride_card.dart';
import 'drive.dart';
import 'trip.dart';

/// Rides I booked and rides I offered — upcoming and past.
class RidesTab extends StatelessWidget {
  const RidesTab({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('My Rides'),
            bottom: const TabBar(labelColor: RS.primary, indicatorColor: RS.primary, unselectedLabelColor: RS.ink500, tabs: [Tab(text: 'Booked'), Tab(text: 'Offered')]),
          ),
          body: LiveLoader<Trips>(
            load: (api) => api.trips(),
            builder: (context, trips, reload) => TabBarView(children: [_booked(context, trips.bookings), _offered(context, trips.rides)]),
          ),
        ),
      );

  Widget _booked(BuildContext context, List<TripItem> items) {
    if (items.isEmpty) {
      return ListView(children: const [EmptyState(icon: Icons.hail_rounded, title: 'No booked rides yet', body: 'Rides you request appear here, with live status from the driver.')]);
    }
    final upcoming = items.where((t) => t.booking.isActive).toList();
    final past = items.where((t) => !t.booking.isActive).toList();
    return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
      if (upcoming.isNotEmpty) const SectionTitle('Upcoming'),
      for (final t in upcoming) _bookingTile(context, t),
      if (past.isNotEmpty) const SectionTitle('Past'),
      for (final t in past) _bookingTile(context, t),
    ]);
  }

  Widget _bookingTile(BuildContext context, TripItem t) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Panel(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TripScreen(bookingId: t.booking.id))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(when(t.ride.departAt), style: RS.heading(15))),
              Pill.status(t.booking.status, bookingStatusLabel[t.booking.status] ?? t.booking.status),
            ]),
            const SizedBox(height: 10),
            RouteLine(from: t.booking.pickup, to: t.booking.drop, dense: true),
            const SizedBox(height: 8),
            Text('${t.driver.name} · ${money(t.booking.fare)}', style: const TextStyle(color: RS.ink500, fontSize: 13)),
          ]),
        ),
      );

  Widget _offered(BuildContext context, List<OfferedItem> items) {
    if (items.isEmpty) {
      return ListView(children: const [EmptyState(icon: Icons.directions_car_outlined, title: 'No rides offered yet', body: 'Offer empty seats from the Home tab. Requests from students show up here.')]);
    }
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      for (final r in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Panel(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DriveScreen(rideId: r.ride.id))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(when(r.ride.departAt), style: RS.heading(15))),
                if (r.pending > 0)
                  Pill('${r.pending} request${r.pending == 1 ? '' : 's'}', color: RS.warning, background: RS.warning50)
                else
                  Pill.status(r.ride.status == 'scheduled' ? 'confirmed' : r.ride.status, switch (r.ride.status) { 'scheduled' => 'Scheduled', 'in_progress' => 'On the road', 'completed' => 'Completed', _ => 'Cancelled' }),
              ]),
              const SizedBox(height: 10),
              RouteLine(from: r.ride.origin, to: r.ride.destination, dense: true),
              const SizedBox(height: 8),
              Text('${r.riders} rider${r.riders == 1 ? '' : 's'} · ${money(r.earned)} shared', style: const TextStyle(color: RS.ink500, fontSize: 13)),
            ]),
          ),
        ),
    ]);
  }
}
