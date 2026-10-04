/**
 * Transactional email (SPEC §2, §13) behind one interface. Production: Resend (RESEND_API_KEY).
 * Local development and tests: Mailpit's HTTP API (MAILPIT_API_URL), which the local Supabase stack
 * runs, so messages can be read at http://127.0.0.1:54324. Without either, sending fails loudly.
 */
export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  /** Files sent with the message (the completed PDF and certificate, SPEC §13). */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** Base64-encoded file content. */
  content: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

const env = (name: string) => Deno.env.get(name)?.trim() || undefined;

function from(): { email: string; name: string } {
  return { email: env('EMAIL_FROM') ?? 'noreply@signflow.test', name: env('EMAIL_FROM_NAME') ?? 'SignFlow' };
}

class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  constructor(private readonly apiKey: string) {}
  async send(message: EmailMessage) {
    const sender = from();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${sender.name} <${sender.email}>`,
        to: [message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                content_type: a.contentType,
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

class MailpitProvider implements EmailProvider {
  readonly name = 'mailpit';
  constructor(private readonly baseUrl: string) {}
  async send(message: EmailMessage) {
    const sender = from();
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: { Email: sender.email, Name: sender.name },
        To: [{ Email: message.to.email, Name: message.to.name ?? '' }],
        Subject: message.subject,
        HTML: message.html,
        Text: message.text,
        ...(message.attachments?.length
          ? {
              Attachments: message.attachments.map((a) => ({
                Filename: a.filename,
                ContentType: a.contentType,
                Content: a.content,
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Mailpit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export function emailProvider(): EmailProvider {
  const resend = env('RESEND_API_KEY');
  if (resend) return new ResendProvider(resend);
  const mailpit = env('MAILPIT_API_URL');
  if (mailpit) return new MailpitProvider(mailpit);
  throw new Error('Email is not configured: set RESEND_API_KEY (or MAILPIT_API_URL locally)');
}
