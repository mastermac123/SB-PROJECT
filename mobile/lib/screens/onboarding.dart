import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/validation.dart';
import '../widgets/common.dart';
import '../widgets/photo_picker.dart';
import '../widgets/vehicle_form.dart';

/// Profile → how you commute → car and UPI (drivers). Saved to the server at the end.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  int _step = 0;
  bool _busy = false;
  String? _error;
  late final _user = context.read<Session>().user!;
  late final _name = TextEditingController(text: _user.name);
  late final _phone = TextEditingController(text: _user.phone);
  late final _studentId = TextEditingController(text: _user.studentId);
  late final _upi = TextEditingController(text: _user.upiId);
  late String? _photo = _user.photo;
  late String _gender = _user.gender;
  late String _commute = _user.commute ?? 'rider';
  final _vehicle = GlobalKey<VehicleFormState>();
  Map<String, String?> _errors = {};

  bool get _drives => _commute != 'rider';
  int get _steps => _drives ? 3 : 2;

  void _next() {
    setState(() => _error = null);
    if (_step == 0) {
      final e = {'name': validateName(_name.text), 'phone': validatePhone(_phone.text), 'studentId': validateStudentId(_studentId.text)};
      setState(() => _errors = e);
      if (e.values.any((v) => v != null)) return;
    }
    if (_step == _steps - 1) {
      _finish();
    } else {
      setState(() => _step++);
    }
  }

  Future<void> _finish() async {
    Map<String, dynamic>? vehicle;
    if (_drives) {
      vehicle = _vehicle.currentState?.value();
      final upiErr = validateUpiId(_upi.text);
      setState(() => _errors = {..._errors, 'upi': upiErr});
      if (vehicle == null || upiErr != null) return;
    }
    setState(() => (_busy = true, _error = null));
    final session = context.read<Session>();
    try {
      if (vehicle != null) await session.api.saveVehicle(vehicle);
      final u = await session.api.updateMe({
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'studentId': _studentId.text.trim(),
        'gender': _gender,
        'commute': _commute,
        if (_drives) 'upiId': _upi.text.trim(),
        'photo': ?_photo,
        'onboarded': true,
      });
      session.setUser(u);
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
        if (e.field == 'phone' || e.field == 'studentId' || e.field == 'name') _step = 0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RS.surface,
      appBar: AppBar(
        backgroundColor: RS.surface,
        leading: _step > 0 ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => setState(() => _step--)) : null,
        title: Text('Step ${_step + 1} of $_steps'),
        actions: [TextButton(onPressed: () => context.read<Session>().signOut(), child: const Text('Log out'))],
      ),
      body: SafeArea(
        child: Column(children: [
          LinearProgressIndicator(value: (_step + 1) / _steps, color: RS.primary, backgroundColor: RS.sunken, minHeight: 3),
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(24, 24, 24, 24), children: [
              if (_error != null) ...[Notice(_error!, tone: 'error'), const SizedBox(height: 16)],
              ...switch (_step) { 0 => _profile(), 1 => _commuteStep(), _ => _driverStep() },
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
            child: LoadingButton(label: _step == _steps - 1 ? 'Finish' : 'Continue', loading: _busy, onPressed: _next),
          ),
        ]),
      ),
    );
  }

  List<Widget> _profile() => [
        Text('Set up your profile', style: RS.heading(26)),
        const SizedBox(height: 6),
        const Text('Other students see your name and photo. Your phone number is shared only after a ride is confirmed.', style: TextStyle(color: RS.ink500, height: 1.4)),
        const SizedBox(height: 24),
        Center(child: PhotoPicker(name: _name.text, photo: _photo, onChanged: (p) => setState(() => _photo = p))),
        const SizedBox(height: 24),
        TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'Full name', errorText: _errors['name']), onChanged: (_) => setState(() {})),
        const SizedBox(height: 14),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(labelText: 'Mobile number', prefixText: '+91 ', errorText: _errors['phone']),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _studentId,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(labelText: 'Student ID', hintText: 'As on your college ID card', errorText: _errors['studentId']),
        ),
        const SizedBox(height: 18),
        const Text('Gender', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        const Text('Used only for female-friendly ride matching.', style: TextStyle(color: RS.ink500, fontSize: 13)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (v, l) in const [('female', 'Female'), ('male', 'Male'), ('other', 'Other'), ('undisclosed', 'Prefer not to say')])
            ChoiceChip(label: Text(l), selected: _gender == v, onSelected: (_) => setState(() => _gender = v)),
        ]),
      ];

  List<Widget> _commuteStep() => [
        Text('How will you use RideSync?', style: RS.heading(26)),
        const SizedBox(height: 6),
        const Text('You can change this any time.', style: TextStyle(color: RS.ink500)),
        const SizedBox(height: 20),
        for (final (v, title, body, icon) in const [
          ('rider', 'I need rides', 'Find students driving your way and share the cost.', Icons.hail_rounded),
          ('driver', 'I drive', 'Offer empty seats in your car and split fuel costs.', Icons.directions_car_rounded),
          ('both', 'Both', 'Sometimes I drive, sometimes I ride.', Icons.swap_horiz_rounded),
        ]) ...[
          Panel(
            onTap: () => setState(() => _commute = v),
            child: Row(children: [
              CircleAvatar(backgroundColor: _commute == v ? RS.primary : RS.sunken, child: Icon(icon, color: _commute == v ? Colors.white : RS.ink700)),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: RS.heading(16)),
                  const SizedBox(height: 2),
                  Text(body, style: const TextStyle(color: RS.ink500, fontSize: 13)),
                ]),
              ),
              Icon(_commute == v ? Icons.radio_button_checked : Icons.radio_button_off, color: _commute == v ? RS.primary : RS.ink400),
            ]),
          ),
          const SizedBox(height: 12),
        ],
      ];

  List<Widget> _driverStep() => [
        Text('Your car', style: RS.heading(26)),
        const SizedBox(height: 6),
        const Text('Riders see your car so they can find you at pickup.', style: TextStyle(color: RS.ink500)),
        const SizedBox(height: 20),
        VehicleForm(key: _vehicle, initial: _user.vehicle),
        const SizedBox(height: 22),
        TextField(
          controller: _upi,
          autocorrect: false,
          decoration: InputDecoration(labelText: 'UPI ID', hintText: 'yourname@okaxis', helperText: 'Riders pay you directly by UPI. Shown only to riders you accept.', errorText: _errors['upi']),
        ),
      ];
}
