import type { ConfigContext, ExpoConfig } from 'expo/config';

// Placeholder identifiers until the real ones are chosen (SPEC §22).
const BUNDLE_ID = process.env.SIGNFLOW_BUNDLE_ID ?? 'com.example.signflow';
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
// Host of the guest signing page (SPEC §5.12), e.g. sign.example.com. When set, https://<host>/s/<token>
// opens the app if installed (universal links / Android App Links). The host must also serve
// apple-app-site-association and assetlinks.json (see README).
const signingDomain = process.env.SIGNFLOW_SIGNING_DOMAIN?.trim();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SignFlow',
  slug: 'signflow',
  version: '0.1.0',
  scheme: 'signflow',
  // Portrait everywhere (locked at launch and in src/hooks/useOrientation.ts); the signature pad also
  // allows landscape on phones (SPEC §5.7), so the native config must permit every orientation.
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
    usesAppleSignIn: true,
    ...(signingDomain ? { associatedDomains: [`applinks:${signingDomain}`] } : {}),
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#EAF0FD',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(signingDomain
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [{ scheme: 'https', host: signingDomain, pathPrefix: '/s/' }],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-web-browser',
    'expo-font',
    ['expo-screen-orientation', { initialOrientation: 'PORTRAIT_UP' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'SignFlow uses your photos to turn them into PDFs and to set your profile photo.',
        // Same string as the scanner: `false` here would strip the scanner's camera permission.
        cameraPermission: 'SignFlow uses the camera to scan paper documents.',
        microphonePermission: false,
      },
    ],
    [
      'react-native-document-scanner-plugin',
      { cameraPermission: 'SignFlow uses the camera to scan paper documents.' },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#FFFFFF',
        dark: { backgroundColor: '#0E1013' },
      },
    ],
    // The Google plugin requires a valid iOS URL scheme; only add it once configured (see README).
    ...(googleIosUrlScheme
      ? [
          ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [
            string,
            object,
          ],
        ]
      : []),
  ],
  experiments: {
    typedRoutes: true,
  },
});
