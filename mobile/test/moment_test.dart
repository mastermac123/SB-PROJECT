import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ridesync/widgets/motion.dart';

void main() {
  for (final kind in Moment.values) {
    testWidgets('moment ${kind.name} animates and closes', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(builder: (c) => Scaffold(body: TextButton(onPressed: () => showMoment(c, kind, 'Title ${kind.name}', subtitle: 'Sub'), child: const Text('go')))),
      ));
      await tester.tap(find.text('go'));
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('Title ${kind.name}'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Title ${kind.name}'), findsNothing);
    });
  }
}
