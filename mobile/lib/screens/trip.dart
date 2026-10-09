import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import '../widgets/ride_card.dart';
import '../widgets/ride_map.dart';
import 'chat.dart';
import 'drive.dart';
import 'find.dart';

Future<void> openUrl(BuildContext context, String url, {String? failure}) async {
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) toast(context, failure ?? 'Couldn’t open that on this phone.');
}

String upiLink(String pa, String pn, int amount, String note) {
  final q = {'pa': pa, 'pn': pn, 'am': amount.toStringAsFixed(2), 'cu': 'INR', 'tn': note.length > 60 ? note.substring(0, 60) : note};
  return 'upi://pay?${q.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&')}';
}

/* ==========================================================================
   Ride details (before booking)
   ========================================================================== */

class RideDetailsScreen extends StatefulWidget {
  const RideDetailsScreen({super.key, required this.rideId, this.match});
  final String rideId;
  final MatchResult? match;
  @override
  State<RideDetailsScreen> createState() => _RideDetailsScreenState();
}

class _RideDetailsScreenState extends State<RideDetailsScreen> {
  bool _requesting = false;

  SearchQuery _queryFor(Ride ride) {
    final last = context.read<Session>().lastQuery;
    return last ?? SearchQuery(pickup: ride.origin, drop: ride.destination, at: ride.departAt);
  }

  Future<void> _request(Ride ride) async {
    final note = TextEditingController();
    final send = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(sheet).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Request a seat', style: RS.heading(20)),
          const SizedBox(height: 6),
          const Text('The driver gets your request instantly. You’ll be notified when they accept.', style: TextStyle(color: RS.ink500)),
          const SizedBox(height: 16),
          TextField(controller: note, maxLength: 140, decoration: const InputDecoration(labelText: 'Message to driver (optional)', hintText: 'e.g. I’ll be at the main gate')),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => Navigator.pop(sheet, true), child: const Text('Send request')),
        ]),
      ),
    );
    if (send != true || !mounted) return;
    setState(() => _requesting = true);
    final api = context.read<Session>().api;
    try {
      final b = await api.requestSeat(ride.id, _queryFor(ride), note.text.trim());
      if (!mounted) return;
      toast(context, 'Request sent to the driver');
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => TripScreen(bookingId: b.id)));
    } catch (e) {
      if (mounted) {
        toast(context, errorText(e));
        setState(() => _requesting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<Session>().user!;
    return Scaffold(
      appBar: AppBar(title: const Text('Ride details')),
      body: LiveLoader<RideDetail>(
        load: (api) => api.ride(widget.rideId),
        builder: (context, d, reload) {
          final ride = d.ride;
          final m = widget.match;
          final mine = ride.driverId == me.id;
          final booking = d.myBooking;
          final arrive = ride.departAt.add(Duration(minutes: ride.durationMin));
          return Column(children: [
            Expanded(
              child: ListView(padding: EdgeInsets.zero, children: [
                RideMap(height: 240, route: ride.route, pins: [MapPin(ride.origin.point, 'pickup'), MapPin(ride.destination.point, 'drop')]),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      Expanded(child: Text(when(ride.departAt), style: RS.heading(20))),
                      Text(money(m?.fare ?? ride.farePerSeat), style: RS.heading(22, color: RS.primary)),
                    ]),
                    Text('${km(ride.distanceKm)} · about ${minutes(ride.durationMin)} · per seat', style: const TextStyle(color: RS.ink500)),
                    const SizedBox(height: 16),
                    Panel(child: RouteLine(from: ride.origin, to: ride.destination, fromTime: timeOf(ride.departAt), toTime: timeOf(arrive))),
                    const SizedBox(height: 12),
                    Panel(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        DriverRow(driver: d.driver, vehicle: d.vehicle),
                        const SizedBox(height: 12),
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          Pill('${ride.seatsLeft} of ${ride.seatsTotal} seats left', icon: Icons.event_seat_outlined),
                          if (d.driver.ridesOffered > 0) Pill('${d.driver.ridesOffered} rides driven', color: RS.ink700, background: RS.sunken),
                          for (final p in ride.preferences) Pill(preferenceLabel[p] ?? p, color: RS.ink700, background: RS.sunken),
                        ]),
                        if (ride.note != null) ...[const SizedBox(height: 12), Text('“${ride.note}”', style: const TextStyle(color: RS.ink700, fontStyle: FontStyle.italic))],
                      ]),
                    ),
                    if (m != null) ...[
                      const SizedBox(height: 12),
                      Panel(
                        onTap: () => showWhyMatch(context, m),
                        child: Row(children: [
                          const Icon(Icons.auto_awesome, color: RS.primary),
                          const SizedBox(width: 12),
                          Expanded(child: Text(m.reasons.isNotEmpty ? m.reasons.first : 'See why RideSync matched this ride', maxLines: 2, overflow: TextOverflow.ellipsis)),
                          MatchBadge(score: m.score, tier: m.tier),
                        ]),
                      ),
                    ],
                  ]),
                ),
              ]),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: mine
                    ? LoadingButton(label: 'Manage your ride', icon: Icons.directions_car, onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => DriveScreen(rideId: ride.id))))
                    : booking != null && booking.isActive
                        ? LoadingButton(label: 'View your booking', onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => TripScreen(bookingId: booking.id))))
                        : ride.status != 'scheduled'
                            ? const LoadingButton(label: 'This ride is no longer open', onPressed: null)
                            : ride.seatsLeft <= 0
                                ? const LoadingButton(label: 'Full', onPressed: null)
                                : LoadingButton(label: 'Request seat · ${money(m?.fare ?? ride.farePerSeat)}', loading: _requesting, onPressed: () => _request(ride)),
              ),
            ),
          ]);
        },
      ),
    );
  }
}

/* ==========================================================================
   Trip — one booking, live: status, payment, driver on the map, chat, rating
   ========================================================================== */

class TripScreen extends StatefulWidget {
  const TripScreen({super.key, required this.bookingId});
  final String bookingId;
  @override
  State<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<TripScreen> {
  DriverLocation? _car;
  StreamSubscription<(String, DriverLocation)>? _loc;
  String? _rideId;

  @override
  void initState() {
    super.initState();
    _loc = context.read<Session>().events?.onLocation.listen((e) {
      if (e.$1 == _rideId && mounted) setState(() => _car = e.$2);
    });
  }

  @override
  void dispose() {
    _loc?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Your trip')),
        body: LiveLoader<BookingDetail>(
          load: (api) async {
            final d = await api.booking(widget.bookingId);
            _rideId = d.ride.id;
            return d;
          },
          builder: (context, d, reload) => _TripBody(detail: d, car: _car ?? d.ride.driverLocation, reload: reload),
        ),
      );
}

class _TripBody extends StatelessWidget {
  const _TripBody({required this.detail, required this.car, required this.reload});
  final BookingDetail detail;
  final DriverLocation? car;
  final Future<void> Function() reload;

  static const _steps = ['pending', 'confirmed', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed'];

  @override
  Widget build(BuildContext context) {
    final b = detail.booking;
    final ride = detail.ride;
    final other = detail.isRider ? detail.driver : detail.rider;
    final phone = detail.isRider ? detail.driverPhone : detail.riderPhone;
    final live = const ['driver_arriving', 'driver_arrived', 'in_progress'].contains(b.status);
    final carPoint = car == null ? null : LatLngPoint(car!.lat, car!.lng);
    final stepIndex = _steps.indexOf(b.status == 'accepted' ? 'pending' : b.status);

    return ListView(padding: EdgeInsets.zero, children: [
      RideMap(
        height: live ? 300 : 200,
        route: ride.route,
        follow: live ? carPoint : null,
        pins: [
          MapPin(b.pickup.point, 'pickup'),
          MapPin(b.drop.point, 'drop'),
          if (carPoint != null && live) MapPin(carPoint, 'car', heading: car!.heading),
        ],
      ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(bookingStatusLabel[b.status] ?? b.status, style: RS.heading(22))),
            Pill.status(b.status, b.status == 'completed' ? 'Done' : (b.isActive ? 'Active' : 'Closed')),
          ]),
          const SizedBox(height: 4),
          Text(_subtitle(b, ride, detail), style: const TextStyle(color: RS.ink500, height: 1.4)),
          if (b.isActive && stepIndex >= 0) ...[
            const SizedBox(height: 14),
            Row(children: [
              for (var i = 0; i < _steps.length; i++)
                Expanded(child: Container(height: 4, margin: const EdgeInsets.symmetric(horizontal: 2), decoration: BoxDecoration(color: i <= stepIndex ? RS.primary : RS.sunken, borderRadius: BorderRadius.circular(9)))),
            ]),
          ],
          if (live && carPoint == null && detail.isRider) ...[const SizedBox(height: 12), const Notice('Waiting for the driver’s location… it appears once their app shares GPS.')],
          const SizedBox(height: 16),
          Panel(child: RouteLine(from: b.pickup, to: b.drop, fromTime: timeOf(ride.departAt))),
          const SizedBox(height: 12),
          Panel(
            child: Column(children: [
              DriverRow(driver: other, vehicle: detail.isRider ? detail.vehicle : null),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(bookingId: b.id, other: other))),
                    icon: const Icon(Icons.chat_bubble_outline, size: 18),
                    label: const Text('Message'),
                  ),
                ),
                if (phone != null) ...[
                  const SizedBox(width: 10),
                  Expanded(child: OutlinedButton.icon(onPressed: () => openUrl(context, 'tel:+91$phone'), icon: const Icon(Icons.call_outlined, size: 18), label: const Text('Call'))),
                ],
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          Panel(
            child: Row(children: [
              const Icon(Icons.payments_outlined, color: RS.ink700),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${money(b.fare)} · ${b.seats} seat${b.seats == 1 ? '' : 's'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(paymentLabel(b.paymentMethod, b.paymentStatus), style: const TextStyle(color: RS.ink500, fontSize: 13)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          ..._actions(context, detail),
          if (live && detail.isRider) ...[const SizedBox(height: 8), _SafetyButton(detail: detail, car: carPoint)],
        ]),
      ),
    ]);
  }

  String _subtitle(Booking b, Ride ride, BookingDetail d) => switch (b.status) {
        'pending' => '${d.driver.firstName} will accept or decline soon. You’ll get a notification.',
        'accepted' => '${d.driver.firstName} accepted! Choose how you’ll pay to confirm your seat.',
        'confirmed' => 'Be at ${b.pickup.name} by ${timeOf(ride.departAt)}. Track the car here once the ride starts.',
        'driver_arriving' => '${d.driver.firstName} is on the way to ${b.pickup.name}.',
        'driver_arrived' => '${d.driver.firstName} is at ${b.pickup.name}. Look for the ${d.vehicle.title} (${d.vehicle.plate}).',
        'in_progress' => 'Enjoy the ride to ${b.drop.name}.',
        'completed' => 'Thanks for sharing the ride. You saved CO₂ and money.',
        'rejected' => 'The driver couldn’t take this request. Try another match.',
        'cancelled' => b.cancelReason ?? 'This booking was cancelled.',
        _ => '',
      };

  List<Widget> _actions(BuildContext context, BookingDetail d) {
    final b = d.booking;
    final api = context.read<Session>().api;
    final out = <Widget>[];
    if (d.isRider) {
      final canPay = const ['accepted', 'confirmed', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed'].contains(b.status) && !b.isPaid && b.paymentStatus != 'refunded';
      if (canPay && !(b.paymentMethod == 'cash' && b.status != 'accepted')) {
        out.add(LoadingButton(label: b.status == 'accepted' ? 'Confirm seat & choose payment' : 'Pay ${money(b.fare)}', icon: Icons.payments, onPressed: () => showPaySheet(context, d)));
      }
      if (b.status == 'completed' && b.riderRating == null) out.add(LoadingButton(label: 'Rate ${d.driver.firstName}', icon: Icons.star_rounded, onPressed: () => showRateSheet(context, b.id, d.driver.firstName)));
      if (const ['pending', 'accepted', 'confirmed'].contains(b.status)) {
        out.add(const SizedBox(height: 10));
        out.add(LoadingButton(label: 'Cancel booking', secondary: true, danger: true, onPressed: () => _cancel(context, () => api.cancelBooking(b.id))));
      }
    } else {
      out.add(LoadingButton(label: 'Open ride controls', icon: Icons.directions_car, onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DriveScreen(rideId: d.ride.id)))));
      if (b.status == 'completed' && b.driverRating == null) {
        out.add(const SizedBox(height: 10));
        out.add(LoadingButton(label: 'Rate ${d.rider.firstName}', secondary: true, icon: Icons.star_rounded, onPressed: () => showRateSheet(context, b.id, d.rider.firstName)));
      }
    }
    if (b.status == 'rejected' || b.status == 'cancelled') {
      out.add(LoadingButton(label: 'Find another ride', secondary: true, onPressed: () => Navigator.popUntil(context, (r) => r.isFirst)));
    }
    return out;
  }

  Future<void> _cancel(BuildContext context, Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content: const Text('The driver will be notified. Please cancel early so they can offer the seat to someone else.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(c, true), style: TextButton.styleFrom(foregroundColor: RS.danger), child: const Text('Cancel booking')),
        ],
      ),
    );
    if (ok == true && context.mounted) await attempt(context, action, success: 'Booking cancelled');
  }
}

class _SafetyButton extends StatelessWidget {
  const _SafetyButton({required this.detail, required this.car});
  final BookingDetail detail;
  final LatLngPoint? car;
  @override
  Widget build(BuildContext context) {
    final user = context.read<Session>().user!;
    final v = detail.vehicle;
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(foregroundColor: RS.danger),
      icon: const Icon(Icons.sos_rounded),
      label: const Text('Safety & SOS'),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        builder: (sheet) {
          final loc = car == null ? '' : ' Location: https://maps.google.com/?q=${car!.lat},${car!.lng}';
          final body = Uri.encodeComponent('SOS from ${user.name}: I’m in a RideSync carpool with ${detail.driver.name}, ${v.color} ${v.model} ${v.plate}.$loc');
          final contacts = user.emergencyContacts.map((c) => '+91${c.phone}').join(',');
          return SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ListTile(leading: const Icon(Icons.local_police_outlined, color: RS.danger), title: const Text('Call 112 (emergency)'), onTap: () => openUrl(context, 'tel:112')),
              if (contacts.isNotEmpty)
                ListTile(leading: const Icon(Icons.sms_outlined), title: const Text('Text my emergency contacts'), subtitle: const Text('Sends your ride details and location'), onTap: () => openUrl(context, 'sms:$contacts?body=$body'))
              else
                const ListTile(leading: Icon(Icons.info_outline), title: Text('Add emergency contacts in Profile → Safety')),
              const SizedBox(height: 8),
            ]),
          );
        },
      ),
    );
  }
}

/* ---- Payment ---- */

void showPaySheet(BuildContext context, BookingDetail d) {
  final b = d.booking;
  final api = context.read<Session>().api;
  final upi = d.driverUpiId;
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Pay ${money(b.fare)}', style: RS.heading(22)),
          const SizedBox(height: 4),
          Text('You pay ${d.driver.firstName} directly. RideSync never holds your money.', style: const TextStyle(color: RS.ink500)),
          const SizedBox(height: 18),
          if (upi != null) ...[
            Panel(
              onTap: () async {
                Navigator.pop(sheet);
                final launched = await launchUrl(Uri.parse(upiLink(upi, d.driver.name, b.fare, 'RideSync ride ${b.id}')), mode: LaunchMode.externalApplication).catchError((_) => false);
                if (!context.mounted) return;
                if (!launched) toast(context, 'No UPI app found. Pay $upi from any UPI app, then come back.');
                final paid = await showDialog<bool>(
                  context: context,
                  builder: (c) => AlertDialog(
                    title: const Text('Did the payment go through?'),
                    content: Text('Only confirm after your UPI app shows ${money(b.fare)} sent to $upi.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Not yet')),
                      FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Yes, I paid')),
                    ],
                  ),
                );
                if (paid == true && context.mounted) await attempt(context, () => api.pay(b.id, 'upi'), success: 'Payment recorded — the driver will confirm');
              },
              child: Row(children: [
                const CircleAvatar(backgroundColor: RS.primary50, child: Icon(Icons.qr_code_2, color: RS.primary)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Pay by UPI', style: TextStyle(fontWeight: FontWeight.w700)),
                    Text('Opens GPay, PhonePe or Paytm · $upi', style: const TextStyle(color: RS.ink500, fontSize: 13)),
                  ]),
                ),
                const Icon(Icons.chevron_right),
              ]),
            ),
            const SizedBox(height: 10),
          ],
          Panel(
            onTap: () async {
              Navigator.pop(sheet);
              await attempt(context, () => api.pay(b.id, 'cash'), success: 'Seat confirmed — pay in cash at pickup');
            },
            child: const Row(children: [
              CircleAvatar(backgroundColor: RS.sunken, child: Icon(Icons.payments_outlined, color: RS.ink700)),
              SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Cash at pickup', style: TextStyle(fontWeight: FontWeight.w700)),
                  Text('Hand the exact amount to the driver', style: TextStyle(color: RS.ink500, fontSize: 13)),
                ]),
              ),
              Icon(Icons.chevron_right),
            ]),
          ),
          if (upi == null) ...[const SizedBox(height: 12), const Notice('This driver hasn’t added a UPI ID yet, so cash is the only option.')],
        ]),
      ),
    ),
  );
}

/* ---- Rating ---- */

void showRateSheet(BuildContext context, String bookingId, String name) {
  var stars = 5;
  final api = context.read<Session>().api;
  showModalBottomSheet<void>(
    context: context,
    builder: (sheet) => StatefulBuilder(
      builder: (sheet, setState) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('How was your ride with $name?', style: RS.heading(20), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  iconSize: 40,
                  onPressed: () => setState(() => stars = i),
                  icon: Icon(i <= stars ? Icons.star_rounded : Icons.star_outline_rounded, color: const Color(0xFFF5A524)),
                ),
            ]),
            const SizedBox(height: 16),
            LoadingButton(
              label: 'Submit rating',
              onPressed: () async {
                Navigator.pop(sheet);
                await attempt(context, () => api.rate(bookingId, stars), success: 'Thanks for rating!');
              },
            ),
          ]),
        ),
      ),
    ),
  );
}
