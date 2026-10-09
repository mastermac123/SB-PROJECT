import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../theme.dart';
import '../widgets/common.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: RS.surface,
        body: Center(child: Image.asset('assets/ridesync-logo.png', width: 220)),
      );
}

/// Shared frame for the sign-in screens: logo, title, subtitle, content.
class _AuthFrame extends StatelessWidget {
  const _AuthFrame({required this.title, required this.subtitle, required this.children, this.onBack});
  final String title;
  final String subtitle;
  final List<Widget> children;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: RS.surface,
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 12, 24, 32), children: [
            Row(children: [
              if (onBack != null) IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back), style: IconButton.styleFrom(backgroundColor: RS.sunken)) else const SizedBox(height: 48),
            ]),
            const SizedBox(height: 12),
            Align(alignment: Alignment.centerLeft, child: Image.asset('assets/ridesync-logo.png', height: 34)),
            const SizedBox(height: 36),
            Text(title, style: RS.heading(28)),
            const SizedBox(height: 8),
            Text(subtitle, style: const TextStyle(color: RS.ink500, fontSize: 15, height: 1.45)),
            const SizedBox(height: 28),
            ...children,
          ]),
        ),
      );
}

/// First launch of a test build: connect to a RideSync server (e.g. the laptop's share.bat link).
class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key});
  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _link = TextEditingController();
  String? _error;
  bool _busy = false;

  Future<void> _connect() async {
    setState(() => (_busy = true, _error = null));
    try {
      await context.read<Session>().connect(_link.text);
    } catch (e) {
      if (mounted) setState(() => (_error = errorText(e), _busy = false));
    }
  }

  @override
  Widget build(BuildContext context) => _AuthFrame(
        title: 'Connect to RideSync',
        subtitle: 'Paste the server link. For testing, it’s the https link shown by share.bat on the laptop running RideSync.',
        children: [
          if (_error != null) ...[Notice(_error!, tone: 'error'), const SizedBox(height: 16)],
          TextField(
            controller: _link,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'Server link', hintText: 'https://something.trycloudflare.com', prefixIcon: Icon(Icons.dns_outlined)),
            onSubmitted: (_) => _connect(),
          ),
          const SizedBox(height: 20),
          LoadingButton(label: 'Connect', icon: Icons.arrow_forward, loading: _busy, onPressed: _connect),
        ],
      );
}

/// Sign in or create an account with a 6-digit code sent to the college email.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _codeStep = false;
  bool _busy = false;
  String? _error;

  String get _domain => context.read<Session>().config?.allowedDomain ?? 'vit.edu.in';
  String get _cleanEmail => _email.text.trim().toLowerCase();

  String? _validateEmail() {
    final e = _cleanEmail;
    if (e.isEmpty) return 'Enter your college email.';
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(e)) return 'Enter a valid email address.';
    if (!e.endsWith('@$_domain')) return 'Use your @$_domain college email. RideSync is only for VIT students.';
    return null;
  }

  Future<void> _sendCode() async {
    final err = _validateEmail();
    if (err != null) return setState(() => _error = err);
    setState(() => (_busy = true, _error = null));
    final session = context.read<Session>();
    try {
      await session.api.requestCode(_cleanEmail);
      await session.reloadConfig();
      if (mounted) {
        _code.clear();
        setState(() => (_codeStep = true, _busy = false));
      }
    } catch (e) {
      if (mounted) setState(() => (_error = errorText(e), _busy = false));
    }
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) return setState(() => _error = 'Enter the 6-digit code.');
    setState(() => (_busy = true, _error = null));
    final session = context.read<Session>();
    try {
      final (user, token) = await session.api.verifyCode(_cleanEmail, code);
      await session.signedIn(user, token);
    } catch (e) {
      if (mounted) setState(() => (_error = errorText(e), _busy = false));
    }
  }

  Future<void> _devLogin() async {
    final err = _validateEmail();
    if (err != null) return setState(() => _error = err);
    setState(() => (_busy = true, _error = null));
    final session = context.read<Session>();
    try {
      final (user, token) = await session.api.devLogin(_cleanEmail);
      await session.signedIn(user, token);
    } catch (e) {
      if (mounted) setState(() => (_error = errorText(e), _busy = false));
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final cfg = session.config;
    if (_codeStep) {
      return _AuthFrame(
        title: 'Check your email',
        subtitle: cfg?.codesInTerminal == true
            ? 'Email isn’t set up on this server yet, so the 6-digit code for $_cleanEmail is shown in the black RideSync window on the laptop.'
            : 'We sent a 6-digit code to $_cleanEmail. It can take a minute — check Junk too.',
        onBack: () => setState(() => (_codeStep = false, _error = null)),
        children: [
          if (_error != null) ...[Notice(_error!, tone: 'error'), const SizedBox(height: 16)],
          TextField(
            controller: _code,
            autofocus: true,
            keyboardType: TextInputType.number,
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            style: RS.heading(26).copyWith(letterSpacing: 10),
            textAlign: TextAlign.center,
            decoration: const InputDecoration(counterText: '', hintText: '••••••'),
            onChanged: (v) => v.length == 6 && !_busy ? _verify() : null,
          ),
          const SizedBox(height: 20),
          LoadingButton(label: 'Verify and continue', loading: _busy, onPressed: _verify),
          const SizedBox(height: 8),
          TextButton(onPressed: _busy ? null : _sendCode, child: const Text('Send a new code')),
        ],
      );
    }
    return _AuthFrame(
      title: 'Welcome to RideSync',
      subtitle: 'Smart rides, shared journeys. Sign in with your @$_domain college email — RideSync is only for VIT students.',
      children: [
        if (session.startupError != null) ...[
          Notice('Can’t reach the RideSync server: ${session.startupError}', tone: 'error'),
          const SizedBox(height: 8),
          TextButton.icon(onPressed: session.refresh, icon: const Icon(Icons.refresh), label: const Text('Try again')),
          const SizedBox(height: 8),
        ],
        if (_error != null) ...[Notice(_error!, tone: 'error'), const SizedBox(height: 16)],
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          textInputAction: TextInputAction.go,
          decoration: InputDecoration(labelText: 'College email', hintText: 'firstname.lastname@$_domain', prefixIcon: const Icon(Icons.mail_outline)),
          onSubmitted: (_) => _sendCode(),
        ),
        const SizedBox(height: 20),
        LoadingButton(label: 'Get login code', icon: Icons.arrow_forward, loading: _busy, onPressed: cfg?.emailLogin == false ? null : _sendCode),
        if (cfg?.devLogin == true) ...[
          const SizedBox(height: 24),
          const Notice('Testing server: you can sign in without a code.', tone: 'warning'),
          const SizedBox(height: 12),
          LoadingButton(label: 'Test sign-in (no code)', secondary: true, loading: _busy, onPressed: _devLogin),
        ],
        const SizedBox(height: 28),
        Row(children: [
          const Icon(Icons.verified_user_outlined, size: 18, color: RS.ink500),
          const SizedBox(width: 8),
          Expanded(child: Text('Only verified @$_domain accounts can use RideSync.', style: const TextStyle(color: RS.ink500, fontSize: 13))),
        ]),
        if (!session.hasBuiltInServer) ...[
          const SizedBox(height: 12),
          TextButton(onPressed: session.changeServer, child: Text('Server: ${session.server} · Change')),
        ],
      ],
    );
  }
}
