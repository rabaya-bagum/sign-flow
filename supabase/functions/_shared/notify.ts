import type { SupabaseClient } from './deps.ts';
import { emailProvider } from './email/provider.ts';
import { signatureRequestEmail } from './email/templates.ts';
import { type Actor, logEventAs } from './events.ts';
import { deliver, type Notice } from './notifications.ts';
import { issueToken, signingLink } from './tokens.ts';

export interface ActivatedRecipient {
  recipient_id: string;
  name: string;
  email: string;
  user_id: string | null;
  role: 'signer' | 'approver' | 'viewer' | 'cc';
}

export interface NotifyDocument {
  id: string;
  title: string;
  owner_id: string;
  email_subject: string | null;
  email_message: string | null;
  expires_at: string;
}

/**
 * Emails each recipient a personal signing link (SPEC §7, §11, §13): a fresh token (revoking older
 * ones), the request, reminder or "expires tomorrow" email, an audit event, and for people with an
 * account an in-app notice and push. Used at send, when the next signing group activates, and by
 * Remind and cron-tick. Returns the recipients whose email failed; the document state is never
 * rolled back for an email (Remind re-sends).
 */
export async function notifyActivated(
  admin: SupabaseClient,
  who: Actor,
  doc: NotifyDocument,
  recipients: readonly ActivatedRecipient[],
  kind: 'request' | 'reminder' | 'expiring' = 'request',
): Promise<string[]> {
  const { data: owner } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', doc.owner_id)
    .maybeSingle();
  const senderName = owner?.full_name || owner?.email || 'Someone';
  const provider = emailProvider();
  const failed: string[] = [];
  const notices: Notice[] = [];
  for (const r of recipients) {
    if (r.role === 'cc') continue;
    try {
      const token = await issueToken(admin, r.recipient_id, doc.expires_at);
      await provider.send(
        signatureRequestEmail({
          recipientName: r.name,
          recipientEmail: r.email,
          senderName,
          documentTitle: doc.title,
          subject: doc.email_subject,
          message: doc.email_message,
          link: signingLink(token),
          expiresAt: doc.expires_at,
          role: r.role,
          kind,
        }),
      );
      if (kind === 'request') {
        await logEventAs(admin, who, doc.id, 'RECIPIENT_NOTIFIED', `Signature request sent to ${r.name}`, {
          recipient_id: r.recipient_id,
          channel: 'email',
        });
      } else {
        await logEventAs(admin, who, doc.id, 'REMINDER_SENT', `Reminder sent to ${r.name}`, {
          recipient_id: r.recipient_id,
          kind,
          automatic: who.userId === null,
        });
      }
      // People with an account also get it in the app and as a push (the email is always sent).
      if (r.user_id && r.role !== 'viewer') {
        const verb = r.role === 'approver' ? 'approve' : 'sign';
        notices.push({
          userId: r.user_id,
          documentId: doc.id,
          type: kind === 'request' ? 'request' : kind,
          title:
            kind === 'request'
              ? `${senderName} sent you a document to ${verb}`
              : kind === 'reminder'
                ? `Reminder: please ${verb}`
                : 'Expires tomorrow',
          body: doc.title,
        });
      }
    } catch (error) {
      console.error('notify failed', r.recipient_id, error instanceof Error ? error.message : error);
      failed.push(r.recipient_id);
    }
  }
  await deliver(admin, notices);
  return failed;
}
