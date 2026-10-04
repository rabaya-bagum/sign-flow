import type { EmailMessage } from './provider.ts';

/** Plain, accessible HTML with a text alternative; SignFlow brand only (SPEC §13). */

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title></head>
<body style="margin:0;background:#F7F8FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F2328">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 20px;font-weight:700;font-size:18px;color:#2B59D9">SignFlow</p>
${bodyHtml}
</td></tr></table>
<p style="font-size:12px;color:#5B6270;margin:16px 0 0">Sent by SignFlow on behalf of the sender. If you weren't expecting this, you can ignore it.</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escape(href)}" style="display:inline-block;background:#2B59D9;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${escape(label)}</a></p>`;
}

export interface SignatureRequestEmail {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  documentTitle: string;
  subject: string | null;
  message: string | null;
  link: string;
  expiresAt: string;
  role: 'signer' | 'approver' | 'viewer';
}

const ACTION = {
  signer: { verb: 'sign', button: 'Review and sign' },
  approver: { verb: 'approve', button: 'Review and approve' },
  viewer: { verb: 'view', button: 'View document' },
} as const;

export function signatureRequestEmail(input: SignatureRequestEmail): EmailMessage {
  const action = ACTION[input.role];
  const subject =
    input.subject?.trim() || `${input.senderName} sent you "${input.documentTitle}" to ${action.verb}`;
  const expires = new Date(input.expiresAt).toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, '');
  const message = input.message?.trim();
  const html = layout(
    subject,
    `<h1 style="font-size:20px;margin:0 0 12px">${escape(input.senderName)} sent you a document to ${action.verb}</h1>
<p style="margin:0 0 8px"><strong>${escape(input.documentTitle)}</strong></p>
${message ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#F7F8FA;border-left:3px solid #2B59D9;white-space:pre-wrap">${escape(message)}</blockquote>` : ''}
${button(input.link, action.button)}
<p style="font-size:14px;color:#5B6270;margin:0">This link is personal to ${escape(input.recipientEmail)}. Don't forward it. It expires on ${escape(expires)}.</p>`,
  );
  const text = [
    `${input.senderName} sent you a document to ${action.verb}: ${input.documentTitle}`,
    message ? `\nMessage from ${input.senderName}:\n${message}\n` : '',
    `${action.button}: ${input.link}`,
    `\nThis link is personal to ${input.recipientEmail}. Don't forward it. It expires on ${expires}.`,
  ].join('\n');
  return { to: { email: input.recipientEmail, name: input.recipientName }, subject, html, text };
}

export interface CompletedEmail {
  recipientName: string;
  recipientEmail: string;
  documentTitle: string;
  senderName: string;
  /** Where to open or download the completed document (app page or a personal download link). */
  link: string;
  /** Whether the PDFs are attached (they are left out when too large for email). */
  attached: boolean;
}

export function completedEmail(input: CompletedEmail): EmailMessage {
  const subject = `Completed: ${input.documentTitle}`;
  const files = input.attached
    ? 'The signed document and its certificate of completion are attached.'
    : 'The files are too large to attach. Use the button to download them.';
  const html = layout(
    subject,
    `<h1 style="font-size:20px;margin:0 0 12px">Everyone has signed</h1>
<p style="margin:0 0 8px"><strong>${escape(input.documentTitle)}</strong>, sent by ${escape(input.senderName)}, is complete.</p>
<p style="margin:0 0 8px">${escape(files)}</p>
${button(input.link, 'Download the signed copy')}
<p style="font-size:14px;color:#5B6270;margin:0">The certificate lists who signed, when, and the document's fingerprints (SHA-256), so you can check that the file hasn't changed.</p>`,
  );
  const text = [
    `Completed: ${input.documentTitle} (sent by ${input.senderName})`,
    files,
    `Download the signed copy: ${input.link}`,
  ].join('\n\n');
  return { to: { email: input.recipientEmail, name: input.recipientName }, subject, html, text };
}

export interface DeclinedEmail {
  recipientName: string;
  recipientEmail: string;
  documentTitle: string;
  declinedBy: string;
  reason: string;
}

export function declinedEmail(input: DeclinedEmail): EmailMessage {
  const subject = `Declined: ${input.documentTitle}`;
  const html = layout(
    subject,
    `<h1 style="font-size:20px;margin:0 0 12px">${escape(input.declinedBy)} declined to sign</h1>
<p style="margin:0 0 8px"><strong>${escape(input.documentTitle)}</strong> will not be completed. No further action is needed.</p>
<blockquote style="margin:16px 0;padding:12px 16px;background:#F7F8FA;border-left:3px solid #C2410C;white-space:pre-wrap">${escape(input.reason)}</blockquote>`,
  );
  const text = [
    `${input.declinedBy} declined to sign "${input.documentTitle}". It will not be completed.`,
    `Reason:\n${input.reason}`,
  ].join('\n\n');
  return { to: { email: input.recipientEmail, name: input.recipientName }, subject, html, text };
}

export interface OtpEmail {
  recipientName: string;
  recipientEmail: string;
  documentTitle: string;
  code: string;
}

export function otpEmail(input: OtpEmail): EmailMessage {
  const subject = `Your SignFlow code: ${input.code}`;
  const html = layout(
    subject,
    `<h1 style="font-size:20px;margin:0 0 12px">Your code</h1>
<p style="margin:0 0 8px">Enter this code to open <strong>${escape(input.documentTitle)}</strong>:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${escape(input.code)}</p>
<p style="font-size:14px;color:#5B6270;margin:0">It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
  );
  const text = `Your SignFlow code for "${input.documentTitle}" is ${input.code}. It expires in 10 minutes.`;
  return { to: { email: input.recipientEmail, name: input.recipientName }, subject, html, text };
}
