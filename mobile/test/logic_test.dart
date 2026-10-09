import 'package:flutter_test/flutter_test.dart';
import 'package:ridesync/api/models.dart';
import 'package:ridesync/data/places.dart';
import 'package:ridesync/state/session.dart';
import 'package:ridesync/util/format.dart';
import 'package:ridesync/util/validation.dart';

void main() {
  test('fare suggestion matches the server formula', () {
    expect(suggestFarePerSeat(20, 3, 'petrol'), 60); // 20 km × ₹11 ÷ 4 = 55 → 60
    expect(suggestFarePerSeat(2, 3, 'ev'), 40); // minimum ₹40
    expect(maxFareFor(60), 90);
  });

  test('server links are cleaned up', () {
    expect(normalizeServer(' ridesync.onrender.com/ '), 'https://ridesync.onrender.com');
    expect(normalizeServer('https://abc.trycloudflare.com/api'), 'https://abc.trycloudflare.com');
    expect(normalizeServer('http://192.168.1.5:5173'), 'http://192.168.1.5:5173');
  });

  test('search query is sent in the server’s format', () {
    final q = SearchQuery(pickup: campus, drop: popularPlaces.last, at: DateTime(2026, 10, 9, 8, 5), seats: 2).toJson();
    expect(q['date'], '2026-10-09');
    expect(q['time'], '08:05');
    expect(q['seats'], 2);
    expect((q['pickup'] as Map)['id'], 'vit-campus');
  });

  test('validation matches the website', () {
    expect(validatePhone('+91 98765 43210'), isNull);
    expect(validatePhone('12345'), isNotNull);
    expect(validatePlate('MH 01 AB 1234'), isNull);
    expect(validatePlate('XYZ'), isNotNull);
    expect(validateStudentId('VU1F2122001'), isNull);
    expect(validateName('Priya'), isNotNull);
  });

  test('booking JSON parses', () {
    final b = Booking.fromJson({
      'id': 'b1', 'rideId': 'r1', 'riderId': 'u1', 'seats': 1, 'fare': 60, 'status': 'confirmed', 'matchScore': 88,
      'createdAt': '2026-10-09T10:00:00.000Z', 'paymentStatus': 'unpaid', 'paymentMethod': 'cash',
      'pickup': campus.toJson(), 'drop': popularPlaces[1].toJson(),
    });
    expect(b.isActive, isTrue);
    expect(b.isPaid, isFalse);
    expect(paymentLabel(b.paymentMethod, b.paymentStatus), 'Cash at pickup');
  });
}
