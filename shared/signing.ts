import { z } from 'zod';

import { DATE_FORMATS, fieldPropertiesSchemas, type Field } from './fields.ts';
import { EMAIL_PATTERN } from './send.ts';

/**
 * Signing rules shared by the signing UI (Phase 6) and submit-signing / guest-submit: what a value
 * looks like for each field type, what counts as complete, and the "next field" order (SPEC §5.5).
 * The server never trusts client completeness; it re-runs validateSubmission and the database
 * re-checks ownership and required fields.
 */

/** What the signer entered for one field. Signature/initials carry an image instead of a value. */
export interface FieldEntry {
  value?: string | null;
  /** Signature and initials: the image is attached (a key into the submission's assets). */
  hasImage?: boolean;
}
export type FieldEntries = Record<string, FieldEntry | undefined>;

export type SubmissionIssueCode = 'REQUIRED' | 'INVALID';
export interface SubmissionIssue {
  fieldId: string;
  code: SubmissionIssueCode;
}

export const MAX_VALUE_LENGTH = 500;

/** Fields in reading order: page, then top to bottom, then left to right. */
export function orderFields<T extends Pick<Field, 'page_number' | 'x' | 'y'>>(fields: readonly T[]): T[] {
  return [...fields].sort((a, b) => a.page_number - b.page_number || a.y - b.y || a.x - b.x);
}

export function radioGroup(field: Pick<Field, 'type' | 'properties'>): string | null {
  if (field.type !== 'radio') return null;
  const groupId = (field.properties as { groupId?: unknown }).groupId;
  return typeof groupId === 'string' ? groupId : null;
}

/**
 * Checks one value against its field's type and properties. Returns the normalized value (trimmed;
 * checkbox/radio as 'true'/'false') or an issue code. Empty values are fine here; `required` is
 * checked by validateSubmission. date_signed is always set by the server.
 */
export function normalizeValue(
  field: Field,
  raw: string | null | undefined,
): { value: string | null } | { issue: 'INVALID' } {
  const value = typeof raw === 'string' ? raw.trim() : null;
  if (value === null || value === '') {
    return field.type === 'checkbox' || field.type === 'radio' ? { value: 'false' } : { value: null };
  }
  if (value.length > MAX_VALUE_LENGTH) return { issue: 'INVALID' };
  switch (field.type) {
    case 'signature':
    case 'initials':
    case 'date_signed':
      return { value: null };
    case 'checkbox':
    case 'radio':
      return value === 'true' || value === 'false' ? { value } : { issue: 'INVALID' };
    case 'email':
      return EMAIL_PATTERN.test(value) ? { value } : { issue: 'INVALID' };
    case 'full_name':
      return { value };
    case 'dropdown': {
      const parsed = fieldPropertiesSchemas.dropdown.safeParse(field.properties);
      return parsed.success && parsed.data.options.includes(value) ? { value } : { issue: 'INVALID' };
    }
    case 'text': {
      const parsed = fieldPropertiesSchemas.text.safeParse(field.properties);
      if (!parsed.success) return { issue: 'INVALID' };
      const { maxLength, validation } = parsed.data;
      if (maxLength !== undefined && value.length > maxLength) return { issue: 'INVALID' };
      if (validation === 'email' && !EMAIL_PATTERN.test(value)) return { issue: 'INVALID' };
      if (validation === 'number' && !/^-?\d+([.,]\d+)?$/.test(value)) return { issue: 'INVALID' };
      if (typeof validation === 'object') {
        try {
          if (!new RegExp(`^(?:${validation.regex})$`).test(value)) return { issue: 'INVALID' };
        } catch {
          return { issue: 'INVALID' };
        }
      }
      return { value };
    }
  }
}

/** How a checked checkbox or chosen radio option shows while signing; null when not checked. */
export function choiceMark(type: 'checkbox' | 'radio', value: string | null | undefined): string | null {
  if (value !== 'true') return null;
  return type === 'radio' ? '●' : '✓';
}

/** True when this field counts as filled for the "required" rule. */
export function isFilled(field: Field, entry: FieldEntry | undefined): boolean {
  switch (field.type) {
    case 'signature':
    case 'initials':
      return Boolean(entry?.hasImage);
    case 'date_signed':
      return true; // stamped by the server at submission
    case 'checkbox':
    case 'radio':
      return entry?.value === 'true';
    default:
      return typeof entry?.value === 'string' && entry.value.trim() !== '';
  }
}

/** Required "items": each required field, except that a radio group counts once. */
function requiredItems(fields: readonly Field[]): Field[][] {
  const groups = new Map<string, Field[]>();
  const items: Field[][] = [];
  for (const field of orderFields(fields)) {
    if (!field.required || field.type === 'date_signed') continue;
    const group = radioGroup(field);
    if (group === null) {
      items.push([field]);
      continue;
    }
    const existing = groups.get(group);
    if (existing) existing.push(field);
    else {
      const members = [field];
      groups.set(group, members);
      items.push(members);
    }
  }
  return items;
}

/** Progress pill: "done of total required" (SPEC §5.5). */
export function requiredProgress(
  fields: readonly Field[],
  entries: FieldEntries,
): { done: number; total: number } {
  const items = requiredItems(fields);
  return {
    total: items.length,
    done: items.filter((members) => members.some((f) => isFilled(f, entries[f.id]))).length,
  };
}

/** The next required field still to fill, after `afterFieldId` in reading order (wrapping around). */
export function nextIncompleteField(
  fields: readonly Field[],
  entries: FieldEntries,
  afterFieldId?: string | null,
): Field | null {
  const pending = requiredItems(fields)
    .filter((members) => !members.some((f) => isFilled(f, entries[f.id])))
    .map((members) => members[0]!);
  if (pending.length === 0) return null;
  if (!afterFieldId) return pending[0]!;
  const ordered = orderFields(fields);
  const position = ordered.findIndex((f) => f.id === afterFieldId);
  const rank = new Map(ordered.map((f, i) => [f.id, i]));
  return pending.find((f) => (rank.get(f.id) ?? 0) > position) ?? pending[0]!;
}

/**
 * Validates a whole submission for one signer: every value is well-formed, required fields are
 * filled, and a radio group has at most one choice. Returns [] when it can be submitted.
 */
export function validateSubmission(fields: readonly Field[], entries: FieldEntries): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const own = new Set(fields.map((f) => f.id));
  for (const id of Object.keys(entries)) {
    if (!own.has(id)) issues.push({ fieldId: id, code: 'INVALID' });
  }
  for (const field of fields) {
    const entry = entries[field.id];
    if ('issue' in normalizeValue(field, entry?.value)) issues.push({ fieldId: field.id, code: 'INVALID' });
  }
  for (const members of requiredItems(fields)) {
    if (!members.some((f) => isFilled(f, entries[f.id]))) {
      issues.push({ fieldId: members[0]!.id, code: 'REQUIRED' });
    }
  }
  const chosen = new Map<string, number>();
  for (const field of fields) {
    const group = radioGroup(field);
    if (group !== null && entries[field.id]?.value === 'true')
      chosen.set(group, (chosen.get(group) ?? 0) + 1);
  }
  for (const field of fields) {
    const group = radioGroup(field);
    if (group !== null && (chosen.get(group) ?? 0) > 1 && entries[field.id]?.value === 'true') {
      issues.push({ fieldId: field.id, code: 'INVALID' });
    }
  }
  return issues;
}

/** Initial entries: text/dropdown defaults, checkbox default, and the signer's name and email. */
export function initialEntries(
  fields: readonly Field[],
  signer: { name: string; email: string | null },
): FieldEntries {
  const entries: FieldEntries = {};
  for (const field of fields) {
    const p = field.properties as Record<string, unknown>;
    switch (field.type) {
      case 'full_name':
        entries[field.id] = { value: signer.name };
        break;
      case 'email':
        entries[field.id] = { value: signer.email ?? '' };
        break;
      case 'text':
      case 'dropdown':
        if (typeof p.defaultValue === 'string' && p.defaultValue)
          entries[field.id] = { value: p.defaultValue };
        break;
      case 'checkbox':
        if (p.defaultChecked === true) entries[field.id] = { value: 'true' };
        break;
      default:
        break;
    }
  }
  return entries;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Validates an IANA time zone name (falls back to UTC). */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** The date a field shows, in the signer's time zone (SPEC §8 date_signed formats). */
export function formatDateSigned(
  date: Date,
  format: (typeof DATE_FORMATS)[number] = 'MMM d, yyyy',
  timeZone = 'UTC',
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (format) {
    case 'yyyy-MM-dd':
      return `${y}-${pad(m)}-${pad(d)}`;
    case 'dd/MM/yyyy':
      return `${pad(d)}/${pad(m)}/${y}`;
    default:
      return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
}

/** Wire format of a submission (submit-signing / guest-submit). */
export const submissionValueSchema = z.object({
  field_id: z.uuid(),
  value: z.string().max(MAX_VALUE_LENGTH).nullish(),
  /** Key into `assets` for signature/initials. */
  asset: z.string().min(1).max(64).nullish(),
});
/** Base64 PNGs keyed by a client-chosen id; the same image can fill several fields. */
export const submissionAssetsSchema = z
  .record(z.string().min(1).max(64), z.string().max(1_400_000))
  .refine((assets) => Object.keys(assets).length <= 10, 'Too many images');

export const DECLINE_REASON_MAX = 1000;

/** What a signing link or the in-app "Sign" screen shows (signing-session / guest-open). */
export type SigningState =
  | 'otp_required'
  | 'sign'
  | 'approve'
  | 'view'
  | 'not_your_turn'
  | 'done'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'expired';

/** Another recipient's filled field, shown as its value (SPEC §5.5). */
export interface FilledField {
  id: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: Field['type'];
  /** Text to show (dates, names, text, '✓' for a checked box). */
  text: string | null;
  /** Signature/initials image as a data: URL. */
  image: string | null;
}

export interface SigningSession {
  state: SigningState;
  document: {
    id: string;
    title: string;
    page_count: number | null;
    status: string;
    allow_decline: boolean;
    expires_at: string | null;
    sender: { name: string; email: string | null };
  };
  recipient: {
    id: string;
    name: string;
    email: string | null;
    role: 'signer' | 'approver' | 'viewer' | 'cc';
    status: string;
  };
  /** Signers and approvers must accept the ESIGN disclosure first (SPEC §17.1). */
  consent_required: boolean;
  /** Content, for 'sign', 'approve' and 'view' only. */
  pdf_url: string | null;
  fields: Field[];
  filled: FilledField[];
  /** 'not_your_turn': who the document is waiting for. */
  waiting_for: string[];
  /** 'completed': whether this link can download the signed copy. */
  can_download: boolean;
  /** 'otp_required': where the code goes, masked (a•••@example.com). */
  masked_email: string | null;
}

export interface SubmitSigningResult {
  /** 'waiting' for others in the group, 'advanced' to the next group, or 'completed'. */
  outcome: 'waiting' | 'advanced' | 'completed' | 'finalizing';
  /** Guests: a link token that downloads the signed copy (when completed). */
  download_token: string | null;
}

/** Masks an email for display before the code check: ada@example.com → a••@example.com. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`;
}
