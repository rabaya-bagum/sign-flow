import { fieldSchema, isSignatureField, type Field } from './fields.ts';

/**
 * Draft completeness rules for sending (SPEC §5.3, §6.1). Shared by the Review step (to show what is
 * missing) and send-document (which enforces them, and re-checks in SQL inside the transaction).
 */

export type RecipientRole = 'signer' | 'approver' | 'viewer' | 'cc';

export interface SendRecipient {
  id: string;
  name: string;
  email: string | null;
  role: RecipientRole;
  signingOrder: number;
}

export type SendIssue =
  | { code: 'NO_FILE' }
  | { code: 'NO_RECIPIENTS' }
  | { code: 'NO_SIGNER' }
  | { code: 'MISSING_EMAIL'; recipientId: string }
  | { code: 'INVALID_EMAIL'; recipientId: string }
  | { code: 'DUPLICATE_EMAIL'; recipientId: string }
  | { code: 'SIGNER_WITHOUT_SIGNATURE'; recipientId: string }
  | { code: 'FIELDS_FOR_NON_SIGNER'; recipientId: string }
  | { code: 'INVALID_FIELD'; fieldId: string };

export type SendIssueCode = SendIssue['code'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateForSend(input: {
  hasFile: boolean;
  recipients: SendRecipient[];
  fields: Field[];
}): SendIssue[] {
  const issues: SendIssue[] = [];
  const { recipients, fields } = input;
  if (!input.hasFile) issues.push({ code: 'NO_FILE' });
  if (recipients.length === 0) issues.push({ code: 'NO_RECIPIENTS' });
  else if (!recipients.some((r) => r.role === 'signer')) issues.push({ code: 'NO_SIGNER' });

  const seen = new Set<string>();
  for (const r of recipients) {
    const email = r.email?.trim().toLowerCase() ?? '';
    if (!email) issues.push({ code: 'MISSING_EMAIL', recipientId: r.id });
    else if (!EMAIL.test(email)) issues.push({ code: 'INVALID_EMAIL', recipientId: r.id });
    else if (seen.has(email)) issues.push({ code: 'DUPLICATE_EMAIL', recipientId: r.id });
    else seen.add(email);

    const own = fields.filter((f) => f.recipient_id === r.id);
    if (r.role === 'signer' && !own.some((f) => isSignatureField(f.type))) {
      issues.push({ code: 'SIGNER_WITHOUT_SIGNATURE', recipientId: r.id });
    }
    if (r.role !== 'signer' && own.length > 0)
      issues.push({ code: 'FIELDS_FOR_NON_SIGNER', recipientId: r.id });
  }

  for (const f of fields) {
    if (!fieldSchema.safeParse(f).success || !recipients.some((r) => r.id === f.recipient_id)) {
      issues.push({ code: 'INVALID_FIELD', fieldId: f.id });
    }
  }
  return issues;
}

/** The first group to act: the lowest signing order among signers, approvers and viewers (CCs wait). */
export function firstActiveOrder(recipients: SendRecipient[]): number | null {
  const orders = recipients.filter((r) => r.role !== 'cc').map((r) => r.signingOrder);
  return orders.length ? Math.min(...orders) : null;
}

export const DEFAULT_EXPIRY_DAYS = 30;
export const MAX_EXPIRY_DAYS = 365;
