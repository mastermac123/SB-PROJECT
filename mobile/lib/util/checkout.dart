import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../state/session.dart';
import '../widgets/common.dart';

typedef CheckoutResult = ({String orderId, String paymentId, String signature});

/// Opens Razorpay Checkout for an order the server created.
/// Returns the signed result, or null if the student closed it or it failed (a toast explains why).
Future<CheckoutResult?> razorpayCheckout(BuildContext context, Map<String, dynamic> order, {required String fallbackDescription}) async {
  if (kIsWeb) {
    toast(context, 'Online payment works in the Android/iPhone app or on the website.');
    return null;
  }
  final user = context.read<Session>().user!;
  final rp = Razorpay();
  final done = Completer<CheckoutResult?>();
  rp.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
    if (!done.isCompleted) done.complete((orderId: r.orderId ?? '${order['orderId']}', paymentId: r.paymentId ?? '', signature: r.signature ?? ''));
  });
  rp.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
    if (context.mounted) toast(context, r.code == Razorpay.PAYMENT_CANCELLED ? 'Payment cancelled' : (r.message ?? 'Payment failed. You haven’t been charged.'));
    if (!done.isCompleted) done.complete(null);
  });
  rp.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) {
    if (!done.isCompleted) done.complete(null);
  });
  final prefill = (order['prefill'] as Map?)?.cast<String, dynamic>() ?? {};
  rp.open({
    'key': order['keyId'],
    'amount': order['amount'],
    'currency': order['currency'] ?? 'INR',
    'order_id': order['orderId'],
    'name': 'RideSync',
    'description': order['description'] ?? fallbackDescription,
    'prefill': {'name': prefill['name'] ?? user.name, 'email': prefill['email'] ?? user.email, 'contact': prefill['contact'] ?? user.phone},
    'theme': {'color': '#5038E6'},
  });
  final r = await done.future.timeout(const Duration(minutes: 15), onTimeout: () => null);
  rp.clear();
  return r;
}

/// Asks how much to add, then tops up the RideSync Wallet through Razorpay. Returns true if money was added.
Future<bool> addMoney(BuildContext context, {int? suggested, bool testMode = false}) async {
  final amount = await showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _AddMoneySheet(suggested: suggested ?? 200, testMode: testMode),
  );
  if (amount == null || !context.mounted) return false;
  final api = context.read<Session>().api;
  Map<String, dynamic> order;
  try {
    order = await api.walletTopUpOrder(amount);
  } catch (e) {
    if (context.mounted) toast(context, errorText(e));
    return false;
  }
  if (!context.mounted) return false;
  final r = await razorpayCheckout(context, order, fallbackDescription: 'Add money to RideSync Wallet');
  if (r == null || !context.mounted) return false;
  return attempt(context, () => api.verifyTopUp(r.orderId, r.paymentId, r.signature));
}

class _AddMoneySheet extends StatefulWidget {
  const _AddMoneySheet({required this.suggested, required this.testMode});
  final int suggested;
  final bool testMode;
  @override
  State<_AddMoneySheet> createState() => _AddMoneySheetState();
}

class _AddMoneySheetState extends State<_AddMoneySheet> {
  late final _c = TextEditingController(text: '${widget.suggested}');
  int get _n => int.tryParse(_c.text) ?? 0;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Add money', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 14),
            TextField(
              controller: _c,
              keyboardType: TextInputType.number,
              autofocus: true,
              maxLength: 4,
              decoration: const InputDecoration(prefixText: '₹ ', labelText: 'Amount', helperText: '₹10 – ₹5,000 at a time', counterText: ''),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            Wrap(spacing: 8, children: [
              for (final a in const [100, 200, 500, 1000])
                ChoiceChip(label: Text('₹$a'), selected: _n == a, onSelected: (_) => setState(() => _c.text = '$a')),
            ]),
            if (widget.testMode) ...[
              const SizedBox(height: 12),
              const Notice('Razorpay test mode — no real money moves. Use UPI ID success@razorpay or card 4111 1111 1111 1111 (any future expiry, any CVV).', tone: 'warning'),
            ],
            const SizedBox(height: 14),
            LoadingButton(label: _n >= 10 ? 'Add ₹$_n' : 'Add money', onPressed: _n >= 10 && _n <= 5000 ? () => Navigator.pop(context, _n) : null),
          ]),
        ),
      );
}
