plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.ridesync.ridesync"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.ridesync.ridesync"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Google Maps key for Android (set GOOGLE_MAPS_ANDROID_KEY when building). Empty = free map.
        manifestPlaceholders["googleMapsKey"] = System.getenv("GOOGLE_MAPS_ANDROID_KEY") ?: ""
    }

    signingConfigs {
        // Test-distribution key, committed so every GitHub build can update the
        // app already on a phone. Use your own private key for the Play Store.
        create("ridesyncTest") {
            storeFile = file("ridesync-test.jks")
            storePassword = "ridesync-test"
            keyAlias = "ridesync"
            keyPassword = "ridesync-test"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("ridesyncTest")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
