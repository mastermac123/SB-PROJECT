import '../api/models.dart';

/// Vidyalankar Institute of Technology (vit.edu.in), Wadala East, Mumbai.
const campus = Place(id: 'vit-campus', name: 'VIT Wadala', area: 'Vidyalankar Institute of Technology, Wadala (E)', lat: 19.0222, lng: 72.8711, kind: 'campus');

/// Places VIT students travel to most (same list as the website).
const popularPlaces = <Place>[
  Place(id: 'vit-campus', name: 'VIT Wadala', area: 'Vidyalankar Institute of Technology, Wadala (E)', lat: 19.0222, lng: 72.8711, kind: 'campus'),
  Place(id: 'wadala-rd', name: 'Wadala Road', area: 'Wadala Road Station', lat: 19.0164, lng: 72.8592, kind: 'station'),
  Place(id: 'gtb-nagar', name: 'GTB Nagar', area: 'Guru Tegh Bahadur Nagar Station', lat: 19.0368, lng: 72.8645, kind: 'station'),
  Place(id: 'sion', name: 'Sion', area: 'Sion Station', lat: 19.0473, lng: 72.8635, kind: 'station'),
  Place(id: 'matunga', name: 'Matunga', area: 'Matunga Station', lat: 19.027, lng: 72.8553, kind: 'station'),
  Place(id: 'dadar', name: 'Dadar', area: 'Dadar Station', lat: 19.0186, lng: 72.8429, kind: 'station'),
  Place(id: 'csmt', name: 'CSMT', area: 'Chhatrapati Shivaji Maharaj Terminus', lat: 18.94, lng: 72.8353, kind: 'station'),
  Place(id: 'mumbai-central', name: 'Mumbai Central', area: 'Mumbai Central Station', lat: 18.969, lng: 72.8205, kind: 'station'),
  Place(id: 'ltt', name: 'LTT Kurla', area: 'Lokmanya Tilak Terminus', lat: 19.0688, lng: 72.8901, kind: 'station'),
  Place(id: 'kurla', name: 'Kurla', area: 'Kurla Station', lat: 19.0658, lng: 72.8791, kind: 'station'),
  Place(id: 'chembur', name: 'Chembur', area: 'Chembur Station', lat: 19.0622, lng: 72.9006, kind: 'station'),
  Place(id: 'ghatkopar', name: 'Ghatkopar', area: 'Ghatkopar Station', lat: 19.086, lng: 72.9081, kind: 'station'),
  Place(id: 'powai', name: 'Powai', area: 'Hiranandani Gardens, Powai', lat: 19.1176, lng: 72.906, kind: 'area'),
  Place(id: 'bkc', name: 'BKC', area: 'Bandra Kurla Complex', lat: 19.0656, lng: 72.8682, kind: 'area'),
  Place(id: 'bandra', name: 'Bandra', area: 'Bandra Station (W)', lat: 19.0544, lng: 72.8406, kind: 'station'),
  Place(id: 'worli', name: 'Worli', area: 'Worli Naka', lat: 19.0176, lng: 72.815, kind: 'area'),
  Place(id: 'lower-parel', name: 'Lower Parel', area: 'Lower Parel Station', lat: 18.9953, lng: 72.8302, kind: 'station'),
  Place(id: 'andheri', name: 'Andheri', area: 'Andheri Station', lat: 19.1197, lng: 72.8464, kind: 'station'),
  Place(id: 'airport-t2', name: 'Mumbai Airport T2', area: 'CSMIA Terminal 2, Sahar', lat: 19.0989, lng: 72.8742, kind: 'airport'),
  Place(id: 'airport-t1', name: 'Mumbai Airport T1', area: 'CSMIA Terminal 1, Santacruz', lat: 19.0919, lng: 72.855, kind: 'airport'),
  Place(id: 'goregaon', name: 'Goregaon', area: 'Goregaon Station', lat: 19.1647, lng: 72.8492, kind: 'station'),
  Place(id: 'malad', name: 'Malad', area: 'Malad Station', lat: 19.1868, lng: 72.8484, kind: 'station'),
  Place(id: 'kandivali', name: 'Kandivali', area: 'Kandivali Station', lat: 19.2045, lng: 72.8517, kind: 'station'),
  Place(id: 'borivali', name: 'Borivali', area: 'Borivali Station', lat: 19.2295, lng: 72.8573, kind: 'station'),
  Place(id: 'mulund', name: 'Mulund', area: 'Mulund Station', lat: 19.1726, lng: 72.9566, kind: 'station'),
  Place(id: 'thane', name: 'Thane', area: 'Thane Station', lat: 19.186, lng: 72.9757, kind: 'station'),
  Place(id: 'vashi', name: 'Vashi', area: 'Vashi Station, Navi Mumbai', lat: 19.0771, lng: 72.9988, kind: 'station'),
  Place(id: 'belapur', name: 'CBD Belapur', area: 'Belapur Station, Navi Mumbai', lat: 19.0187, lng: 73.039, kind: 'station'),
];
