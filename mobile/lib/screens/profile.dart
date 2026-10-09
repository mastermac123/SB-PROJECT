import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api.dart';
import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';
import '../util/validation.dart';
import '../widgets/common.dart';
import '../widgets/photo_picker.dart';
import '../widgets/vehicle_form.dart';
import 'drive.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final u = session.user!;
    void open(Widget page) => Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: RefreshIndicator(
        onRefresh: session.reloadUser,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
          Panel(
            child: Row(children: [
              Avatar(name: u.name, photo: u.photo, size: 64),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u.name, style: RS.heading(20)),
                  Text(u.email, style: const TextStyle(color: RS.ink500, fontSize: 13)),
                  const SizedBox(height: 6),
                  Row(children: [RatingText(u), const SizedBox(width: 8), const Pill('VIT verified', icon: Icons.verified, color: RS.success, background: RS.success50)]),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 12),
          Row(children: [
            _stat('${u.ridesOffered}', 'Rides offered'),
            const SizedBox(width: 10),
            _stat('${u.ridesTaken}', 'Rides taken'),
            const SizedBox(width: 10),
            _stat('${u.co2SavedKg.toStringAsFixed(1)} kg', 'CO₂ saved'),
          ]),
          const SectionTitle('Account'),
          _group([
            _row(Icons.person_outline, 'Personal information', u.phone.isEmpty ? null : '+91 ${u.phone}', () => open(const EditProfileScreen())),
            _row(Icons.directions_car_outlined, 'My car', u.vehicle == null ? 'Add your car to offer rides' : '${u.vehicle!.title} · ${u.vehicle!.plate}', () => open(const VehicleScreen())),
            _row(Icons.shield_outlined, 'Safety', u.emergencyContacts.isEmpty ? 'Add emergency contacts' : '${u.emergencyContacts.length} emergency contact${u.emergencyContacts.length == 1 ? '' : 's'}', () => open(const SafetyScreen())),
            _row(Icons.receipt_long_outlined, 'Payments', 'Rides you paid for and received', () => open(const PaymentsScreen())),
          ]),
          const SectionTitle('App'),
          _group([
            if (!session.hasBuiltInServer) _row(Icons.dns_outlined, 'Change server', session.server, () => session.changeServer()),
            _row(Icons.logout, 'Log out', null, () => session.signOut()),
            _row(Icons.delete_outline, 'Delete account', 'Permanently remove your account', () => _delete(context), danger: true),
          ]),
          const SizedBox(height: 24),
          Center(child: Image.asset('assets/ridesync-logo.png', height: 22, opacity: const AlwaysStoppedAnimation(0.6))),
          const SizedBox(height: 4),
          const Center(child: Text('Smart rides. Brighter tomorrows.', style: TextStyle(color: RS.ink400, fontSize: 12))),
        ]),
      ),
    );
  }

  Widget _stat(String value, String label) => Expanded(
        child: Panel(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          child: Column(children: [Text(value, style: RS.heading(18)), const SizedBox(height: 2), Text(label, style: const TextStyle(color: RS.ink500, fontSize: 12), textAlign: TextAlign.center)]),
        ),
      );

  Widget _group(List<Widget> rows) => Card(
        clipBehavior: Clip.antiAlias,
        child: Column(children: [
          for (var i = 0; i < rows.length; i++) ...[if (i > 0) const Divider(indent: 56), rows[i]],
        ]),
      );

  Widget _row(IconData icon, String title, String? subtitle, VoidCallback onTap, {bool danger = false}) => ListTile(
        leading: Icon(icon, color: danger ? RS.danger : RS.ink700),
        title: Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: danger ? RS.danger : RS.ink900)),
        subtitle: subtitle == null ? null : Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: const Icon(Icons.chevron_right, color: RS.ink400),
        onTap: onTap,
      );

  Future<void> _delete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text('Your profile, rides and chats will be removed. This can’t be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep account')),
          TextButton(onPressed: () => Navigator.pop(c, true), style: TextButton.styleFrom(foregroundColor: RS.danger), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final session = context.read<Session>();
    if (await attempt(context, session.api.deleteAccount)) await session.signOut(remote: false);
  }
}

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final User _u = context.read<Session>().user!;
  late final _name = TextEditingController(text: _u.name);
  late final _phone = TextEditingController(text: _u.phone);
  late final _upi = TextEditingController(text: _u.upiId);
  late String? _photo = _u.photo;
  late String _gender = _u.gender;
  Map<String, String?> _errors = {};
  bool _saving = false;

  Future<void> _save() async {
    final e = {'name': validateName(_name.text), 'phone': validatePhone(_phone.text), 'upi': _upi.text.trim().isEmpty ? null : validateUpiId(_upi.text)};
    setState(() => _errors = e);
    if (e.values.any((v) => v != null)) return;
    setState(() => _saving = true);
    final session = context.read<Session>();
    try {
      final u = await session.api.updateMe({'name': _name.text.trim(), 'phone': _phone.text.trim(), 'gender': _gender, 'upiId': _upi.text.trim(), 'photo': ?_photo});
      session.setUser(u);
      if (mounted) {
        toast(context, 'Profile saved');
        Navigator.pop(context);
      }
    } on ApiError catch (err) {
      if (mounted) setState(() => (_saving = false, _errors = {err.field ?? 'name': err.message}));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Personal information')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          Center(child: PhotoPicker(name: _name.text, photo: _photo, onChanged: (p) => setState(() => _photo = p))),
          const SizedBox(height: 24),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'Full name', errorText: _errors['name'])),
          const SizedBox(height: 14),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: 'Mobile number', prefixText: '+91 ', errorText: _errors['phone'])),
          const SizedBox(height: 14),
          TextField(controller: _upi, autocorrect: false, decoration: InputDecoration(labelText: 'UPI ID (drivers)', hintText: 'yourname@okaxis', errorText: _errors['upi'] ?? _errors['upiId'])),
          const SizedBox(height: 14),
          TextField(enabled: false, controller: TextEditingController(text: '${_u.email} · ${_u.studentId}'), decoration: const InputDecoration(labelText: 'College email · Student ID')),
          const SizedBox(height: 18),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (v, l) in const [('female', 'Female'), ('male', 'Male'), ('other', 'Other'), ('undisclosed', 'Prefer not to say')])
              ChoiceChip(label: Text(l), selected: _gender == v, onSelected: (_) => setState(() => _gender = v)),
          ]),
          const SizedBox(height: 28),
          LoadingButton(label: 'Save', loading: _saving, onPressed: _save),
        ]),
      );
}

class VehicleScreen extends StatefulWidget {
  const VehicleScreen({super.key, this.offerAfter = false});

  /// Go straight to "Offer a ride" after saving (from the Home screen).
  final bool offerAfter;
  @override
  State<VehicleScreen> createState() => _VehicleScreenState();
}

class _VehicleScreenState extends State<VehicleScreen> {
  final _form = GlobalKey<VehicleFormState>();
  bool _saving = false;

  Future<void> _save() async {
    final v = _form.currentState?.value();
    if (v == null) return;
    setState(() => _saving = true);
    final session = context.read<Session>();
    try {
      session.setUser(await session.api.saveVehicle(v));
      if (!mounted) return;
      toast(context, 'Car saved');
      if (widget.offerAfter) {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const OfferRideScreen()));
      } else {
        Navigator.pop(context);
      }
    } on ApiError catch (e) {
      _form.currentState?.showServerError(e.field, e.message);
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = context.read<Session>().user!;
    return Scaffold(
      appBar: AppBar(title: Text(u.vehicle == null ? 'Add your car' : 'My car')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        if (u.upiId == null) ...[const Notice('Add your UPI ID in Personal information so riders can pay you directly.'), const SizedBox(height: 16)],
        VehicleForm(key: _form, initial: u.vehicle),
        const SizedBox(height: 28),
        LoadingButton(label: 'Save car', loading: _saving, onPressed: _save),
      ]),
    );
  }
}

class SafetyScreen extends StatefulWidget {
  const SafetyScreen({super.key});
  @override
  State<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends State<SafetyScreen> {
  late final List<(TextEditingController, TextEditingController)> _rows = [
    for (final c in context.read<Session>().user!.emergencyContacts) (TextEditingController(text: c.name), TextEditingController(text: c.phone)),
  ];
  String? _error;
  bool _saving = false;

  Future<void> _save() async {
    final contacts = <Map<String, String>>[];
    for (final (n, p) in _rows) {
      if (n.text.trim().isEmpty && p.text.trim().isEmpty) continue;
      if (n.text.trim().isEmpty || validatePhone(p.text) != null) return setState(() => _error = 'Enter a name and a valid 10-digit mobile number for each contact.');
      contacts.add({'name': n.text.trim(), 'phone': p.text.replaceAll(RegExp(r'\D'), '').substring(p.text.replaceAll(RegExp(r'\D'), '').length - 10)});
    }
    setState(() => (_saving = true, _error = null));
    final session = context.read<Session>();
    try {
      session.setUser(await session.api.updateMe({'emergencyContacts': contacts}));
      if (mounted) {
        toast(context, 'Emergency contacts saved');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => (_saving = false, _error = errorText(e)));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Safety')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          const Notice('During a ride, the SOS button can call 112 or text these contacts your ride details and location.', icon: Icons.shield_outlined),
          const SizedBox(height: 20),
          for (var i = 0; i < _rows.length; i++) ...[
            Row(children: [
              Expanded(child: TextField(controller: _rows[i].$1, decoration: const InputDecoration(labelText: 'Name'))),
              const SizedBox(width: 10),
              Expanded(child: TextField(controller: _rows[i].$2, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile'))),
              IconButton(onPressed: () => setState(() => _rows.removeAt(i)), icon: const Icon(Icons.close)),
            ]),
            const SizedBox(height: 12),
          ],
          if (_rows.length < 3)
            OutlinedButton.icon(onPressed: () => setState(() => _rows.add((TextEditingController(), TextEditingController()))), icon: const Icon(Icons.add), label: const Text('Add contact')),
          const SizedBox(height: 20),
          if (_error != null) ...[Notice(_error!, tone: 'error'), const SizedBox(height: 12)],
          LoadingButton(label: 'Save', loading: _saving, onPressed: _save),
        ]),
      );
}

class PaymentsScreen extends StatelessWidget {
  const PaymentsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Payments')),
        body: LiveLoader<List<PaymentRecord>>(
          load: (api) => api.payments(),
          builder: (context, list, reload) {
            if (list.isEmpty) return ListView(children: const [EmptyState(icon: Icons.receipt_long_outlined, title: 'No payments yet', body: 'Payments for rides you take or offer appear here.')]);
            final paid = list.where((p) => p.direction == 'paid').fold<int>(0, (s, p) => s + p.amount);
            final received = list.where((p) => p.direction == 'received').fold<int>(0, (s, p) => s + p.amount);
            return ListView(padding: const EdgeInsets.all(16), children: [
              Row(children: [
                Expanded(child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('You paid', style: TextStyle(color: RS.ink500)), Text(money(paid), style: RS.heading(22))]))),
                const SizedBox(width: 10),
                Expanded(child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('You received', style: TextStyle(color: RS.ink500)), Text(money(received), style: RS.heading(22, color: RS.success))]))),
              ]),
              const SizedBox(height: 12),
              Card(
                child: Column(children: [
                  for (var i = 0; i < list.length; i++) ...[
                    if (i > 0) const Divider(indent: 16),
                    ListTile(
                      title: Text(list[i].route, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('${list[i].direction == 'paid' ? 'To' : 'From'} ${list[i].counterparty} · ${dayOf(list[i].at)} · ${paymentLabel(list[i].method, list[i].status)}'),
                      trailing: Text('${list[i].direction == 'paid' ? '−' : '+'}${money(list[i].amount)}', style: TextStyle(fontWeight: FontWeight.w700, color: list[i].direction == 'paid' ? RS.ink900 : RS.success)),
                    ),
                  ],
                ]),
              ),
            ]);
          },
        ),
      );
}
