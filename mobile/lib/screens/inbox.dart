import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'chat.dart';
import 'notifications.dart';

class InboxTab extends StatelessWidget {
  const InboxTab({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Inbox'),
            bottom: const TabBar(labelColor: RS.primary, indicatorColor: RS.primary, unselectedLabelColor: RS.ink500, tabs: [Tab(text: 'Chats'), Tab(text: 'Notifications')]),
          ),
          body: TabBarView(children: [
            LiveLoader<List<Thread>>(
              load: (api) => api.threads(),
              builder: (context, threads, reload) {
                if (threads.isEmpty) {
                  return ListView(children: const [EmptyState(icon: Icons.forum_outlined, title: 'No chats yet', body: 'Once you request or accept a ride, you can message each other here.')]);
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: threads.length,
                  separatorBuilder: (_, _) => const Divider(indent: 76),
                  itemBuilder: (context, i) {
                    final t = threads[i];
                    return ListTile(
                      leading: Avatar(name: t.other.name, photo: t.other.photo),
                      title: Text(t.other.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(t.last?.text ?? '${t.ride.origin.name} → ${t.ride.destination.name}', maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: Text(t.last == null ? dayOf(t.ride.departAt) : ago(t.last!.createdAt), style: const TextStyle(color: RS.ink500, fontSize: 12)),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(bookingId: t.bookingId, other: t.other))),
                    );
                  },
                );
              },
            ),
            const NotificationsList(),
          ]),
        ),
      );
}
