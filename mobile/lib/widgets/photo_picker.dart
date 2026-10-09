import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../theme.dart';
import 'common.dart';

/// Profile photo from the camera or gallery, resized and sent as a data URL.
class PhotoPicker extends StatelessWidget {
  const PhotoPicker({super.key, required this.name, required this.photo, required this.onChanged});
  final String name;
  final String? photo;
  final ValueChanged<String?> onChanged;

  Future<void> _pick(BuildContext context, ImageSource source) async {
    Navigator.pop(context);
    try {
      final file = await ImagePicker().pickImage(source: source, maxWidth: 480, maxHeight: 480, imageQuality: 72, preferredCameraDevice: CameraDevice.front);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (bytes.length > 200 * 1024) {
        if (context.mounted) toast(context, 'That photo is too large. Try another one.');
        return;
      }
      onChanged('data:image/jpeg;base64,${base64Encode(bytes)}');
    } catch (_) {
      if (context.mounted) toast(context, 'Couldn’t open the camera or photos. Check RideSync’s permissions in Settings.');
    }
  }

  void _menu(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        builder: (sheet) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Take a photo'), onTap: () => _pick(sheet, ImageSource.camera)),
            ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Choose from gallery'), onTap: () => _pick(sheet, ImageSource.gallery)),
            if (photo != null)
              ListTile(
                leading: const Icon(Icons.delete_outline, color: RS.danger),
                title: const Text('Remove photo', style: TextStyle(color: RS.danger)),
                onTap: () {
                  Navigator.pop(sheet);
                  onChanged(null);
                },
              ),
            const SizedBox(height: 8),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => _menu(context),
        child: Stack(children: [
          Avatar(name: name.isEmpty ? '?' : name, photo: photo, size: 92),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(color: RS.primary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
              child: const Icon(Icons.photo_camera, size: 16, color: Colors.white),
            ),
          ),
        ]),
      );
}
