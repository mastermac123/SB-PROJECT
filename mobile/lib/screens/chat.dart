import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';

/// Chat for one booking. New messages arrive live.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.bookingId, required this.other});
  final String bookingId;
  final PublicUser other;
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _text = TextEditingController();
  bool _sending = false;

  Future<void> _send(Future<void> Function() reload) async {
    final t = _text.text.trim();
    if (t.isEmpty || _sending) return;
    setState(() => _sending = true);
    final ok = await attempt(context, () => context.read<Session>().api.sendMessage(widget.bookingId, t));
    if (ok) {
      _text.clear();
      await reload();
    }
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<Session>().user!.id;
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Avatar(name: widget.other.name, photo: widget.other.photo, size: 34),
          const SizedBox(width: 10),
          Expanded(child: Text(widget.other.name, style: RS.heading(17), overflow: TextOverflow.ellipsis)),
        ]),
      ),
      body: LiveLoader<List<Message>>(
        load: (api) => api.messages(widget.bookingId),
        builder: (context, msgs, reload) => Column(children: [
          Expanded(
            child: msgs.isEmpty
                ? ListView(children: [EmptyState(icon: Icons.waving_hand_outlined, title: 'Say hi to ${widget.other.firstName}', body: 'Share where exactly you’ll wait, or any changes to the plan.')])
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(16),
                    itemCount: msgs.length,
                    itemBuilder: (context, i) {
                      final m = msgs[msgs.length - 1 - i];
                      if (m.system) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Center(child: Text(m.text, textAlign: TextAlign.center, style: const TextStyle(color: RS.ink500, fontSize: 12.5))),
                        );
                      }
                      final mine = m.senderId == me;
                      return Align(
                        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 3),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                          decoration: BoxDecoration(
                            color: mine ? RS.primary : RS.surface,
                            border: mine ? null : Border.all(color: RS.line),
                            borderRadius: BorderRadius.only(
                              topLeft: const Radius.circular(18),
                              topRight: const Radius.circular(18),
                              bottomLeft: Radius.circular(mine ? 18 : 4),
                              bottomRight: Radius.circular(mine ? 4 : 18),
                            ),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                            Text(m.text, style: TextStyle(color: mine ? Colors.white : RS.ink900, fontSize: 15)),
                            const SizedBox(height: 2),
                            Text(timeOf(m.createdAt), style: TextStyle(color: mine ? Colors.white70 : RS.ink400, fontSize: 11)),
                          ]),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
              decoration: const BoxDecoration(color: RS.surface, border: Border(top: BorderSide(color: RS.line))),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _text,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: 1000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(hintText: 'Message', counterText: '', fillColor: RS.sunken, contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10)),
                    onSubmitted: (_) => _send(reload),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton.filled(onPressed: _sending ? null : () => _send(reload), icon: const Icon(Icons.send_rounded), style: IconButton.styleFrom(backgroundColor: RS.primary)),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
