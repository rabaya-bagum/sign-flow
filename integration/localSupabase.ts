import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { execSync } from 'child_process';

import type { Database } from '@/types/database';

interface LocalStatus {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  MAILPIT_URL: string;
}

export function localStatus(): LocalStatus {
  const raw = execSync('npx supabase status -o json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(raw) as LocalStatus;
}

function memoryStorage(): SupportedStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** A client that behaves like the app: PKCE flow, isolated session storage. */
export function appClient(status: LocalStatus) {
  return createClient<Database>(status.API_URL, status.ANON_KEY, {
    auth: {
      flowType: 'pkce',
      storage: memoryStorage(),
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function adminClient(status: LocalStatus) {
  return createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Waits for the newest email to `to` in Mailpit and returns the first auth verify link in it. */
export async function waitForAuthLink(
  status: LocalStatus,
  to: string,
  type: 'signup' | 'recovery',
): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${status.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    for (const m of messages ?? []) {
      const msg = (await (await fetch(`${status.MAILPIT_URL}/api/v1/message/${m.ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const body = (msg.HTML || msg.Text).replace(/&amp;/g, '&');
      const link = body
        .match(/https?:\/\/[^"'\s<>]+\/auth\/v1\/verify\?[^"'\s<>]+/g)
        ?.find((l) => l.includes(`type=${type}`));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No ${type} email for ${to}`);
}

/** Follows the verify link the way a phone would and returns the deep link it redirects to. */
export async function followVerifyLink(link: string): Promise<URL> {
  const res = await fetch(link, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (!location) throw new Error(`Verify link did not redirect (HTTP ${res.status})`);
  return new URL(location);
}
