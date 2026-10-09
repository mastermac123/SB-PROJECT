import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// RideSync design tokens (same values as src/styles/tokens.css on the website).
class RS {
  static const primary = Color(0xFF5038E6);
  static const primary700 = Color(0xFF422BC8);
  static const primary50 = Color(0xFFF4F2FF);
  static const primary100 = Color(0xFFEBE7FF);
  static const secondary = Color(0xFF4365F2);
  static const ink900 = Color(0xFF15182E);
  static const ink700 = Color(0xFF3A3D55);
  static const ink500 = Color(0xFF64677E);
  static const ink400 = Color(0xFF8B8DA3);
  static const ink200 = Color(0xFFD6D7E2);
  static const canvas = Color(0xFFF6F5FB);
  static const surface = Colors.white;
  static const sunken = Color(0xFFF1F0F7);
  static const line = Color(0xFFE6E5EF);
  static const success = Color(0xFF0F8A46);
  static const success50 = Color(0xFFE9F7EF);
  static const warning = Color(0xFFA86400);
  static const warning50 = Color(0xFFFFF6E2);
  static const danger = Color(0xFFD12C3B);
  static const danger50 = Color(0xFFFDECEE);

  static const radiusSm = 10.0;
  static const radiusMd = 14.0;
  static const radiusLg = 20.0;
  static const radiusXl = 28.0;

  static TextStyle heading(double size, {Color color = ink900, FontWeight weight = FontWeight.w700}) =>
      GoogleFonts.plusJakartaSans(fontSize: size, fontWeight: weight, color: color, height: 1.2, letterSpacing: -0.2);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: RS.primary, primary: RS.primary, surface: RS.surface, error: RS.danger),
    scaffoldBackgroundColor: RS.canvas,
  );
  final text = GoogleFonts.interTextTheme(base.textTheme).apply(bodyColor: RS.ink900, displayColor: RS.ink900);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(RS.radiusMd));
  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: RS.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      foregroundColor: RS.ink900,
      titleTextStyle: RS.heading(20),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: RS.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(64, 52),
        shape: shape,
        textStyle: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: RS.ink900,
        minimumSize: const Size(64, 48),
        shape: shape,
        side: const BorderSide(color: RS.line),
        textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: RS.primary, textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600))),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: RS.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(RS.radiusSm), borderSide: const BorderSide(color: RS.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(RS.radiusSm), borderSide: const BorderSide(color: RS.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(RS.radiusSm), borderSide: const BorderSide(color: RS.primary, width: 1.6)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(RS.radiusSm), borderSide: const BorderSide(color: RS.danger)),
      labelStyle: const TextStyle(color: RS.ink500),
      hintStyle: const TextStyle(color: RS.ink400),
    ),
    cardTheme: CardThemeData(
      color: RS.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(RS.radiusLg), side: const BorderSide(color: RS.line)),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: RS.surface,
      selectedColor: RS.primary50,
      side: const BorderSide(color: RS.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: RS.ink900),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: RS.surface,
      indicatorColor: RS.primary50,
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStatePropertyAll(GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: RS.ink900,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(RS.radiusMd)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: RS.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(RS.radiusXl))),
      showDragHandle: true,
    ),
    dividerTheme: const DividerThemeData(color: RS.line, space: 1),
  );
}
