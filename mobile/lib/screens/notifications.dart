import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/session.dart';
import '../theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'shell.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Notifications'),
          actions: [TextButton(onPressed: () => attempt(context, () => context.read<Session>().api.readAllNotifications()), child: const Text('Mark all read'))],
        ),
        body: const NotificationsList(),
      );
}

IconData _icon(String kind) => switch (kind) {
      'request' => Icons.person_add_alt_1_outlined,
      'accepted' => Icons.check_circle_outline,
      'rejected' || 'cancelled' => Icons.cancel_outlined,
      'payment' => Icons.payments_outlined,
      'arriving' => Icons.directions_car_outlined,
      'chat' => Icons.chat_bubble_outline,
      'match' => Icons.auto_awesome,
      _ => Icons.notifications_none,
    };

class NotificationsList extends StatelessWidget {
  const NotificationsList({super.key});
  @override
  Widget build(BuildContext context) => LiveLoader<List<AppNotification>>(
        load: (api) => api.notifications(),
        builder: (context, list, reload) {
          if (list.isEmpty) {
            return ListView(children: const [EmptyState(icon: Icons.notifications_none, title: 'You’re all caught up', body: 'Ride requests, acceptances and payments show up here.')]);
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: list.length,
            separatorBuilder: (_, _) => const Divider(indent: 72),
            itemBuilder: (context, i) {
              final n = list[i];
              return ListTile(
                tileColor: n.read ? null : RS.primary50,
                leading: CircleAvatar(backgroundColor: n.read ? RS.sunken : RS.primary100, child: Icon(_icon(n.kind), color: RS.primary, size: 20)),
                title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700)),
                subtitle: Text(n.body, maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: Text(ago(n.createdAt), style: const TextStyle(color: RS.ink500, fontSize: 12)),
                onTap: () {
                  context.read<Session>().api.post('/notifications/${n.id}/read').catchError((_) => null);
                  if (n.link != null) openLink(context, n.link!);
                },
              );
            },
          );
        },
      );
}
