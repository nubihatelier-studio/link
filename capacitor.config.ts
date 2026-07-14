import type { CapacitorConfig } from '@capacitor/cli'

// appId is the reverse-DNS bundle identifier used by both the iOS and
// Android builds — change it here before your first App Store / Play
// Console submission, since it's awkward to change afterwards.
const config: CapacitorConfig = {
  appId: 'com.nubih.beadstudio',
  appName: 'Nubih Creator',
  webDir: 'dist',
  server: {
    // Needed for Android's WebView to resolve deep-linking/history
    // navigation the same way the web build does with React Router.
    androidScheme: 'https',
  },
}

export default config
