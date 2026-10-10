import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../state/session.dart';
import '../theme.dart';
import 'common.dart';
import 'motion.dart';

/* ---- Ride start PIN ---- */

/// Four digits in separate boxes, like an OTP.
class PinBoxes extends StatelessWidget {
  const PinBoxes(this.digits, {super.key, this.length = 4, this.size = 56, this.error = false, this.focused = false});
  final String digits;
  final int length;
  final double size;
  final bool error;
  final bool focused;

  @override
  Widget build(BuildContext context) => Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        for (var i = 0; i < length; i++)
          Container(
            width: size,
            height: size * 1.15,
            margin: EdgeInsets.symmetric(horizontal: size * 0.1),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: RS.surface,
              borderRadius: BorderRadius.circular(RS.radiusMd),
              border: Border.all(
                color: error ? RS.danger : (focused && i == digits.length.clamp(0, length - 1) ? RS.primary : RS.line),
                width: focused && i == digits.length.clamp(0, length - 1) ? 2 : 1.4,
              ),
            ),
            child: Text(i < digits.length ? digits[i] : '', style: RS.heading(size * 0.5)),
          ),
      ]);
}

/// The rider's ride PIN, shown from acceptance until they're in the car.
class RidePinCard extends StatelessWidget {
  const RidePinCard({super.key, required this.pin});
  final String pin;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: RS.primary50, borderRadius: BorderRadius.circular(RS.radiusLg), border: Border.all(color: RS.primary100)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.pin_outlined, color: RS.primary, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text('Your ride PIN', style: RS.heading(16, color: RS.primary700))),
          ]),
          const SizedBox(height: 14),
          Semantics(label: 'Ride PIN ${pin.split('').join(' ')}', child: ExcludeSemantics(child: PinBoxes(pin, size: 54))),
          const SizedBox(height: 14),
          const Text('Tell your driver this PIN when you get in. Only get in if the car and plate match.', textAlign: TextAlign.center, style: TextStyle(color: RS.ink700, height: 1.4)),
        ]),
      );
}

/// Asks the driver for the rider's PIN, then marks them picked up. Returns true once verified.
Future<bool> showPickupPinSheet(BuildContext context, {required String bookingId, required String firstName}) async {
  final api = context.read<Session>().api;
  final pin = TextEditingController();
  final focus = FocusNode();
  String? error;
  var busy = false;
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => StatefulBuilder(
      builder: (sheet, setState) {
        Future<void> verify() async {
          if (busy) return;
          if (pin.text.length != 4) return setState(() => error = 'Enter all 4 digits.');
          setState(() => (busy = true, error = null));
          try {
            await api.pickedUp(bookingId, pin.text);
            if (sheet.mounted) Navigator.pop(sheet, true);
          } catch (e) {
            if (!sheet.mounted) return;
            setState(() => (busy = false, error = errorText(e)));
            pin.clear();
            focus.requestFocus();
          }
        }

        return Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(sheet).viewInsets.bottom + 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Enter $firstName’s ride PIN', style: RS.heading(20)),
            const SizedBox(height: 6),
            Text('$firstName sees a 4-digit PIN on their RideSync trip screen. Ask for it once they’re in the car.', style: const TextStyle(color: RS.ink500, height: 1.4)),
            const SizedBox(height: 20),
            Stack(children: [
              ListenableBuilder(listenable: Listenable.merge([pin, focus]), builder: (_, _) => PinBoxes(pin.text, error: error != null && pin.text.isEmpty, focused: focus.hasFocus)),
              // The real input sits invisibly over the boxes so taps open the number pad.
              Positioned.fill(
                child: Opacity(
                  opacity: 0,
                  child: TextField(
                    controller: pin,
                    focusNode: focus,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    showCursor: false,
                    enableInteractiveSelection: false,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(counterText: '', border: InputBorder.none, filled: false),
                    onChanged: (v) {
                      if (error != null) setState(() => error = null);
                      if (v.length == 4) verify();
                    },
                    onSubmitted: (_) => verify(),
                  ),
                ),
              ),
            ]),
            if (error != null) ...[const SizedBox(height: 14), Notice(error!, tone: 'error')],
            const SizedBox(height: 18),
            LoadingButton(label: 'Verify', icon: Icons.lock_open_rounded, loading: busy, onPressed: verify),
          ]),
        );
      },
    ),
  );
  // Not disposed here: the sheet's closing animation still uses them for a moment.
  if (ok == true && context.mounted) {
    await showMoment(context, Moment.started, 'PIN verified', subtitle: '$firstName is in the car. Drive safe!');
    return true;
  }
  return false;
}

/* ---- Share live trip ---- */

/// Gets a live tracking link from the server and offers WhatsApp or copy.
Future<void> showShareTripSheet(BuildContext context, String bookingId) async {
  final api = context.read<Session>().api;
  ({String url, String text, bool local}) share;
  try {
    share = await api.shareTrip(bookingId);
  } catch (e) {
    if (context.mounted) toast(context, errorText(e));
    return;
  }
  if (!context.mounted) return;
  if (share.local) toast(context, 'Run share.bat on the laptop so family can open this link');
  await showModalBottomSheet<void>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
          child: Text('Share live trip', style: RS.heading(20)),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Text('Family and friends can follow the car live — no app or sign-in needed.', style: TextStyle(color: RS.ink500, height: 1.4)),
        ),
        ListTile(
          leading: const Icon(Icons.chat_rounded, color: Color(0xFF25D366)),
          title: const Text('Send on WhatsApp'),
          onTap: () async {
            Navigator.pop(sheet);
            final ok = await launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(share.text)}'), mode: LaunchMode.externalApplication).catchError((_) => false);
            if (!ok && context.mounted) toast(context, 'Couldn’t open WhatsApp on this phone. Copy the link instead.');
          },
        ),
        ListTile(
          leading: const Icon(Icons.link_rounded),
          title: const Text('Copy link'),
          subtitle: Text(share.url, maxLines: 1, overflow: TextOverflow.ellipsis),
          onTap: () async {
            Navigator.pop(sheet);
            await Clipboard.setData(ClipboardData(text: share.text));
            if (context.mounted) toast(context, 'Trip link copied');
          },
        ),
        const SizedBox(height: 8),
      ]),
    ),
  );
}

/* ---- Student ID verification ---- */

const idCardMaxChars = 380000;

/// Picks a photo of the VIT ID card, shrinks it under the server's limit and uploads it.
Future<void> uploadIdCard(BuildContext context, ImageSource source) async {
  final session = context.read<Session>();
  String? image;
  try {
    // image_picker can only shrink while picking, so a too-large photo is picked once more at a smaller size.
    for (final (width, quality) in const [(1200.0, 70), (900.0, 50)]) {
      final file = await ImagePicker().pickImage(source: source, maxWidth: width, maxHeight: width, imageQuality: quality);
      if (file == null) return;
      final data = 'data:image/jpeg;base64,${base64Encode(await file.readAsBytes())}';
      if (data.length <= idCardMaxChars) {
        image = data;
        break;
      }
      if (width == 1200 && context.mounted) toast(context, 'That photo is a little large — pick it again and we’ll send a smaller copy.');
      if (!context.mounted) return;
    }
  } catch (_) {
    if (context.mounted) toast(context, 'Couldn’t open the camera or photos. Check RideSync’s permissions in Settings.');
    return;
  }
  if (image == null) {
    if (context.mounted) toast(context, 'That photo is too large. Try another one.');
    return;
  }
  try {
    session.setUser(await session.api.uploadIdCard(image));
    if (context.mounted) await showMoment(context, Moment.sent, 'ID card sent', subtitle: 'We’ll verify it soon.');
  } catch (e) {
    if (context.mounted) toast(context, errorText(e));
  }
}
