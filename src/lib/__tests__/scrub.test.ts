import { scrubEvent, scrubString, scrubValue } from '../scrub';

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJlLXZhbHVl';

it('removes emails, tokens, links, phone numbers and inline images', () => {
  const input = [
    'failed for ann@example.com',
    `Authorization: Bearer ${jwt}`,
    'https://sign.example.com/s/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde',
    'https://x.supabase.co/storage/v1/object/sign/documents/a.pdf?token=abc.def&download=1',
    'phone +1 555 010 0199',
    'data:image/png;base64,iVBORw0KGgo=',
  ].join(' | ');
  const out = scrubString(input);
  expect(out).not.toMatch(/ann@example\.com|eyJ|AbCdEf|abc\.def|555 010|iVBOR/);
  expect(out).toContain('[email]');
  expect(out).toContain('/s/[token]');
  expect(out).toContain('?token=[redacted]&download=1');
  expect(out).toContain('[data-url]');
});

it('drops sensitive keys anywhere in nested data', () => {
  expect(scrubValue({ a: { password: 'x', list: [{ email: 'b@c.de', ok: 'fine' }] } })).toEqual({
    a: { password: '[redacted]', list: [{ email: '[redacted]', ok: 'fine' }] },
  });
});

it('keeps only the user id and request url/method on events', () => {
  const event = scrubEvent({
    message: 'Upload failed for ann@example.com',
    user: { id: 'u1', email: 'ann@example.com', ip_address: '1.2.3.4' } as { id: string },
    request: {
      url: 'https://app/s/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde',
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      data: '{"otp":"123456"}',
    } as { url: string; method: string },
    breadcrumbs: [{ message: `GET /rest?apikey=${jwt}` }],
  });
  expect(event.user).toEqual({ id: 'u1' });
  expect(event.request).toEqual({ url: 'https://app/s/[token]', method: 'POST' });
  expect(event.message).toBe('Upload failed for [email]');
  expect(JSON.stringify(event)).not.toMatch(/eyJ|123456|1\.2\.3\.4/);
});
