import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import '../widgets/ride_card.dart';
import 'drive.dart';
import 'notifications.dart';
import 'profile.dart';
import 'trip.dart';

class HomeTab extends StatelessWidget {
  const HomeTab({super.key, required this.onFind});
  final VoidCallback onFind;

  String _greeting() {
    final h = DateTime.now().hour;
    return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<Session>().user!;
    return Scaffold(
      appBar: AppBar(
        title: Image.asset('assets/ridesync-logo.png', height: 28),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen())),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: LiveLoader<(List<FeedItem>, Trips)>(
        load: (api) async => (await api.feed(), await api.trips()),
        builder: (context, data, reload) {
          final (feed, trips) = data;
          final active = trips.bookings.where((b) => b.booking.isActive).toList();
          final driving = trips.rides.where((r) => r.ride.status == 'scheduled' || r.ride.status == 'in_progress').toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
            Text('${_greeting()}, ${user.firstName}', style: const TextStyle(color: RS.ink500, fontSize: 15)),
            const SizedBox(height: 4),
            Text('Where are you going?', style: RS.heading(26)),
            const SizedBox(height: 16),
            Panel(
              onTap: onFind,
              child: Row(children: [
                const CircleAvatar(backgroundColor: RS.primary, child: Icon(Icons.search, color: Colors.white)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Find a ride', style: RS.heading(17)),
                    const Text('AI matches you with students going your way', style: TextStyle(color: RS.ink500, fontSize: 13)),
                  ]),
                ),
                const Icon(Icons.chevron_right, color: RS.ink400),
              ]),
            ),
            const SizedBox(height: 12),
            Panel(
              onTap: () => user.canDrive
                  ? Navigator.push(context, MaterialPageRoute(builder: (_) => const OfferRideScreen()))
                  : Navigator.push(context, MaterialPageRoute(builder: (_) => const VehicleScreen(offerAfter: true))),
              child: Row(children: [
                const CircleAvatar(backgroundColor: RS.primary50, child: Icon(Icons.directions_car_rounded, color: RS.primary)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Offer a ride', style: RS.heading(17)),
                    Text(user.canDrive ? 'Share empty seats and split fuel costs' : 'Add your car to start offering rides', style: const TextStyle(color: RS.ink500, fontSize: 13)),
                  ]),
                ),
                const Icon(Icons.chevron_right, color: RS.ink400),
              ]),
            ),
            if (active.isNotEmpty || driving.isNotEmpty) const SectionTitle('Your upcoming rides'),
            for (final t in active)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Panel(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TripScreen(bookingId: t.booking.id))),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Text(when(t.ride.departAt), style: RS.heading(15)),
                      const Spacer(),
                      Pill.status(t.booking.status, bookingStatusLabel[t.booking.status] ?? t.booking.status),
                    ]),
                    const SizedBox(height: 10),
                    RouteLine(from: t.booking.pickup, to: t.booking.drop, dense: true),
                    const SizedBox(height: 8),
                    Text('With ${t.driver.name}', style: const TextStyle(color: RS.ink500, fontSize: 13)),
                  ]),
                ),
              ),
            for (final r in driving)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Panel(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DriveScreen(rideId: r.ride.id))),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Text(when(r.ride.departAt), style: RS.heading(15)),
                      const Spacer(),
                      if (r.pending > 0) Pill('${r.pending} request${r.pending == 1 ? '' : 's'}', color: RS.warning, background: RS.warning50) else const Pill('You’re driving'),
                    ]),
                    const SizedBox(height: 10),
                    RouteLine(from: r.ride.origin, to: r.ride.destination, dense: true),
                    const SizedBox(height: 8),
                    Text('${r.ride.seatsBooked}/${r.ride.seatsTotal} seats booked', style: const TextStyle(color: RS.ink500, fontSize: 13)),
                  ]),
                ),
              ),
            const SectionTitle('Leaving soon'),
            if (feed.isEmpty)
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('No rides offered yet', style: RS.heading(16)),
                  const SizedBox(height: 4),
                  const Text('When a VIT student offers a ride, it appears here instantly. Driving somewhere? Offer your empty seats.', style: TextStyle(color: RS.ink500, height: 1.4)),
                ]),
              ),
            for (final f in feed)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: RideCard(
                  ride: f.ride,
                  driver: f.driver,
                  vehicle: f.vehicle,
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RideDetailsScreen(rideId: f.ride.id))),
                ),
              ),
          ]);
        },
      ),
    );
  }
}
