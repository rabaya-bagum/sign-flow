import * as Linking from 'expo-linking';

export type AuthLinkFlow = 'signup' | 'recovery';

/**
 * Redirect target for Supabase email links. Resolves to signflow://auth/callback?flow=… in dev/prod
 * builds and http://localhost:8081/auth/callback?flow=… on web. Must match
 * auth.additional_redirect_urls in supabase/config.toml (and the hosted project's allow list).
 */
export function authRedirectUrl(flow: AuthLinkFlow): string {
  return Linking.createURL('auth/callback', { queryParams: { flow } });
}
