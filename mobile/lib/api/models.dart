// Data shapes shared with the RideSync server (see src/lib/types.ts in the web app).

double _d(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
String _s(dynamic v) => v == null ? '' : '$v';
String? _ns(dynamic v) => v == null || v == '' ? null : '$v';
DateTime _t(dynamic v) => DateTime.tryParse('$v')?.toLocal() ?? DateTime.now();
List<String> _strings(dynamic v) => v is List ? v.map((e) => '$e').toList() : const [];
List<Map<String, dynamic>> _maps(dynamic v) => v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];

class LatLngPoint {
  final double lat;
  final double lng;
  const LatLngPoint(this.lat, this.lng);
  factory LatLngPoint.fromJson(Map<String, dynamic> j) => LatLngPoint(_d(j['lat']), _d(j['lng']));
  Map<String, dynamic> toJson() => {'lat': lat, 'lng': lng};
}

class Place {
  final String id;
  final String name;
  final String area;
  final double lat;
  final double lng;
  final String? kind;
  final String? googlePlaceId;
  const Place({required this.id, required this.name, required this.area, required this.lat, required this.lng, this.kind, this.googlePlaceId});

  factory Place.fromJson(Map<String, dynamic> j) => Place(
        id: _s(j['id']),
        name: _s(j['name']),
        area: _s(j['area']),
        lat: _d(j['lat']),
        lng: _d(j['lng']),
        kind: _ns(j['kind']),
        googlePlaceId: _ns(j['googlePlaceId']),
      );

  Map<String, dynamic> toJson() => {
        'id': id.length > 80 ? id.substring(0, 80) : id,
        'name': name,
        'area': area,
        'lat': lat,
        'lng': lng,
        if (kind != null) 'kind': kind,
      };

  LatLngPoint get point => LatLngPoint(lat, lng);
}

class Vehicle {
  final String id;
  final String make;
  final String model;
  final String color;
  final String plate;
  final int seats;
  final String fuel;
  const Vehicle({required this.id, required this.make, required this.model, required this.color, required this.plate, required this.seats, required this.fuel});
  factory Vehicle.fromJson(Map<String, dynamic> j) =>
      Vehicle(id: _s(j['id']), make: _s(j['make']), model: _s(j['model']), color: _s(j['color']), plate: _s(j['plate']), seats: _i(j['seats']), fuel: _s(j['fuel']));
  String get title => '$color $make $model';
}

class PublicUser {
  final String id;
  final String name;
  final String? photo;
  final String? programme;
  final double rating;
  final int ratingCount;
  final int ridesOffered;
  final int ridesTaken;
  final double completionRate;
  const PublicUser({
    required this.id,
    required this.name,
    this.photo,
    this.programme,
    this.rating = 0,
    this.ratingCount = 0,
    this.ridesOffered = 0,
    this.ridesTaken = 0,
    this.completionRate = 0,
  });
  factory PublicUser.fromJson(Map<String, dynamic> j) => PublicUser(
        id: _s(j['id']),
        name: _s(j['name']),
        photo: _ns(j['photo']),
        programme: _ns(j['programme']),
        rating: _d(j['rating']),
        ratingCount: _i(j['ratingCount']),
        ridesOffered: _i(j['ridesOffered']),
        ridesTaken: _i(j['ridesTaken']),
        completionRate: _d(j['completionRate']),
      );
  String get firstName => name.split(' ').first;
}

class EmergencyContact {
  final String name;
  final String phone;
  const EmergencyContact(this.name, this.phone);
  Map<String, dynamic> toJson() => {'name': name, 'phone': phone};
}

class User extends PublicUser {
  final String email;
  final String phone;
  final String studentId;
  final String gender;
  final String? commute;
  final String? upiId;
  final List<String> preferences;
  final List<EmergencyContact> emergencyContacts;
  final Vehicle? vehicle;
  final bool onboarded;
  final double co2SavedKg;

  User.fromJson(Map<String, dynamic> j)
      : email = _s(j['email']),
        phone = _s(j['phone']),
        studentId = _s(j['studentId']),
        gender = _s(j['gender']).isEmpty ? 'undisclosed' : _s(j['gender']),
        commute = _ns(j['commute']),
        upiId = _ns(j['upiId']),
        preferences = _strings(j['preferences']),
        emergencyContacts = _maps(j['emergencyContacts']).map((c) => EmergencyContact(_s(c['name']), _s(c['phone']))).toList(),
        vehicle = j['vehicle'] is Map ? Vehicle.fromJson((j['vehicle'] as Map).cast<String, dynamic>()) : null,
        onboarded = j['onboarded'] == true,
        co2SavedKg = _d(j['co2SavedKg']),
        super(
          id: _s(j['id']),
          name: _s(j['name']),
          photo: _ns(j['photo']),
          programme: _ns(j['programme']),
          rating: _d(j['rating']),
          ratingCount: _i(j['ratingCount']),
          ridesOffered: _i(j['ridesOffered']),
          ridesTaken: _i(j['ridesTaken']),
          completionRate: _d(j['completionRate']),
        );

  bool get canDrive => vehicle != null;
}

class DriverLocation {
  final double lat;
  final double lng;
  final double? heading;
  final DateTime at;
  const DriverLocation(this.lat, this.lng, this.heading, this.at);
  factory DriverLocation.fromJson(Map<String, dynamic> j) =>
      DriverLocation(_d(j['lat']), _d(j['lng']), j['heading'] == null ? null : _d(j['heading']), _t(j['at']));
}

class Ride {
  final String id;
  final String driverId;
  final Place origin;
  final Place destination;
  final DateTime departAt;
  final int seatsTotal;
  final int seatsBooked;
  final int farePerSeat;
  final double maxDetourKm;
  final List<String> preferences;
  final String? note;
  final String status;
  final double distanceKm;
  final int durationMin;
  final List<LatLngPoint> route;
  final DriverLocation? driverLocation;

  Ride.fromJson(Map<String, dynamic> j)
      : id = _s(j['id']),
        driverId = _s(j['driverId']),
        origin = Place.fromJson((j['origin'] as Map).cast<String, dynamic>()),
        destination = Place.fromJson((j['destination'] as Map).cast<String, dynamic>()),
        departAt = _t(j['departAt']),
        seatsTotal = _i(j['seatsTotal']),
        seatsBooked = _i(j['seatsBooked']),
        farePerSeat = _i(j['farePerSeat']),
        maxDetourKm = _d(j['maxDetourKm']),
        preferences = _strings(j['preferences']),
        note = _ns(j['note']),
        status = _s(j['status']),
        distanceKm = _d(j['distanceKm']),
        durationMin = _i(j['durationMin']),
        route = _maps(j['route']).map(LatLngPoint.fromJson).toList(),
        driverLocation = j['driverLocation'] is Map ? DriverLocation.fromJson((j['driverLocation'] as Map).cast<String, dynamic>()) : null;

  int get seatsLeft => seatsTotal - seatsBooked;
}

class Booking {
  final String id;
  final String rideId;
  final String riderId;
  final Place pickup;
  final Place drop;
  final int seats;
  final int fare;
  final String status;
  final double matchScore;
  final DateTime createdAt;
  final String? message;
  final String? paymentMethod;
  final String paymentStatus;
  final String? paymentRef;
  final String? cancelledBy;
  final String? cancelReason;
  final int? riderRating;
  final int? driverRating;

  Booking.fromJson(Map<String, dynamic> j)
      : id = _s(j['id']),
        rideId = _s(j['rideId']),
        riderId = _s(j['riderId']),
        pickup = Place.fromJson((j['pickup'] as Map).cast<String, dynamic>()),
        drop = Place.fromJson((j['drop'] as Map).cast<String, dynamic>()),
        seats = _i(j['seats']),
        fare = _i(j['fare']),
        status = _s(j['status']),
        matchScore = _d(j['matchScore']),
        createdAt = _t(j['createdAt']),
        message = _ns(j['message']),
        paymentMethod = _ns(j['paymentMethod']),
        paymentStatus = _s(j['paymentStatus']).isEmpty ? 'unpaid' : _s(j['paymentStatus']),
        paymentRef = _ns(j['paymentRef']),
        cancelledBy = _ns(j['cancelledBy']),
        cancelReason = _ns(j['cancelReason']),
        riderRating = j['riderRating'] == null ? null : _i(j['riderRating']),
        driverRating = j['driverRating'] == null ? null : _i(j['driverRating']);

  bool get isPaid => const ['marked_paid', 'received', 'paid_online'].contains(paymentStatus);
  bool get isActive => const ['pending', 'accepted', 'confirmed', 'driver_arriving', 'driver_arrived', 'in_progress'].contains(status);
}

class MatchResult {
  final Ride ride;
  final PublicUser driver;
  final Vehicle vehicle;
  final int score;
  final Map<String, double> factors;
  final String tier;
  final double pickupDistanceKm;
  final double dropDistanceKm;
  final int timeDiffMin;
  final double detourKm;
  final int fare;
  final List<String> reasons;
  final List<String> caveats;
  final String? history;

  MatchResult.fromJson(Map<String, dynamic> j)
      : ride = Ride.fromJson((j['ride'] as Map).cast<String, dynamic>()),
        driver = PublicUser.fromJson((j['driver'] as Map).cast<String, dynamic>()),
        vehicle = Vehicle.fromJson((j['vehicle'] as Map).cast<String, dynamic>()),
        score = _i(j['score']),
        factors = ((j['factors'] as Map?) ?? {}).map((k, v) => MapEntry('$k', _d(v))),
        tier = _s(j['tier']),
        pickupDistanceKm = _d(j['pickupDistanceKm']),
        dropDistanceKm = _d(j['dropDistanceKm']),
        timeDiffMin = _i(j['timeDiffMin']),
        detourKm = _d(j['detourKm']),
        fare = _i(j['fare']),
        reasons = _strings(j['reasons']),
        caveats = _strings(j['caveats']),
        history = _ns(j['history']);
}

class FeedItem {
  final Ride ride;
  final PublicUser driver;
  final Vehicle vehicle;
  FeedItem.fromJson(Map<String, dynamic> j)
      : ride = Ride.fromJson((j['ride'] as Map).cast<String, dynamic>()),
        driver = PublicUser.fromJson((j['driver'] as Map).cast<String, dynamic>()),
        vehicle = Vehicle.fromJson((j['vehicle'] as Map).cast<String, dynamic>());
}

class RiderBooking {
  final Booking booking;
  final PublicUser rider;
  final String? riderPhone;
  RiderBooking.fromJson(Map<String, dynamic> j)
      : booking = Booking.fromJson(j),
        rider = PublicUser.fromJson((j['rider'] as Map).cast<String, dynamic>()),
        riderPhone = _ns((j['rider'] as Map)['phone']);
}

class RideDetail {
  final Ride ride;
  final PublicUser driver;
  final Vehicle vehicle;
  final Booking? myBooking;
  final List<RiderBooking> bookings;
  RideDetail.fromJson(Map<String, dynamic> j)
      : ride = Ride.fromJson((j['ride'] as Map).cast<String, dynamic>()),
        driver = PublicUser.fromJson((j['driver'] as Map).cast<String, dynamic>()),
        vehicle = Vehicle.fromJson((j['vehicle'] as Map).cast<String, dynamic>()),
        myBooking = j['myBooking'] is Map ? Booking.fromJson((j['myBooking'] as Map).cast<String, dynamic>()) : null,
        bookings = _maps(j['bookings']).map(RiderBooking.fromJson).toList();
}

class BookingDetail {
  final String role;
  final Booking booking;
  final Ride ride;
  final PublicUser driver;
  final Vehicle vehicle;
  final PublicUser rider;
  final String? driverPhone;
  final String? driverUpiId;
  final String? riderPhone;
  BookingDetail.fromJson(Map<String, dynamic> j)
      : role = _s(j['role']),
        booking = Booking.fromJson((j['booking'] as Map).cast<String, dynamic>()),
        ride = Ride.fromJson((j['ride'] as Map).cast<String, dynamic>()),
        driver = PublicUser.fromJson((j['driver'] as Map).cast<String, dynamic>()),
        vehicle = Vehicle.fromJson((j['vehicle'] as Map).cast<String, dynamic>()),
        rider = PublicUser.fromJson((j['rider'] as Map).cast<String, dynamic>()),
        driverPhone = _ns(j['driverPhone']),
        driverUpiId = _ns(j['driverUpiId']),
        riderPhone = _ns(j['riderPhone']);
  bool get isRider => role == 'rider';
}

class TripItem {
  final Booking booking;
  final Ride ride;
  final PublicUser driver;
  TripItem.fromJson(Map<String, dynamic> j)
      : booking = Booking.fromJson(j),
        ride = Ride.fromJson((j['ride'] as Map).cast<String, dynamic>()),
        driver = PublicUser.fromJson((j['driver'] as Map).cast<String, dynamic>());
}

class OfferedItem {
  final Ride ride;
  final int pending;
  final int earned;
  final int riders;
  OfferedItem.fromJson(Map<String, dynamic> j)
      : ride = Ride.fromJson(j),
        pending = _i(j['pending']),
        earned = _i(j['earned']),
        riders = _i(j['riders']);
}

class Trips {
  final List<TripItem> bookings;
  final List<OfferedItem> rides;
  Trips.fromJson(Map<String, dynamic> j)
      : bookings = _maps(j['bookings']).map(TripItem.fromJson).toList(),
        rides = _maps(j['rides']).map(OfferedItem.fromJson).toList();
}

class Message {
  final String id;
  final String senderId;
  final String text;
  final DateTime createdAt;
  final bool system;
  Message.fromJson(Map<String, dynamic> j)
      : id = _s(j['id']),
        senderId = _s(j['senderId']),
        text = _s(j['text']),
        createdAt = _t(j['createdAt']),
        system = j['system'] == true;
}

class Thread {
  final String bookingId;
  final Ride ride;
  final PublicUser other;
  final Message? last;
  final String status;
  Thread.fromJson(Map<String, dynamic> j)
      : bookingId = _s(j['bookingId']),
        ride = Ride.fromJson((j['ride'] as Map).cast<String, dynamic>()),
        other = PublicUser.fromJson((j['other'] as Map).cast<String, dynamic>()),
        last = j['last'] is Map ? Message.fromJson((j['last'] as Map).cast<String, dynamic>()) : null,
        status = _s(j['status']);
}

class AppNotification {
  final String id;
  final String kind;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool read;
  final String? link;
  AppNotification.fromJson(Map<String, dynamic> j)
      : id = _s(j['id']),
        kind = _s(j['kind']),
        title = _s(j['title']),
        body = _s(j['body']),
        createdAt = _t(j['createdAt']),
        read = j['read'] == true,
        link = _ns(j['link']);
}

class PaymentRecord {
  final String bookingId;
  final String direction;
  final int amount;
  final String method;
  final String status;
  final String? reference;
  final String counterparty;
  final String route;
  final DateTime at;
  PaymentRecord.fromJson(Map<String, dynamic> j)
      : bookingId = _s(j['bookingId']),
        direction = _s(j['direction']),
        amount = _i(j['amount']),
        method = _s(j['method']),
        status = _s(j['status']),
        reference = _ns(j['reference']),
        counterparty = _s(j['counterparty']),
        route = _s(j['route']),
        at = _t(j['at']);
}

class RouteInfo {
  final List<LatLngPoint> coords;
  final double distanceKm;
  final int durationMin;
  final String source;
  RouteInfo.fromJson(Map<String, dynamic> j)
      : coords = _maps(j['coords']).map(LatLngPoint.fromJson).toList(),
        distanceKm = _d(j['distanceKm']),
        durationMin = _i(j['durationMin']),
        source = _s(j['source']);
}

class AppConfig {
  final String allowedDomain;
  final bool emailLogin;
  final bool codesInTerminal;
  final bool devLogin;
  final bool microsoftLogin;

  /// Set when the server has Razorpay keys → "Pay online" is offered.
  final String? razorpayKeyId;

  /// Map tiles chosen by the server (MapTiler when it has a key, else CARTO/OpenStreetMap).
  final String? tileUrl;
  final String? tileAttribution;
  AppConfig.fromJson(Map<String, dynamic> j)
      : microsoftLogin = j['microsoftLogin'] == true,
        tileUrl = _ns(((j['maps'] as Map?)?['tiles'] as Map?)?['url']),
        tileAttribution = _ns(((j['maps'] as Map?)?['tiles'] as Map?)?['attribution']),
        razorpayKeyId = _ns(j['razorpayKeyId']),
        allowedDomain = _s(j['allowedDomain']).isEmpty ? 'vit.edu.in' : _s(j['allowedDomain']),
        emailLogin = j['emailLogin'] == true,
        codesInTerminal = j['codesInTerminal'] == true,
        devLogin = j['devLogin'] == true;
}

/// What a rider is looking for. Sent with searches and booking requests.
class SearchQuery {
  final Place pickup;
  final Place drop;
  final DateTime at;
  final int seats;
  final List<String> preferences;
  const SearchQuery({required this.pickup, required this.drop, required this.at, this.seats = 1, this.preferences = const []});

  Map<String, dynamic> toJson() {
    String two(int n) => n.toString().padLeft(2, '0');
    return {
      'pickup': pickup.toJson(),
      'drop': drop.toJson(),
      'date': '${at.year}-${two(at.month)}-${two(at.day)}',
      'time': '${two(at.hour)}:${two(at.minute)}',
      'at': at.toUtc().toIso8601String(),
      'seats': seats,
      'preferences': preferences,
    };
  }
}
