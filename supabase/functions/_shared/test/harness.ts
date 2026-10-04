/**
 * Test harness for Edge Function logic against the local Supabase stack (`npm run db:start`).
 * Reads URLs/keys from `supabase status`, creates throwaway users, and builds real RequestContexts.
 */
import { requestContext, type RequestContext } from '../context.ts';
import { createClient, type SupabaseClient } from '../deps.ts';

interface Status {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

let cached: Status | undefined;

export function localStatus(): Status {
  if (cached) return cached;
  const out = new Deno.Command('npx', {
    args: ['supabase', 'status', '-o', 'json'],
    stderr: 'null',
  }).outputSync();
  cached = JSON.parse(new TextDecoder().decode(out.stdout)) as Status;
  Deno.env.set('SUPABASE_URL', cached.API_URL);
  Deno.env.set('SUPABASE_ANON_KEY', cached.ANON_KEY);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', cached.SERVICE_ROLE_KEY);
  return cached;
}

export function admin(): SupabaseClient {
  const s = localStatus();
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  client: SupabaseClient;
  ctx: RequestContext;
}

export const TEST_IP = '203.0.113.7';
export const TEST_UA = 'SignFlowTests/1.0';

export async function contextFor(token: string): Promise<RequestContext> {
  return requestContext(
    new Request('http://localhost/', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-forwarded-for': `${TEST_IP}, 10.0.0.1`,
        'user-agent': TEST_UA,
      },
    }),
  );
}

export async function signIn(email: string, password: string): Promise<TestUser> {
  const s = localStatus();
  const client = createClient(s.API_URL, s.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error('no session');
  return {
    id: data.user.id,
    email,
    token: data.session.access_token,
    client,
    ctx: await contextFor(data.session.access_token),
  };
}

export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}.${crypto.randomUUID().slice(0, 8)}@functions.test`;
  const password = 'function-test-pass1';
  const { error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error) throw error;
  return signIn(email, password);
}

/** Inserts a draft as the user (exercises RLS and the DOCUMENT_CREATED trigger). */
export async function createDraft(user: TestUser, title = 'Test draft'): Promise<string> {
  const { data, error } = await user.client
    .from('documents')
    .insert({ owner_id: user.id, title })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function uploadOriginal(user: TestUser, documentId: string, bytes: Uint8Array) {
  return user.client.storage.from('documents').upload(`${user.id}/${documentId}/original.pdf`, bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
}

export async function storageHas(bucket: string, path: string): Promise<boolean> {
  const { data } = await admin().storage.from(bucket).download(path);
  return Boolean(data);
}

export async function events(documentId: string) {
  const { data, error } = await admin()
    .from('document_events')
    .select('type, actor_user_id, ip, user_agent, metadata')
    .eq('document_id', documentId)
    .order('id');
  if (error) throw error;
  return data;
}

/** RFC 6238 code for a base32 TOTP secret, as an authenticator app would show it. */
export async function totp(secret: string, at = Date.now()): Promise<string> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  }
  const key = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < key.length; i++) key[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(Math.floor(at / 30000)));
  const hmacKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, counter));
  const offset = mac[mac.length - 1]! & 0xf;
  const code = (new DataView(mac.buffer).getUint32(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}
