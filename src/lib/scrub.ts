/**
 * Removes personal data and secrets from crash reports before they leave the device (SPEC §14:
 * "Confirm Sentry PII scrubbing"; no logging of tokens, OTPs or signature images). Pure, so it is
 * unit-tested without the SDK.
 */
const RULES: [RegExp, string][] = [
  // Images (signature PNGs, avatars) inlined as data URLs.
  [/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[data-url]'],
  // JWTs (access tokens), with or without "Bearer".
  [/(Bearer\s+)?eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt]'],
  [/Bearer\s+\S+/gi, 'Bearer [redacted]'],
  // Guest signing links: /s/<43-char token>.
  [/\/s\/[A-Za-z0-9_-]{20,}/g, '/s/[token]'],
  // Query-string secrets: signed storage URLs (token=), auth codes, OTPs, nonces.
  [/([?&#](?:token|code|access_token|refresh_token|otp|nonce|apikey|key)=)[^&#\s"']+/gi, '$1[redacted]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  // Phone numbers (profile phone): + and 8 or more digits, spaces or dashes allowed.
  [/\+\d[\d\s-]{7,}\d/g, '[phone]'],
];

export function scrubString(value: string): string {
  return RULES.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), value);
}

const DROP_KEYS =
  /^(authorization|cookie|password|token|access_token|refresh_token|otp|code|signature|image|email|phone)$/i;

/** Deep copy with every string scrubbed and sensitive keys dropped. */
export function scrubValue<T>(value: T, depth = 0): T {
  if (depth > 8) return '[depth]' as T;
  if (typeof value === 'string') return scrubString(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = DROP_KEYS.test(k) ? '[redacted]' : scrubValue(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

interface EventLike {
  user?: { id?: string | number };
  request?: { url?: string; method?: string };
}

/** Sentry beforeSend: keeps only the user id, drops request bodies/headers, scrubs everything else. */
export function scrubEvent<E extends EventLike>(event: E): E {
  const { user, request, ...rest } = event;
  const cleaned = scrubValue(rest) as E;
  if (user?.id !== undefined) cleaned.user = { id: user.id } as E['user'];
  if (request) cleaned.request = scrubValue({ url: request.url, method: request.method }) as E['request'];
  return cleaned;
}
