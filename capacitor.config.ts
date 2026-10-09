import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android and iOS apps. The app contains all RideSync screens (built into dist/)
 * and talks to the RideSync server over the internet.
 *
 * Build the screens with the server address baked in:
 *   VITE_API_URL=https://your-server npm run build:app
 * Without VITE_API_URL, the app asks for a server link on first launch (handy for testing
 * against a laptop through share.bat).
 */
const config: CapacitorConfig = {
  appId: 'com.ridesync.app',
  appName: 'RideSync',
  webDir: 'dist',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
}

export default config
