import type { SupabaseClient } from './deps.ts';
import { emailProvider } from './email/provider.ts';
import { signatureRequestEmail } from './email/templates.ts';
import { type Actor, logEventAs } from './events.ts';
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
 * Emails each newly activated recipient a personal signing link (SPEC §7, §13): a fresh token
 * (revoking older ones), the signature request email, and a RECIPIENT_NOTIFIED event. Used when a
 * document is sent and whenever the next signing group activates. Returns the recipients whose
 * email failed; the document state is never rolled back for an email (Remind re-sends, Phase 7).
 */
export async function notifyActivated(
  admin: SupabaseClient,
  who: Actor,
  doc: NotifyDocument,
  recipients: readonly ActivatedRecipient[],
): Promise<string[]> {
  const { data: owner } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', doc.owner_id)
    .maybeSingle();
  const senderName = owner?.full_name || owner?.email || 'Someone';
  const provider = emailProvider();
  const failed: string[] = [];
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
        }),
      );
      await logEventAs(admin, who, doc.id, 'RECIPIENT_NOTIFIED', `Signature request sent to ${r.name}`, {
        recipient_id: r.recipient_id,
        channel: 'email',
      });
    } catch (error) {
      console.error('notify failed', r.recipient_id, error instanceof Error ? error.message : error);
      failed.push(r.recipient_id);
    }
  }
  return failed;
}
