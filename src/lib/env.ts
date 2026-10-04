// Public runtime configuration. EXPO_PUBLIC_* variables are inlined at build time, so they must be
// referenced statically (no dynamic process.env[key] access). Never put secrets here.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
/** Where "Get the SignFlow app" points on the guest signing page (store page); hidden when empty. */
const appDownloadUrl = process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL ?? '';
/** Sentry DSN (public by design). Crash reporting is off when empty. */
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  googleWebClientId,
  googleIosClientId,
  appDownloadUrl,
  sentryDsn,
  appEnvironment,
  isSupabaseConfigured: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
  isGoogleConfigured: googleWebClientId.length > 0,
} as const;
