import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.binorehab.app',
  appName: 'Binocular Vision Rehab',
  webDir: '../web/out',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a'
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0f172a'
  }
};

export default config;
