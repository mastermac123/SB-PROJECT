import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../theme.dart';
import '../api/api.dart';
import '../widgets/common.dart';
import '../widgets/motion.dart';
import '../widgets/route_art.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: RS.surface,
        body: Center(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.85, end: 1),
            duration: const Duration(milliseconds: 700),
            curve: Curves.easeOutBack,
            builder: (_, v, child) => Opacity(opacity: ((v - 0.85) / 0.15).clamp(0, 1), child: Transform.scale(scale: v, child: child)),
            child: Image.asset('assets/ridesync-logo.png', width: 220),
          ),
        ),
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
  bool _landing = true;
  void _openLogin() => setState(() => _landing = false);
  bool _codeStep = false;
  bool _busy = false;
  String? _error;

  /// Sign in with Microsoft in the phone's browser, then swap the one-time code for a login.
  Future<void> _microsoft() async {
    setState(() => (_busy = true, _error = null));
    final session = context.read<Session>();
    try {
      final result = await FlutterWebAuth2.authenticate(url: session.api.microsoftStartUrl, callbackUrlScheme: 'ridesync');
      final uri = Uri.parse(result);
      final err = uri.queryParameters['error'];
      if (err != null) throw ApiError(err);
      final code = uri.queryParameters['code'];
      if (code == null) throw const ApiError('Microsoft sign-in didn’t finish. Please try again.');
      final (user, token) = await session.api.appExchange(code);
      await session.signedIn(user, token);
    } on PlatformException catch (e) {
      if (mounted) setState(() => (_busy = false, _error = e.code == 'CANCELED' ? null : 'Couldn’t open Microsoft sign-in. Use the email code instead.'));
    } catch (e) {
      if (mounted) setState(() => (_busy = false, _error = errorText(e)));
    }
  }

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
    if (_landing && !_codeStep) return _landingView(session);
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
      title: 'Sign in',
      subtitle: 'Use your @$_domain college account. RideSync is only for VIT students — new accounts are created automatically.',
      onBack: () => setState(() => (_landing = true, _error = null)),
      children: [
        if (cfg?.microsoftLogin == true) ...[
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: _busy ? null : _microsoft,
              style: OutlinedButton.styleFrom(minimumSize: const Size(64, 52)),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                SizedBox(
                  width: 18,
                  height: 18,
                  child: GridView.count(crossAxisCount: 2, mainAxisSpacing: 2, crossAxisSpacing: 2, physics: const NeverScrollableScrollPhysics(), children: [
                    for (final c in const [Color(0xFFF25022), Color(0xFF7FBA00), Color(0xFF00A4EF), Color(0xFFFFB900)]) ColoredBox(color: c),
                  ]),
                ),
                const SizedBox(width: 10),
                const Text('Sign in with Microsoft'),
              ]),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('or get a code by email', style: TextStyle(color: RS.ink500, fontSize: 13))), Expanded(child: Divider())]),
          ),
        ],
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

extension on _LoginScreenState {
  Widget _landingView(Session session) => Scaffold(
        backgroundColor: RS.surface,
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 16, 24, 28), children: [
            Image.asset('assets/ridesync-logo.png', height: 32, alignment: Alignment.centerLeft),
            const SizedBox(height: 22),
            const FadeSlideIn(child: RouteArt(height: 250)),
            const SizedBox(height: 24),
            FadeSlideIn(index: 1, child: Pill('Only for @$_domain students', icon: Icons.verified, color: RS.success, background: RS.success50)),
            const SizedBox(height: 12),
            FadeSlideIn(index: 2, child: Text('Smart rides.\nShared journeys.', style: RS.heading(34))),
            const SizedBox(height: 8),
            const FadeSlideIn(index: 3, child: Text('AI-powered carpooling built exclusively for the VIT community.', style: TextStyle(color: RS.ink500, fontSize: 16, height: 1.4))),
            const SizedBox(height: 22),
            for (final (i, (icon, title, body)) in const [
              (Icons.directions_car_rounded, 'Offer a ride', 'Share empty seats on trips you’re already taking.'),
              (Icons.auto_awesome, 'Find a ride', 'AI matches you with VIT drivers heading your way.'),
              (Icons.payments_outlined, 'Split the cost', 'Fair cost-sharing by UPI or cash. No surge pricing.'),
            ].indexed)
              FadeSlideIn(
                index: 4 + i,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(children: [
                    CircleAvatar(radius: 18, backgroundColor: RS.primary50, child: Icon(icon, color: RS.primary, size: 18)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text(body, style: const TextStyle(color: RS.ink500, fontSize: 13)),
                      ]),
                    ),
                  ]),
                ),
              ),
            const SizedBox(height: 12),
            if (session.startupError != null) ...[Notice('Can’t reach the RideSync server: ${session.startupError}', tone: 'error'), const SizedBox(height: 12)],
            LoadingButton(label: 'Create account', onPressed: _openLogin),
            const SizedBox(height: 10),
            LoadingButton(label: 'Log in', secondary: true, onPressed: _openLogin),
          ]),
        ),
      );
}
