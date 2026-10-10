// Data shapes for the admin dashboard (match /api/admin/* on the server and src/screens/admin.tsx).

import 'dart:convert';
import 'dart:typed_data';

int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
String _s(dynamic v) => v == null ? '' : '$v';
String? _ns(dynamic v) => v == null || v == '' ? null : '$v';
DateTime _t(dynamic v) => DateTime.tryParse('$v')?.toLocal() ?? DateTime.now();
Map<String, dynamic> _m(dynamic v) => v is Map ? v.cast<String, dynamic>() : const {};
List<Map<String, dynamic>> _maps(dynamic v) => v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];

class AdminUserStats {
  final int total, onboarded, drivers, newThisWeek, verified, pendingIds, rejectedIds;
  const AdminUserStats({this.total = 0, this.onboarded = 0, this.drivers = 0, this.newThisWeek = 0, this.verified = 0, this.pendingIds = 0, this.rejectedIds = 0});
  factory AdminUserStats.fromJson(Map<String, dynamic> j) => AdminUserStats(
        total: _i(j['total']),
        onboarded: _i(j['onboarded']),
        drivers: _i(j['drivers']),
        newThisWeek: _i(j['newThisWeek']),
        verified: _i(j['verified']),
        pendingIds: _i(j['pendingIds']),
        rejectedIds: _i(j['rejectedIds']),
      );
}

class AdminRideStats {
  final int total, scheduled, live, completed, cancelled, womenOnly;
  const AdminRideStats({this.total = 0, this.scheduled = 0, this.live = 0, this.completed = 0, this.cancelled = 0, this.womenOnly = 0});
  factory AdminRideStats.fromJson(Map<String, dynamic> j) => AdminRideStats(
        total: _i(j['total']),
        scheduled: _i(j['scheduled']),
        live: _i(j['live']),
        completed: _i(j['completed']),
        cancelled: _i(j['cancelled']),
        womenOnly: _i(j['womenOnly']),
      );
}

class AdminBookingStats {
  final int total, pending, upcoming, live, completed, cancelled, cancelledByRider, cancelledByDriver, declined, expired, sharedTrips;
  const AdminBookingStats({
    this.total = 0,
    this.pending = 0,
    this.upcoming = 0,
    this.live = 0,
    this.completed = 0,
    this.cancelled = 0,
    this.cancelledByRider = 0,
    this.cancelledByDriver = 0,
    this.declined = 0,
    this.expired = 0,
    this.sharedTrips = 0,
  });
  factory AdminBookingStats.fromJson(Map<String, dynamic> j) => AdminBookingStats(
        total: _i(j['total']),
        pending: _i(j['pending']),
        upcoming: _i(j['upcoming']),
        live: _i(j['live']),
        completed: _i(j['completed']),
        cancelled: _i(j['cancelled']),
        cancelledByRider: _i(j['cancelledByRider']),
        cancelledByDriver: _i(j['cancelledByDriver']),
        declined: _i(j['declined']),
        expired: _i(j['expired']),
        sharedTrips: _i(j['sharedTrips']),
      );

  /// completed / (completed + cancelled) as a whole percentage, or null when nothing has finished yet.
  int? get completionRate => completed + cancelled > 0 ? (completed * 100 / (completed + cancelled)).round() : null;
}

class AdminMoneyStats {
  final int fares, online, walletTopups, refunds, co2Kg;
  const AdminMoneyStats({this.fares = 0, this.online = 0, this.walletTopups = 0, this.refunds = 0, this.co2Kg = 0});
  factory AdminMoneyStats.fromJson(Map<String, dynamic> j) =>
      AdminMoneyStats(fares: _i(j['fares']), online: _i(j['online']), walletTopups: _i(j['walletTopups']), refunds: _i(j['refunds']), co2Kg: _i(j['co2Kg']));
}

/// One day of the 14-day activity chart. [day] is 'YYYY-MM-DD' (India date).
class AdminDay {
  final String day;
  final int offered, booked, completed, cancelled;
  const AdminDay({required this.day, this.offered = 0, this.booked = 0, this.completed = 0, this.cancelled = 0});
  factory AdminDay.fromJson(Map<String, dynamic> j) =>
      AdminDay(day: _s(j['day']), offered: _i(j['offered']), booked: _i(j['booked']), completed: _i(j['completed']), cancelled: _i(j['cancelled']));

  /// Noon on that day, so time zones never shift the date.
  DateTime get date => DateTime.tryParse('${day}T12:00:00') ?? DateTime.now();
}

class AdminStats {
  final AdminUserStats users;
  final AdminRideStats rides;
  final AdminBookingStats bookings;
  final AdminMoneyStats money;
  final List<AdminDay> daily;
  const AdminStats({required this.users, required this.rides, required this.bookings, required this.money, required this.daily});
  factory AdminStats.fromJson(Map<String, dynamic> j) => AdminStats(
        users: AdminUserStats.fromJson(_m(j['users'])),
        rides: AdminRideStats.fromJson(_m(j['rides'])),
        bookings: AdminBookingStats.fromJson(_m(j['bookings'])),
        money: AdminMoneyStats.fromJson(_m(j['money'])),
        daily: _maps(j['daily']).map(AdminDay.fromJson).toList(),
      );
}

class AdminRider {
  final String name, status;
  final int seats, fare;
  final String? cancelledBy, reason;
  const AdminRider({required this.name, required this.status, this.seats = 1, this.fare = 0, this.cancelledBy, this.reason});
  factory AdminRider.fromJson(Map<String, dynamic> j) =>
      AdminRider(name: _s(j['name']), status: _s(j['status']), seats: _i(j['seats']), fare: _i(j['fare']), cancelledBy: _ns(j['cancelledBy']), reason: _ns(j['reason']));
}

class AdminRide {
  final String id, driver, from, to, status;
  final DateTime departAt, createdAt;
  final bool womenOnly;
  final int seatsTotal, farePerSeat;
  final List<AdminRider> riders;
  const AdminRide({
    required this.id,
    required this.driver,
    required this.from,
    required this.to,
    required this.status,
    required this.departAt,
    required this.createdAt,
    this.womenOnly = false,
    this.seatsTotal = 0,
    this.farePerSeat = 0,
    this.riders = const [],
  });
  factory AdminRide.fromJson(Map<String, dynamic> j) => AdminRide(
        id: _s(j['id']),
        driver: _s(j['driver']),
        from: _s(j['from']),
        to: _s(j['to']),
        status: _s(j['status']),
        departAt: _t(j['departAt']),
        createdAt: _t(j['createdAt']),
        womenOnly: j['womenOnly'] == true,
        seatsTotal: _i(j['seatsTotal']),
        farePerSeat: _i(j['farePerSeat']),
        riders: _maps(j['riders']).map(AdminRider.fromJson).toList(),
      );
}

class AdminUser {
  final String id, name, email, studentId, phone, gender, idStatus;
  final bool onboarded, hasCar;
  final int offered, taken, cancels;
  final DateTime createdAt;
  const AdminUser({
    required this.id,
    required this.name,
    required this.email,
    this.studentId = '',
    this.phone = '',
    this.gender = '',
    this.idStatus = 'none',
    this.onboarded = false,
    this.hasCar = false,
    this.offered = 0,
    this.taken = 0,
    this.cancels = 0,
    required this.createdAt,
  });
  factory AdminUser.fromJson(Map<String, dynamic> j) => AdminUser(
        id: _s(j['id']),
        name: _s(j['name']),
        email: _s(j['email']),
        studentId: _s(j['studentId']),
        phone: _s(j['phone']),
        gender: _s(j['gender']),
        idStatus: _s(j['idStatus']).isEmpty ? 'none' : _s(j['idStatus']),
        onboarded: j['onboarded'] == true,
        hasCar: j['hasCar'] == true,
        offered: _i(j['offered']),
        taken: _i(j['taken']),
        cancels: _i(j['cancels']),
        createdAt: _t(j['createdAt']),
      );
}

/// A student's ID card photo waiting for an admin to check it.
class IdCardReview {
  final String userId, name, email, studentId, image;
  final String? programme;
  final DateTime submittedAt;
  IdCardReview({required this.userId, required this.name, required this.email, required this.studentId, required this.image, this.programme, required this.submittedAt});
  factory IdCardReview.fromJson(Map<String, dynamic> j) => IdCardReview(
        userId: _s(j['userId']),
        name: _s(j['name']),
        email: _s(j['email']),
        studentId: _s(j['studentId']),
        image: _s(j['image']),
        programme: _ns(j['programme']),
        submittedAt: _t(j['submittedAt']),
      );

  /// The photo's bytes from its data URL (null if it isn't a valid image data URL).
  late final Uint8List? bytes = decodeDataUrl(image);
}

Uint8List? decodeDataUrl(String url) {
  final comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) return null;
  try {
    return base64Decode(url.substring(comma + 1).replaceAll(RegExp(r'\s'), ''));
  } catch (_) {
    return null;
  }
}
