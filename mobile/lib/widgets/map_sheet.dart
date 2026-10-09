import 'package:flutter/material.dart';

import '../theme.dart';

/// Ola/Uber-style layout: a full-screen map with a draggable sheet on top, a
/// floating back button, and an optional action pinned to the bottom.
class MapSheetScaffold extends StatelessWidget {
  const MapSheetScaffold({
    super.key,
    required this.map,
    required this.children,
    this.header,
    this.footer,
    this.minSize = 0.32,
    this.initialSize = 0.48,
    this.maxSize = 0.92,
    this.showBack = true,
    this.topActions = const [],
    this.title,
  });

  /// Build the map with the bottom padding the sheet covers, so routes stay visible.
  final Widget Function(EdgeInsets padding) map;
  final List<Widget> children;

  /// Stays pinned at the top of the sheet while the rest scrolls (status, ETA).
  final Widget? header;
  final Widget? footer;
  final double minSize;
  final double initialSize;
  final double maxSize;
  final bool showBack;
  final List<Widget> topActions;
  final Widget? title;

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: RS.canvas,
      body: Stack(children: [
        Positioned.fill(child: map(EdgeInsets.only(top: top + 56, bottom: h * initialSize))),
        Positioned(
          top: top + 8,
          left: 12,
          right: 12,
          child: Row(children: [
            if (showBack && Navigator.of(context).canPop()) _Floating(icon: Icons.arrow_back, onTap: () => Navigator.of(context).maybePop()),
            if (title != null) ...[const SizedBox(width: 10), Flexible(child: _FloatingLabel(child: title!))],
            const Spacer(),
            ...topActions,
          ]),
        ),
        DraggableScrollableSheet(
          minChildSize: minSize,
          initialChildSize: initialSize,
          maxChildSize: maxSize,
          snap: true,
          snapSizes: [initialSize],
          builder: (context, controller) => Container(
            decoration: const BoxDecoration(
              color: RS.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(RS.radiusXl)),
              boxShadow: [BoxShadow(color: Color(0x2215182E), blurRadius: 24, offset: Offset(0, -4))],
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(RS.radiusXl)),
              child: CustomScrollView(
                controller: controller,
                slivers: [
                  PinnedHeaderSliver(
                    child: Container(
                      color: RS.surface,
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: RS.ink200, borderRadius: BorderRadius.circular(9)))),
                        const SizedBox(height: 14),
                        if (header != null) ...[header!, const SizedBox(height: 12)],
                      ]),
                    ),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, footer == null ? 24 : 96),
                    sliver: SliverList.list(children: children),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (footer != null)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              decoration: const BoxDecoration(color: RS.surface, border: Border(top: BorderSide(color: RS.line))),
              padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).padding.bottom),
              child: footer,
            ),
          ),
      ]),
    );
  }
}

class _Floating extends StatelessWidget {
  const _Floating({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
        color: RS.surface,
        shape: const CircleBorder(),
        elevation: 3,
        shadowColor: const Color(0x4415182E),
        child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: Padding(padding: const EdgeInsets.all(11), child: Icon(icon, color: RS.ink900, size: 22))),
      );
}

/// A round floating map button (recenter, notifications…).
class FloatingMapButton extends StatelessWidget {
  const FloatingMapButton({super.key, required this.icon, required this.onTap, this.badge = 0});
  final IconData icon;
  final VoidCallback onTap;
  final int badge;
  @override
  Widget build(BuildContext context) => Badge(isLabelVisible: badge > 0, label: Text('$badge'), child: _Floating(icon: icon, onTap: onTap));
}

class _FloatingLabel extends StatelessWidget {
  const _FloatingLabel({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Material(
        color: RS.surface,
        elevation: 3,
        shadowColor: const Color(0x4415182E),
        borderRadius: BorderRadius.circular(999),
        child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11), child: DefaultTextStyle.merge(style: const TextStyle(fontWeight: FontWeight.w600, color: RS.ink900), child: child)),
      );
}
