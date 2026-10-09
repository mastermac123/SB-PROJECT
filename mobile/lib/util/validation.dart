// Same rules as src/lib/validation.ts, so the app and the server agree.

String? validateName(String raw) {
  final n = raw.trim();
  if (n.isEmpty) return 'Enter your full name';
  if (n.length < 3 || !n.contains(RegExp(r'\s'))) return 'Enter your first and last name';
  return null;
}

String? validatePhone(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '');
  if (digits.isEmpty) return 'Enter your mobile number';
  if (!RegExp(r'^[6-9]\d{9}$').hasMatch(digits)) return 'Enter a valid 10-digit Indian mobile number';
  return null;
}

String? validateStudentId(String raw) {
  final id = raw.trim().toUpperCase();
  if (id.isEmpty) return 'Enter your student ID';
  if (!RegExp(r'^[A-Z0-9/-]{4,15}$').hasMatch(id)) return 'Use the ID printed on your college ID card (letters and numbers only)';
  return null;
}

String? validateUpiId(String raw) {
  if (raw.trim().isEmpty) return 'Enter your UPI ID';
  if (!RegExp(r'^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$').hasMatch(raw.trim())) return 'UPI IDs look like name@bank';
  return null;
}

String? validatePlate(String raw) {
  final p = raw.replaceAll(RegExp(r'\s+'), '').toUpperCase();
  if (p.isEmpty) return 'Enter your registration number';
  if (!RegExp(r'^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$').hasMatch(p) && !RegExp(r'^\d{2}BH\d{4}[A-Z]{1,2}$').hasMatch(p)) return 'Use the format MH 01 AB 1234';
  return null;
}

String? requiredField(String raw, String label) => raw.trim().isEmpty ? 'Enter the $label' : null;
