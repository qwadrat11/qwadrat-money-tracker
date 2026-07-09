import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ledgeros.finance',
  appName: 'qwadrat',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#f5f5f7',
  ios: {
    contentInset: 'never',
    backgroundColor: '#f5f5f7',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#f4f5f6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
}

export default config
