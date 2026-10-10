import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ridesync/api/admin_models.dart';
import 'package:ridesync/api/models.dart';
import 'package:ridesync/screens/admin.dart';
import 'package:ridesync/state/session.dart';

List<Map<String, dynamic>> _days(int Function(int i) v) => [
      for (var i = 0; i < 14; i++)
        {'day': '2026-10-${(i + 1).toString().padLeft(2, '0')}', 'offered': v(i), 'booked': v(i) * 2, 'completed': v(i), 'cancelled': i.isEven ? v(i) : 0},
    ];

void _paint(List<AdminDay> daily, {int? selected}) {
  final recorder = ui.PictureRecorder();
  AdminChartPainter(daily, selected: selected).paint(Canvas(recorder), const Size(360, 210));
  recorder.endRecording().dispose();
}

void main() {
  test('admin stats parse from the server JSON', () {
    final s = AdminStats.fromJson({
      'users': {'total': 120, 'onboarded': 100, 'drivers': 30, 'newThisWeek': 8, 'verified': 40, 'pendingIds': 3, 'rejectedIds': 1},
      'rides': {'total': 50, 'scheduled': 10, 'live': 2, 'completed': 33, 'cancelled': 5, 'womenOnly': 4},
      'bookings': {
        'total': 90, 'pending': 4, 'upcoming': 6, 'live': 3, 'completed': 60, 'cancelled': 15, 'cancelledByRider': 10,
        'cancelledByDriver': 5, 'declined': 2, 'expired': 1, 'sharedTrips': 7,
      },
      'money': {'fares': 12345, 'online': 4000, 'walletTopups': 2500.0, 'refunds': 2, 'co2Kg': 144},
      'daily': _days((i) => i),
    });
    expect(s.users.pendingIds, 3);
    expect(s.rides.live, 2);
    expect(s.bookings.cancelledByDriver, 5);
    expect(s.bookings.completionRate, 80); // 60 / (60 + 15)
    expect(s.money.walletTopups, 2500);
    expect(s.daily, hasLength(14));
    expect(s.daily.last.day, '2026-10-14');
    expect(s.daily.last.booked, 26);
    expect(adminDayLabel(s.daily.first), '1 Oct');
  });

  test('missing admin fields default to zero', () {
    final s = AdminStats.fromJson({});
    expect(s.users.total, 0);
    expect(s.bookings.completionRate, isNull);
    expect(s.daily, isEmpty);
  });

  test('admin rides, students and ID cards parse', () {
    final r = AdminRide.fromJson({
      'id': 'r1', 'driver': 'Asha', 'from': 'Campus', 'to': 'Dadar', 'departAt': '2026-10-10T03:00:00Z', 'createdAt': '2026-10-09T03:00:00Z',
      'status': 'scheduled', 'womenOnly': true, 'seatsTotal': 3, 'farePerSeat': 60,
      'riders': [
        {'name': 'Ravi', 'status': 'cancelled', 'seats': 1, 'fare': 60, 'cancelledBy': 'driver', 'reason': 'Car trouble'},
        {'name': 'Meera', 'status': 'driver_arriving', 'seats': 2, 'fare': 120},
      ],
    });
    expect(r.womenOnly, isTrue);
    expect(adminRiderStatus(r.riders[0]), 'cancelled by driver · Car trouble');
    expect(adminRiderStatus(r.riders[1]), 'waiting for pickup');

    final u = AdminUser.fromJson({'id': 'u1', 'name': 'Ravi', 'email': 'ravi@vit.edu.in', 'idStatus': 'verified', 'cancels': 4, 'createdAt': '2026-10-01T00:00:00Z'});
    expect(u.idStatus, 'verified');
    expect(u.cancels, 4);

    final c = IdCardReview.fromJson({
      'userId': 'u1', 'name': 'Ravi', 'email': 'ravi@vit.edu.in', 'studentId': '22101A0001',
      'image': 'data:image/jpeg;base64,${base64Encode([1, 2, 3])}', 'submittedAt': '2026-10-10T00:00:00Z',
    });
    expect(c.bytes, [1, 2, 3]);
    expect(decodeDataUrl('https://example.com/a.jpg'), isNull);
  });

  test('admin-only accounts go to the admin dashboard', () {
    final admin = User.fromJson({'id': 'a', 'email': 'boss@gmail.com', 'isAdmin': true, 'adminOnly': true, 'onboarded': false});
    expect(admin.adminOnly, isTrue);
    expect(statusFor(admin), SessionStatus.admin);
    final vitAdmin = User.fromJson({'id': 'b', 'email': 'x@vit.edu.in', 'isAdmin': true, 'onboarded': true});
    expect(vitAdmin.isAdmin && !vitAdmin.adminOnly, isTrue);
    expect(statusFor(vitAdmin), SessionStatus.ready);
    expect(statusFor(User.fromJson({'id': 'c', 'email': 'y@vit.edu.in'})), SessionStatus.needsOnboarding);
  });

  group('chart painter', () {
    TestWidgetsFlutterBinding.ensureInitialized();

    test('paints an all-zero fortnight', () {
      expect(() => _paint(_days((_) => 0).map(AdminDay.fromJson).toList()), returnsNormally);
    });

    test('paints real numbers with a day selected', () {
      final daily = _days((i) => i * 3).map(AdminDay.fromJson).toList();
      expect(() => _paint(daily, selected: 5), returnsNormally);
      final layout = AdminChartLayout(const Size(360, 210), daily);
      expect(layout.top, 80); // max booked 78 → next multiple of 4
      expect(layout.indexAt(layout.columnCenter(5)), 5);
      expect(layout.barWidth, lessThanOrEqualTo(10));
    });

    test('paints an empty list', () {
      expect(() => _paint(const []), returnsNormally);
    });

    testWidgets('chart widget toggles tooltip and table view', (tester) async {
      final daily = _days((i) => i).map(AdminDay.fromJson).toList();
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: AdminActivityChart(daily: daily)))));
      expect(find.text('Bookings, last 14 days'), findsOneWidget);
      final paint = find.byWidgetPredicate((w) => w is CustomPaint && w.painter is AdminChartPainter);
      await tester.tapAt(tester.getCenter(paint));
      await tester.pump();
      expect(find.textContaining('offered'), findsOneWidget);
      await tester.tap(find.text('Table view'));
      await tester.pump();
      expect(find.text('Offered'), findsOneWidget);
      expect(paint, findsNothing);
    });
  });
}
