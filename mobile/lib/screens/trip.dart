import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';
import '../util/geo.dart';
import '../widgets/common.dart';
import '../widgets/map_sheet.dart';
import '../widgets/motion.dart';
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

Future<void> shareRide(BuildContext context, Ride ride, String driverName) async {
  final server = context.read<Session>().server;
  final text = 'RideSync: $driverName is driving ${ride.origin.name} → ${ride.destination.name}, ${when(ride.departAt)} · ${money(ride.farePerSeat)}/seat. '
      'Open RideSync to book: $server/ride/${ride.id}';
  try {
    await SharePlus.instance.share(ShareParams(text: text, subject: 'Ride on RideSync'));
  } catch (_) {
    if (context.mounted) toast(context, 'Couldn’t open sharing on this phone.');
  }
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

  Future<void> _request(Ride ride, PublicUser driver) async {
    final note = TextEditingController();
    final send = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(sheet).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Request a seat', style: RS.heading(20)),
          const SizedBox(height: 6),
          Text('${driver.firstName} gets your request instantly. You’ll be notified when they accept.', style: const TextStyle(color: RS.ink500)),
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
      await showSuccess(context, 'Request sent', subtitle: 'We’ll let you know as soon as ${driver.firstName} accepts.');
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => TripScreen(bookingId: b.id)));
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
    return LiveLoader<RideDetail>(
      refreshable: false,
      loading: MapSheetScaffold(map: (pad) => RideMap(padding: pad), children: const [SizedBox(height: 260, child: SkeletonList(count: 1))]),
      load: (api) => api.ride(widget.rideId),
      builder: (context, d, reload) {
        final ride = d.ride;
        final m = widget.match;
        final mine = ride.driverId == me.id;
        final booking = d.myBooking;
        final arrive = ride.departAt.add(Duration(minutes: ride.durationMin));
        final q = context.read<Session>().lastQuery;
        final Widget footer = mine
            ? LoadingButton(label: 'Manage your ride', icon: Icons.directions_car, onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => DriveScreen(rideId: ride.id))))
            : booking != null && booking.isActive
                ? LoadingButton(label: 'View your booking', onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => TripScreen(bookingId: booking.id))))
                : ride.status != 'scheduled'
                    ? const LoadingButton(label: 'This ride is no longer open', onPressed: null)
                    : ride.seatsLeft <= 0
                        ? const LoadingButton(label: 'Full', onPressed: null)
                        : LoadingButton(label: 'Request seat · ${money(m?.fare ?? ride.farePerSeat)}', loading: _requesting, onPressed: () => _request(ride, d.driver));
        return MapSheetScaffold(
          initialSize: 0.55,
          topActions: [FloatingMapButton(icon: Icons.ios_share_rounded, onTap: () => shareRide(context, ride, d.driver.name))],
          map: (pad) => RideMap(
            padding: pad,
            route: ride.route,
            pins: [
              MapPin(ride.origin.point, 'pickup', label: ride.origin.name),
              MapPin(ride.destination.point, 'drop', label: ride.destination.name),
              if (m != null && q != null) MapPin(q.pickup.point, 'me', label: 'Your pickup'),
            ],
          ),
          footer: footer,
          children: [
            Row(children: [
              Expanded(child: Text(when(ride.departAt), style: RS.heading(22))),
              Text(money(m?.fare ?? ride.farePerSeat), style: RS.heading(24, color: RS.primary)),
            ]),
            Text('${km(ride.distanceKm)} · about ${minutes(ride.durationMin)} · per seat', style: const TextStyle(color: RS.ink500)),
            const SizedBox(height: 16),
            FadeSlideIn(child: Panel(child: RouteLine(from: ride.origin, to: ride.destination, fromTime: timeOf(ride.departAt), toTime: timeOf(arrive)))),
            const SizedBox(height: 12),
            FadeSlideIn(
              index: 1,
              child: Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  DriverRow(driver: d.driver, vehicle: d.vehicle),
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    Pill('${ride.seatsLeft} of ${ride.seatsTotal} seats left', icon: Icons.event_seat_outlined),
                    if (d.driver.ridesOffered > 0) Pill('${d.driver.ridesOffered} rides driven', color: RS.ink700, background: RS.sunken),
                    if (d.driver.ratingCount > 0) Pill('${(d.driver.completionRate * 100).round()}% completed', color: RS.ink700, background: RS.sunken),
                    for (final p in ride.preferences) Pill(preferenceLabel[p] ?? p, color: RS.ink700, background: RS.sunken),
                  ]),
                  if (ride.note != null) ...[const SizedBox(height: 12), Text('“${ride.note}”', style: const TextStyle(color: RS.ink700, fontStyle: FontStyle.italic))],
                ]),
              ),
            ),
            if (m != null) ...[
              const SizedBox(height: 12),
              FadeSlideIn(
                index: 2,
                child: Panel(
                  onTap: () => showWhyMatch(context, m),
                  child: Row(children: [
                    const Icon(Icons.auto_awesome, color: RS.primary),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Why this ride?', style: TextStyle(fontWeight: FontWeight.w700)),
                        Text(m.reasons.isNotEmpty ? m.reasons.first : 'See how RideSync AI matched it', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: RS.ink500, fontSize: 13)),
                      ]),
                    ),
                    MatchBadge(score: m.score, tier: m.tier),
                  ]),
                ),
              ),
              const SizedBox(height: 10),
              Text('Pickup ${km(m.pickupDistanceKm)} from you · drop ${km(m.dropDistanceKm)} from your destination', style: const TextStyle(color: RS.ink500, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            const Row(children: [
              Icon(Icons.verified_user_outlined, size: 18, color: RS.success),
              SizedBox(width: 8),
              Expanded(child: Text('Verified VIT student. Phone numbers are shared only after a seat is confirmed.', style: TextStyle(color: RS.ink500, fontSize: 13))),
            ]),
          ],
        );
      },
    );
  }
}

/* ==========================================================================
   Trip — one booking, live like Ola/Uber: car on the map, ETA, status, pay, rate
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
  Widget build(BuildContext context) => LiveLoader<BookingDetail>(
        refreshable: false,
        loading: MapSheetScaffold(map: (pad) => RideMap(padding: pad), children: const [SizedBox(height: 260, child: SkeletonList(count: 1))]),
        load: (api) async {
          final d = await api.booking(widget.bookingId);
          _rideId = d.ride.id;
          return d;
        },
        builder: (context, d, reload) => _TripView(detail: d, car: _car ?? d.ride.driverLocation),
      );
}

class _TripView extends StatelessWidget {
  const _TripView({required this.detail, required this.car});
  final BookingDetail detail;
  final DriverLocation? car;

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
    final eta = carPoint == null
        ? null
        : switch (b.status) {
            'driver_arriving' => etaMinutes(carPoint, b.pickup.point),
            'in_progress' => etaMinutes(carPoint, b.drop.point),
            _ => null,
          };

    return MapSheetScaffold(
      initialSize: live ? 0.42 : 0.55,
      minSize: 0.28,
      topActions: [if (live && detail.isRider) _SosButton(detail: detail, car: carPoint)],
      map: (pad) => RideMap(
        padding: pad,
        route: ride.route,
        follow: live ? carPoint : null,
        pins: [
          MapPin(b.pickup.point, 'pickup', label: b.pickup.name),
          MapPin(b.drop.point, 'drop', label: b.drop.name),
          if (carPoint != null && live) MapPin(carPoint, 'car', heading: car!.heading),
        ],
      ),
      header: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 350),
          transitionBuilder: (c, a) => FadeTransition(opacity: a, child: SlideTransition(position: Tween(begin: const Offset(0, 0.2), end: Offset.zero).animate(a), child: c)),
          child: Row(
            key: ValueKey(b.status + (eta?.toString() ?? '')),
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (live) const Padding(padding: EdgeInsets.only(top: 4, right: 4), child: LiveDot()),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(eta != null ? (b.status == 'driver_arriving' ? 'Arriving in $eta min' : '$eta min to ${b.drop.name}') : (bookingStatusLabel[b.status] ?? b.status), style: RS.heading(22)),
                  const SizedBox(height: 4),
                  Text(_subtitle(b, ride, detail), style: const TextStyle(color: RS.ink500, height: 1.4)),
                ]),
              ),
            ],
          ),
        ),
        if (b.isActive && stepIndex >= 0) ...[
          const SizedBox(height: 14),
          Row(children: [
            for (var i = 0; i < _steps.length; i++)
              Expanded(
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: i <= stepIndex ? 1 : 0),
                  duration: Duration(milliseconds: 400 + i * 80),
                  builder: (_, v, _) => Container(
                    height: 4,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(color: Color.lerp(RS.sunken, RS.primary, v), borderRadius: BorderRadius.circular(9)),
                  ),
                ),
              ),
          ]),
        ],
      ]),
      children: [
        if (live && carPoint == null && detail.isRider) ...[const SizedBox(height: 12), const Notice('Waiting for the driver’s location… it appears once their app shares GPS.')],
        if (detail.isRider && const ['confirmed', 'driver_arriving', 'driver_arrived'].contains(b.status)) ...[
          const SizedBox(height: 14),
          Panel(
            child: Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: RS.ink900, borderRadius: BorderRadius.circular(8)),
                child: Text(detail.vehicle.plate, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, letterSpacing: 1)),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(detail.vehicle.title, style: const TextStyle(fontWeight: FontWeight.w600))),
              const Icon(Icons.directions_car_filled_rounded, color: RS.primary),
            ]),
          ),
        ],
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
        Panel(child: RouteLine(from: b.pickup, to: b.drop, fromTime: timeOf(ride.departAt))),
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
            if (b.isPaid) const Icon(Icons.check_circle, color: RS.success),
          ]),
        ),
        const SizedBox(height: 16),
        ..._actions(context, detail),
        const SizedBox(height: 8),
        TextButton.icon(onPressed: () => shareRide(context, ride, detail.driver.name), icon: const Icon(Icons.ios_share_rounded, size: 18), label: const Text('Share trip details')),
      ],
    );
  }

  String _subtitle(Booking b, Ride ride, BookingDetail d) => switch (b.status) {
        'pending' => '${d.driver.firstName} will accept or decline soon. You’ll get a notification.',
        'accepted' => '${d.driver.firstName} accepted! Choose how you’ll pay to confirm your seat.',
        'confirmed' => 'Be at ${b.pickup.name} by ${timeOf(ride.departAt)}. You can track the car here once the ride starts.',
        'driver_arriving' => '${d.driver.firstName} is on the way to ${b.pickup.name}.',
        'driver_arrived' => '${d.driver.firstName} is at ${b.pickup.name}. Look for the ${d.vehicle.title} (${d.vehicle.plate}).',
        'in_progress' => 'On the way to ${b.drop.name}. Enjoy the ride!',
        'completed' => 'Thanks for sharing the ride — you saved money and CO₂.',
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
      if (b.status == 'completed' && b.riderRating == null) out.add(LoadingButton(label: 'Rate ${d.driver.firstName}', icon: Icons.star_rounded, onPressed: () => showRateSheet(context, b.id, d.driver.firstName, photo: d.driver.photo)));
      if (const ['pending', 'accepted', 'confirmed'].contains(b.status)) {
        out.add(const SizedBox(height: 10));
        out.add(LoadingButton(label: 'Cancel booking', secondary: true, danger: true, onPressed: () => _cancel(context, () => api.cancelBooking(b.id))));
      }
    } else {
      out.add(LoadingButton(label: 'Open ride controls', icon: Icons.directions_car, onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DriveScreen(rideId: d.ride.id)))));
      if (b.status == 'completed' && b.driverRating == null) {
        out.add(const SizedBox(height: 10));
        out.add(LoadingButton(label: 'Rate ${d.rider.firstName}', secondary: true, icon: Icons.star_rounded, onPressed: () => showRateSheet(context, b.id, d.rider.firstName, photo: d.rider.photo, ratingDriver: false)));
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
        content: const Text('The driver will be notified. Please cancel early so they can offer the seat to someone else. Online payments are refunded automatically.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(c, true), style: TextButton.styleFrom(foregroundColor: RS.danger), child: const Text('Cancel booking')),
        ],
      ),
    );
    if (ok == true && context.mounted) await attempt(context, action, success: 'Booking cancelled');
  }
}

class _SosButton extends StatelessWidget {
  const _SosButton({required this.detail, required this.car});
  final BookingDetail detail;
  final LatLngPoint? car;
  @override
  Widget build(BuildContext context) {
    final user = context.read<Session>().user!;
    final v = detail.vehicle;
    return Material(
      color: RS.danger,
      borderRadius: BorderRadius.circular(999),
      elevation: 3,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          builder: (sheet) {
            final loc = car == null ? '' : ' Location: https://maps.google.com/?q=${car!.lat},${car!.lng}';
            final body = Uri.encodeComponent('SOS from ${user.name}: I’m in a RideSync carpool with ${detail.driver.name}, ${v.color} ${v.model} ${v.plate}.$loc');
            final contacts = user.emergencyContacts.map((c) => '+91${c.phone}').join(',');
            return SafeArea(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Safety', style: RS.heading(20))),
                ListTile(leading: const Icon(Icons.local_police_outlined, color: RS.danger), title: const Text('Call 112 (emergency)'), onTap: () => openUrl(context, 'tel:112')),
                if (contacts.isNotEmpty)
                  ListTile(leading: const Icon(Icons.sms_outlined), title: const Text('Text my emergency contacts'), subtitle: const Text('Sends your ride details and live location'), onTap: () => openUrl(context, 'sms:$contacts?body=$body'))
                else
                  const ListTile(leading: Icon(Icons.info_outline), title: Text('Add emergency contacts in Profile → Safety')),
                ListTile(leading: const Icon(Icons.ios_share_rounded), title: const Text('Share my trip'), onTap: () => shareRide(context, detail.ride, detail.driver.name)),
                const SizedBox(height: 8),
              ]),
            );
          },
        ),
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.sos_rounded, color: Colors.white, size: 20), SizedBox(width: 6), Text('SOS', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800))]),
        ),
      ),
    );
  }
}

/* ---- Payment ---- */

void showPaySheet(BuildContext context, BookingDetail d) {
  final b = d.booking;
  final session = context.read<Session>();
  final api = session.api;
  final upi = d.driverUpiId;
  final razorpayKey = session.config?.razorpayKeyId;

  Future<void> afterUpi() async {
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
    if (paid == true && context.mounted && await attempt(context, () => api.pay(b.id, 'upi')) && context.mounted) {
      await showSuccess(context, 'Payment recorded', subtitle: '${d.driver.firstName} will confirm it’s received.');
    }
  }

  Widget option(IconData icon, String title, String subtitle, VoidCallback? onTap, {bool highlight = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Opacity(
          opacity: onTap == null ? 0.55 : 1,
          child: Panel(
          onTap: onTap,
          child: Row(children: [
            CircleAvatar(backgroundColor: highlight ? RS.primary : RS.primary50, child: Icon(icon, color: highlight ? Colors.white : RS.primary)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(subtitle, style: const TextStyle(color: RS.ink500, fontSize: 13)),
              ]),
            ),
            if (onTap != null) const Icon(Icons.chevron_right),
          ]),
        ),
        ),
      );

  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Pay ${money(b.fare)}', style: RS.heading(24)),
          const SizedBox(height: 4),
          Text(razorpayKey != null ? 'Pay online securely, or pay ${d.driver.firstName} directly.' : 'You pay ${d.driver.firstName} directly. RideSync never holds your money.', style: const TextStyle(color: RS.ink500)),
          const SizedBox(height: 18),
          if (razorpayKey != null && !kIsWeb)
            option(Icons.lock_outline, 'Pay online', 'UPI, cards, netbanking · secured by Razorpay · refunded if cancelled', () {
              Navigator.pop(sheet);
              _payOnline(context, d, razorpayKey);
            }, highlight: true),
          if (upi != null) ...[
            option(Icons.account_balance_wallet_outlined, 'Pay by UPI app', 'Opens GPay, PhonePe or Paytm · $upi', () async {
              Navigator.pop(sheet);
              final launched = await launchUrl(Uri.parse(upiLink(upi, d.driver.name, b.fare, 'RideSync ride ${b.id}')), mode: LaunchMode.externalApplication).catchError((_) => false);
              if (!context.mounted) return;
              if (!launched) toast(context, 'No UPI app found. Pay $upi from any UPI app, then come back.');
              await afterUpi();
            }),
            option(Icons.qr_code_2, 'Show UPI QR code', 'Scan from another phone', () {
              Navigator.pop(sheet);
              showModalBottomSheet<void>(
                context: context,
                builder: (qr) => SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text('Scan to pay ${money(b.fare)}', style: RS.heading(20)),
                      const SizedBox(height: 4),
                      Text('to ${d.driver.name} · $upi', style: const TextStyle(color: RS.ink500)),
                      const SizedBox(height: 16),
                      QrImageView(data: upiLink(upi, d.driver.name, b.fare, 'RideSync ride ${b.id}'), size: 220, eyeStyle: const QrEyeStyle(color: RS.ink900, eyeShape: QrEyeShape.square), dataModuleStyle: const QrDataModuleStyle(color: RS.ink900)),
                      const SizedBox(height: 16),
                      LoadingButton(
                        label: 'I’ve paid',
                        onPressed: () {
                          Navigator.pop(qr);
                          afterUpi();
                        },
                      ),
                    ]),
                  ),
                ),
              );
            }),
          ],
          if (upi == null)
            option(Icons.account_balance_wallet_outlined, 'Pay by UPI', '${d.driver.firstName} hasn’t added a UPI ID yet — message them to add it in Profile → Payment methods', null),
          option(Icons.payments_outlined, 'Cash at pickup', 'Hand the exact amount to the driver', () async {
            Navigator.pop(sheet);
            if (await attempt(context, () => api.pay(b.id, 'cash')) && context.mounted) {
              await showSuccess(context, 'Seat confirmed', subtitle: 'Pay ${money(b.fare)} in cash at pickup.');
            }
          }),
          const SizedBox(height: 4),
          const Row(children: [
            Icon(Icons.shield_outlined, size: 16, color: RS.ink500),
            SizedBox(width: 6),
            Expanded(child: Text('RideSync never asks for your UPI PIN.', style: TextStyle(color: RS.ink500, fontSize: 12.5))),
          ]),
        ]),
      ),
    ),
  );
}

/// Razorpay checkout: the server creates the order and verifies the signature.
Future<void> _payOnline(BuildContext context, BookingDetail d, String keyId) async {
  final api = context.read<Session>().api;
  final user = context.read<Session>().user!;
  Map<String, dynamic> order;
  try {
    order = await api.onlineOrder(d.booking.id);
  } catch (e) {
    if (context.mounted) toast(context, errorText(e));
    return;
  }
  final rp = Razorpay();
  final done = Completer<void>();
  rp.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) async {
    try {
      await api.verifyOnline(d.booking.id, r.orderId ?? '${order['orderId']}', r.paymentId ?? '', r.signature ?? '');
      if (context.mounted) await showSuccess(context, 'Paid ${money(d.booking.fare)}', subtitle: 'Your seat is confirmed. Refunded automatically if the ride is cancelled.');
    } catch (e) {
      if (context.mounted) toast(context, errorText(e));
    }
    if (!done.isCompleted) done.complete();
  });
  rp.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
    if (context.mounted) toast(context, r.code == Razorpay.PAYMENT_CANCELLED ? 'Payment cancelled' : (r.message ?? 'Payment failed. Try again or choose UPI/cash.'));
    if (!done.isCompleted) done.complete();
  });
  rp.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) {
    if (!done.isCompleted) done.complete();
  });
  final prefill = (order['prefill'] as Map?)?.cast<String, dynamic>() ?? {};
  rp.open({
    'key': order['keyId'] ?? keyId,
    'amount': order['amount'],
    'currency': order['currency'] ?? 'INR',
    'order_id': order['orderId'],
    'name': 'RideSync',
    'description': order['description'] ?? 'Ride with ${d.driver.name}',
    'prefill': {'name': prefill['name'] ?? user.name, 'email': prefill['email'] ?? user.email, 'contact': prefill['contact'] ?? user.phone},
    'theme': {'color': '#5038E6'},
  });
  await done.future.timeout(const Duration(minutes: 15), onTimeout: () {});
  rp.clear();
}

/* ---- Rating ---- */

const ratingTags = ['On time', 'Safe driving', 'Friendly', 'Clean car', 'Easy pickup', 'Good music'];
const riderRatingTags = ['On time', 'Friendly', 'Easy pickup', 'Respectful', 'Paid promptly'];

void showRateSheet(BuildContext context, String bookingId, String name, {String? photo, bool ratingDriver = true}) {
  var stars = 5;
  final tags = <String>{};
  final api = context.read<Session>().api;
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => StatefulBuilder(
      builder: (sheet, setState) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Avatar(name: name, photo: photo, size: 64),
            const SizedBox(height: 12),
            Text('How was your ride with $name?', style: RS.heading(20), textAlign: TextAlign.center),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 1; i <= 5; i++)
                AnimatedScale(
                  scale: i <= stars ? 1.15 : 1,
                  duration: const Duration(milliseconds: 180),
                  child: IconButton(
                    iconSize: 40,
                    onPressed: () => setState(() => stars = i),
                    icon: Icon(i <= stars ? Icons.star_rounded : Icons.star_outline_rounded, color: const Color(0xFFF5A524)),
                  ),
                ),
            ]),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
              for (final t in ratingDriver ? ratingTags : riderRatingTags)
                FilterChip(label: Text(t), selected: tags.contains(t), showCheckmark: false, onSelected: (on) => setState(() => on ? tags.add(t) : tags.remove(t))),
            ]),
            const SizedBox(height: 18),
            LoadingButton(
              label: 'Submit rating',
              onPressed: () async {
                Navigator.pop(sheet);
                if (await attempt(context, () => api.rate(bookingId, stars, tags.toList())) && context.mounted) {
                  await showSuccess(context, 'Thanks for rating!', subtitle: 'Ratings keep RideSync safe and reliable.');
                }
              },
            ),
          ]),
        ),
      ),
    ),
  );
}
