import { fieldSchema, type Field } from '../../../shared/fields.ts';
import { ESIGN_DISCLOSURE_VERSION } from '../../../shared/legal.ts';
import { SIGNED_URL_TTL_SECONDS } from '../../../shared/limits.ts';
import {
  type FieldEntries,
  type FilledField,
  formatDateSigned,
  maskEmail,
  normalizeValue,
  type SigningSession,
  type SigningState,
  type SubmitSigningResult,
  validateSubmission,
} from '../../../shared/signing.ts';
import type { RequestContext } from './context.ts';
import { base64ToBytes, bytesToBase64 } from './crypto.ts';
import type { SupabaseClient } from './deps.ts';
import { emailProvider } from './email/provider.ts';
import { declinedEmail } from './email/templates.ts';
import { type Actor, actorFor, logEventAs } from './events.ts';
import { finalizeDocument } from './finalize.ts';
import { HttpError } from './http.ts';
import { type ActivatedRecipient, notifyActivated } from './notify.ts';
import { enforceRateLimit } from './rateLimit.ts';
import { hashToken, issueDownloadToken } from './tokens.ts';

/**
 * Signing core shared by the in-app functions (signing-session, esign-consent, submit-signing,
 * decline) and the guest functions (guest-open, guest-consent, guest-submit, guest-decline,
 * guest-download). Callers resolve a Signer first (session + document, or a link token); every
 * operation then re-checks state, and the database functions re-check again under a row lock.
 */

export interface SigningRecipient {
  id: string;
  document_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  role: 'signer' | 'approver' | 'viewer' | 'cc';
  signing_order: number;
  status: string;
}

export interface SigningDocument {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  page_count: number | null;
  original_path: string | null;
  completed_path: string | null;
  certificate_path: string | null;
  current_signing_order: number | null;
  allow_decline: boolean;
  require_email_otp: boolean;
  expires_at: string | null;
  email_subject: string | null;
  email_message: string | null;
  deleted_at: string | null;
}

export interface SignerToken {
  id: string;
  purpose: 'sign' | 'download';
  revoked: boolean;
  otp_verified_at: string | null;
}

export interface Signer {
  mode: 'account' | 'guest';
  recipient: SigningRecipient;
  document: SigningDocument;
  /** Guests only. */
  token: SignerToken | null;
  actor: Actor;
}

const RECIPIENT_COLUMNS = 'id, document_id, user_id, name, email, role, signing_order, status';
const DOCUMENT_COLUMNS =
  'id, owner_id, title, status, page_count, original_path, completed_path, certificate_path, current_signing_order, allow_decline, require_email_otp, expires_at, email_subject, email_message, deleted_at';
const TERMINAL = new Set(['completed', 'declined', 'voided', 'expired']);

async function loadDocument(admin: SupabaseClient, id: string): Promise<SigningDocument | null> {
  const { data, error } = await admin.from('documents').select(DOCUMENT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as SigningDocument | null;
}

/** The signed-in caller's recipient row on a document (in-app signing). */
export async function resolveAccountSigner(ctx: RequestContext, documentId: string): Promise<Signer> {
  const { data, error } = await ctx.admin
    .from('document_recipients')
    .select(RECIPIENT_COLUMNS)
    .eq('document_id', documentId)
    .eq('user_id', ctx.userId)
    .order('signing_order')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const doc = data ? await loadDocument(ctx.admin, documentId) : null;
  if (!data || !doc || doc.deleted_at || doc.status === 'draft') {
    throw new HttpError('NOT_FOUND', 404, 'Document not found');
  }
  const recipient = data as SigningRecipient;
  return { mode: 'account', recipient, document: doc, token: null, actor: await actorFor(ctx, recipient.id) };
}

export interface GuestRequest {
  admin: SupabaseClient;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Validates a signing link (SPEC §7) and rate-limits it per token and per IP. A link revoked
 * because the document ended still resolves, so the page can say "already completed" instead of
 * "invalid"; a link replaced by a newer one does not.
 */
export async function resolveGuestSigner(req: GuestRequest, rawToken: string): Promise<Signer> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw new HttpError('LINK_INVALID', 404, 'Invalid link');
  await enforceRateLimit(req.admin, `guest-ip:${req.ip ?? 'unknown'}`, 300, 300);
  const { data: token, error } = await req.admin
    .from('recipient_access_tokens')
    .select('id, recipient_id, purpose, expires_at, revoked_at, otp_verified_at')
    .eq('token_hash', await hashToken(rawToken))
    .maybeSingle();
  if (error) throw error;
  if (!token) throw new HttpError('LINK_INVALID', 404, 'Invalid link');
  await enforceRateLimit(req.admin, `guest:${token.id}`, 120, 300);

  const { data: recipient, error: rError } = await req.admin
    .from('document_recipients')
    .select(RECIPIENT_COLUMNS)
    .eq('id', token.recipient_id)
    .single();
  if (rError) throw rError;
  const doc = await loadDocument(req.admin, recipient.document_id);
  if (!doc || doc.deleted_at) throw new HttpError('LINK_INVALID', 404, 'Invalid link');
  if (token.revoked_at && !TERMINAL.has(doc.status))
    throw new HttpError('LINK_INVALID', 404, 'This link was replaced');
  if (Date.parse(token.expires_at) <= Date.now() && doc.status !== 'expired') {
    throw new HttpError('LINK_EXPIRED', 410, 'This link has expired');
  }
  await req.admin
    .from('recipient_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', token.id);
  const r = recipient as SigningRecipient;
  return {
    mode: 'guest',
    recipient: r,
    document: doc,
    token: {
      id: token.id,
      purpose: token.purpose as 'sign' | 'download',
      revoked: Boolean(token.revoked_at),
      otp_verified_at: token.otp_verified_at,
    },
    actor: {
      userId: null,
      recipientId: r.id,
      name: r.name,
      email: r.email,
      ip: req.ip,
      userAgent: req.userAgent,
    },
  };
}

function needsOtp(signer: Signer): boolean {
  return (
    signer.mode === 'guest' &&
    signer.document.require_email_otp &&
    signer.token?.purpose === 'sign' &&
    !signer.token.otp_verified_at
  );
}

/** What this signer may do right now (SPEC §7 error states, §6.1 roles). */
export function signingState(signer: Signer): SigningState {
  const { document: doc, recipient: r } = signer;
  if (doc.status === 'completed') return 'completed';
  if (doc.status === 'declined' || doc.status === 'voided' || doc.status === 'expired') return doc.status;
  if (doc.expires_at && Date.parse(doc.expires_at) <= Date.now()) return 'expired';
  if (signer.token?.purpose === 'download') return 'done';
  if (r.status === 'declined') return 'declined';
  if (r.status === 'signed' || r.status === 'approved') return 'done';
  if (r.role === 'cc' || r.status === 'pending') return 'not_your_turn';
  if (needsOtp(signer)) return 'otp_required';
  if (r.role === 'viewer') return 'view';
  return r.role === 'approver' ? 'approve' : 'sign';
}

function requireState(signer: Signer, allowed: SigningState[]) {
  const state = signingState(signer);
  if (allowed.includes(state)) return state;
  if (state === 'otp_required') throw new HttpError('OTP_REQUIRED', 403, 'Enter the emailed code first');
  if (state === 'not_your_turn') throw new HttpError('NOT_YOUR_TURN', 409, "It's not your turn yet");
  throw new HttpError('INVALID_STATE', 409, 'This document is no longer waiting for you');
}

function toField(row: Record<string, unknown>): Field {
  return fieldSchema.parse({
    ...row,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
  });
}

async function loadOwnFields(admin: SupabaseClient, recipientId: string): Promise<Field[]> {
  const { data, error } = await admin
    .from('document_fields')
    .select('id, recipient_id, page_number, type, x, y, width, height, required, properties')
    .eq('recipient_id', recipientId);
  if (error) throw error;
  return (data ?? []).map(toField);
}

async function hasConsent(admin: SupabaseClient, recipientId: string): Promise<boolean> {
  const { count, error } = await admin
    .from('esign_consents')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('disclosure_version', ESIGN_DISCLOSURE_VERSION);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Logs DOCUMENT_VIEWED at most once per person per document per 30 minutes. */
async function logView(admin: SupabaseClient, signer: Signer) {
  const who = signer.actor;
  if (who.userId) {
    const { error } = await admin.rpc('log_document_view', {
      p_document_id: signer.document.id,
      p_actor_user_id: who.userId,
      p_actor_name: who.name,
      p_actor_email: who.email,
      p_ip: who.ip,
      p_user_agent: who.userAgent,
    });
    if (error) throw error;
    return;
  }
  const { count } = await admin
    .from('document_events')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', signer.document.id)
    .eq('actor_recipient_id', signer.recipient.id)
    .eq('type', 'DOCUMENT_VIEWED')
    .gt('created_at', new Date(Date.now() - 30 * 60_000).toISOString());
  if ((count ?? 0) === 0) {
    await logEventAs(admin, who, signer.document.id, 'DOCUMENT_VIEWED', 'Document viewed', { via: 'link' });
  }
}

/** Other people's filled fields, as text or a data: URL image (SPEC §5.5). */
async function loadFilled(admin: SupabaseClient, signer: Signer): Promise<FilledField[]> {
  const { data, error } = await admin
    .from('field_values')
    .select('field_id, recipient_id, value, asset_path')
    .eq('document_id', signer.document.id)
    .neq('recipient_id', signer.recipient.id);
  if (error) throw error;
  if (!data?.length) return [];
  const { data: fields, error: fError } = await admin
    .from('document_fields')
    .select('id, page_number, type, x, y, width, height')
    .in(
      'id',
      data.map((v) => v.field_id),
    );
  if (fError) throw fError;
  const byId = new Map((fields ?? []).map((f) => [f.id, f]));
  const out: FilledField[] = [];
  for (const v of data) {
    const f = byId.get(v.field_id);
    if (!f) continue;
    let image: string | null = null;
    if (v.asset_path) {
      const { data: blob } = await admin.storage.from('documents').download(v.asset_path);
      if (blob) image = `data:image/png;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
    }
    const text =
      f.type === 'checkbox' || f.type === 'radio'
        ? v.value === 'true'
          ? f.type === 'radio'
            ? '●'
            : '✓'
          : null
        : v.value;
    out.push({
      id: f.id,
      page_number: f.page_number,
      x: Number(f.x),
      y: Number(f.y),
      width: Number(f.width),
      height: Number(f.height),
      type: f.type,
      text,
      image,
    });
  }
  return out;
}

/** Builds what the signing screen shows; marks the recipient viewed on first open. */
export async function openSession(admin: SupabaseClient, signer: Signer): Promise<SigningSession> {
  const { document: doc, recipient: r } = signer;
  const state = signingState(signer);
  const { data: owner } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', doc.owner_id)
    .maybeSingle();
  const session: SigningSession = {
    state,
    document: {
      id: doc.id,
      title: doc.title,
      page_count: doc.page_count,
      status: doc.status,
      allow_decline: doc.allow_decline,
      expires_at: doc.expires_at,
      sender: { name: owner?.full_name || owner?.email || 'The sender', email: owner?.email ?? null },
    },
    recipient: { id: r.id, name: r.name, email: r.email, role: r.role, status: r.status },
    consent_required: false,
    pdf_url: null,
    pages: [],
    fields: [],
    filled: [],
    waiting_for: [],
    can_download:
      state === 'completed' &&
      Boolean(doc.completed_path) &&
      (signer.mode === 'account' || signer.token?.purpose === 'download'),
    masked_email: state === 'otp_required' && r.email ? maskEmail(r.email) : null,
  };

  if (state === 'not_your_turn' && r.role !== 'cc') {
    const { data: waiting } = await admin
      .from('document_recipients')
      .select('name')
      .eq('document_id', doc.id)
      .eq('signing_order', doc.current_signing_order ?? 0)
      .in('role', ['signer', 'approver'])
      .in('status', ['sent', 'viewed']);
    session.waiting_for = (waiting ?? []).map((w) => w.name);
  }
  if (state !== 'sign' && state !== 'approve' && state !== 'view') return session;

  if (await admin.rpc('mark_recipient_viewed', { p_recipient_id: r.id }).then((res) => res.data === true)) {
    session.recipient.status = 'viewed';
  }
  await logView(admin, signer);
  const [{ data: pages, error: pError }, signed] = await Promise.all([
    admin
      .from('document_pages')
      .select('page_number, width_pt, height_pt, rotation')
      .eq('document_id', doc.id)
      .order('page_number'),
    admin.storage.from('documents').createSignedUrl(doc.original_path ?? '', SIGNED_URL_TTL_SECONDS),
  ]);
  if (pError) throw pError;
  if (signed.error || !signed.data) throw signed.error ?? new Error('Could not sign URL');
  session.pdf_url = signed.data.signedUrl;
  session.pages = (pages ?? []).map((p) => ({
    page_number: p.page_number,
    width_pt: Number(p.width_pt),
    height_pt: Number(p.height_pt),
    rotation: p.rotation,
  }));
  session.filled = await loadFilled(admin, signer);
  if (state === 'sign') session.fields = await loadOwnFields(admin, r.id);
  if (state !== 'view') session.consent_required = !(await hasConsent(admin, r.id));
  return session;
}

/** Records ESIGN consent (SPEC §17.1) before the signer's first interaction. Idempotent. */
export async function acceptConsent(admin: SupabaseClient, signer: Signer, version: string) {
  requireState(signer, ['sign', 'approve']);
  if (version !== ESIGN_DISCLOSURE_VERSION) {
    throw new HttpError('INVALID_STATE', 409, 'The disclosure has changed. Reload and read it again.');
  }
  if (await hasConsent(admin, signer.recipient.id)) return;
  const { error } = await admin.from('esign_consents').insert({
    recipient_id: signer.recipient.id,
    user_id: signer.actor.userId,
    disclosure_version: version,
    ip: signer.actor.ip,
    user_agent: signer.actor.userAgent,
  });
  if (error) throw error;
  await logEventAs(
    admin,
    signer.actor,
    signer.document.id,
    'ESIGN_CONSENT_ACCEPTED',
    'Agreed to sign electronically',
    {
      disclosure_version: version,
    },
  );
}

export interface SubmissionInput {
  values: { field_id: string; value?: string | null; asset?: string | null }[];
  assets: Record<string, string>;
  timezone?: string | null;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_IMAGE_BYTES = 1024 * 1024;

function decodePng(base64: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    throw new HttpError('INVALID_INPUT', 400, 'Signature image is not valid');
  }
  if (bytes.length > MAX_IMAGE_BYTES || !PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new HttpError('INVALID_INPUT', 400, 'Signature image must be a PNG up to 1 MB');
  }
  return bytes;
}

function authMethod(signer: Signer): 'account' | 'link' | 'link_otp' {
  if (signer.mode === 'account') return 'account';
  return signer.document.require_email_otp ? 'link_otp' : 'link';
}

/**
 * Completes a signer's part (SPEC §10 submit-signing): validates every value with the shared rules,
 * stores signature images in the document's folder, then calls complete_recipient(), which writes
 * the values, sets the recipient signed/approved and advances the group in one transaction. The
 * next group is emailed; when nobody is left, the document is finalized.
 */
export async function submitSigning(
  admin: SupabaseClient,
  signer: Signer,
  input: SubmissionInput,
): Promise<SubmitSigningResult> {
  const state = requireState(signer, ['sign', 'approve']);
  if (!(await hasConsent(admin, signer.recipient.id))) {
    throw new HttpError('INVALID_STATE', 409, 'Agree to sign electronically first');
  }
  const { document: doc, recipient: r } = signer;
  const fields = state === 'sign' ? await loadOwnFields(admin, r.id) : [];
  const byId = new Map(fields.map((f) => [f.id, f]));

  const entries: FieldEntries = {};
  for (const v of input.values) {
    const field = byId.get(v.field_id);
    const hasImage = Boolean(v.asset && input.assets[v.asset]);
    entries[v.field_id] = {
      value: v.value ?? null,
      hasImage: field && (field.type === 'signature' || field.type === 'initials') ? hasImage : false,
    };
  }
  const issues = validateSubmission(fields, entries);
  if (issues.length > 0) {
    throw new HttpError(
      'INVALID_INPUT',
      422,
      `Check these fields: ${[...new Set(issues.map((i) => i.fieldId))].join(', ')}`,
    );
  }

  // Store images (one per field, in the document's folder) before the transaction.
  const now = new Date();
  const uploaded: string[] = [];
  const rows: { field_id: string; value: string | null; asset_path: string | null }[] = [];
  const decoded = new Map<string, Uint8Array>();
  try {
    for (const field of fields) {
      const entry = input.values.find((v) => v.field_id === field.id);
      if (field.type === 'signature' || field.type === 'initials') {
        if (!entry?.asset || !input.assets[entry.asset]) continue;
        const bytes = decoded.get(entry.asset) ?? decodePng(input.assets[entry.asset]!);
        decoded.set(entry.asset, bytes);
        const path = `${doc.owner_id}/${doc.id}/signing/${r.id}/${field.id}.png`;
        const { error } = await admin.storage
          .from('documents')
          .upload(path, bytes, { contentType: 'image/png', upsert: true });
        if (error) throw error;
        uploaded.push(path);
        rows.push({ field_id: field.id, value: null, asset_path: path });
        continue;
      }
      if (field.type === 'date_signed') {
        const format = (field.properties as { format?: 'MMM d, yyyy' | 'yyyy-MM-dd' | 'dd/MM/yyyy' }).format;
        rows.push({
          field_id: field.id,
          value: formatDateSigned(now, format, input.timezone ?? 'UTC'),
          asset_path: null,
        });
        continue;
      }
      const normalized = normalizeValue(field, entry?.value);
      if ('issue' in normalized) throw new HttpError('INVALID_INPUT', 422, `Check field ${field.id}`);
      if (normalized.value && normalized.value !== 'false') {
        rows.push({ field_id: field.id, value: normalized.value, asset_path: null });
      }
    }

    const { data, error } = await admin.rpc('complete_recipient', { p_recipient_id: r.id, p_values: rows });
    if (error) {
      if (error.code === 'SF030') throw new HttpError('NOT_YOUR_TURN', 409, error.message);
      if (error.code === 'SF031') throw new HttpError('INVALID_STATE', 409, error.message);
      if (error.code === 'SF032') throw new HttpError('INVALID_INPUT', 422, error.message);
      throw error;
    }
    const result = data as { outcome: 'waiting' | 'advanced' | 'finalize'; activated: ActivatedRecipient[] };

    const approved = r.role === 'approver';
    await logEventAs(
      admin,
      signer.actor,
      doc.id,
      approved ? 'DOCUMENT_APPROVED' : 'DOCUMENT_SIGNED',
      approved ? `${r.name} approved` : `${r.name} signed`,
      { method: authMethod(signer), fields: rows.length },
    );

    if (result.activated.length > 0 && doc.expires_at) {
      await notifyActivated(admin, signer.actor, { ...doc, expires_at: doc.expires_at }, result.activated);
    }
    if (result.outcome !== 'finalize') {
      return { outcome: result.outcome, download_token: null };
    }
    try {
      await finalizeDocument(admin, doc.id);
    } catch (error) {
      // Everyone has signed; the owner can retry with finalize-document. Nothing is lost.
      console.error('finalize failed', doc.id, error instanceof Error ? error.message : error);
      return { outcome: 'finalizing', download_token: null };
    }
    const downloadToken = signer.mode === 'guest' ? await issueDownloadToken(admin, r.id) : null;
    return { outcome: 'completed', download_token: downloadToken };
  } catch (error) {
    if (uploaded.length > 0) {
      // If the values were not recorded, remove the images stored for this attempt.
      const { data: written } = await admin
        .from('field_values')
        .select('field_id')
        .eq('recipient_id', r.id)
        .limit(1);
      if (!written?.length) await admin.storage.from('documents').remove(uploaded);
    }
    throw error;
  }
}

/**
 * Declines with a reason (SPEC §6.2): the document becomes declined, signing links stop working,
 * and the owner and the other active recipients are emailed.
 */
export async function declineSigning(admin: SupabaseClient, signer: Signer, reason: string) {
  requireState(signer, ['sign', 'approve']);
  const { document: doc, recipient: r } = signer;
  const { error } = await admin.rpc('decline_recipient', { p_recipient_id: r.id, p_reason: reason });
  if (error) {
    if (error.code === 'SF030') throw new HttpError('NOT_YOUR_TURN', 409, error.message);
    if (error.code === 'SF031' || error.code === 'SF033')
      throw new HttpError('INVALID_STATE', 409, error.message);
    if (error.code === 'SF032') throw new HttpError('INVALID_INPUT', 400, error.message);
    throw error;
  }
  await logEventAs(admin, signer.actor, doc.id, 'DOCUMENT_DECLINED', `${r.name} declined`, {
    reason: reason.trim(),
    method: authMethod(signer),
  });

  const [{ data: owner }, { data: others }] = await Promise.all([
    admin.from('profiles').select('full_name, email').eq('id', doc.owner_id).single(),
    admin
      .from('document_recipients')
      .select('id, name, email')
      .eq('document_id', doc.id)
      .neq('id', r.id)
      .neq('role', 'cc')
      .neq('status', 'pending'),
  ]);
  const people = [
    ...(owner?.email ? [{ name: owner.full_name ?? '', email: owner.email as string }] : []),
    ...(others ?? [])
      .filter((o) => o.email && o.email.toLowerCase() !== (owner?.email ?? '').toLowerCase())
      .map((o) => ({ name: o.name, email: o.email as string })),
  ];
  const provider = emailProvider();
  for (const person of people) {
    try {
      await provider.send(
        declinedEmail({
          recipientName: person.name,
          recipientEmail: person.email,
          documentTitle: doc.title,
          declinedBy: r.name,
          reason: reason.trim(),
        }),
      );
    } catch (e) {
      console.error('decline email failed', e instanceof Error ? e.message : e);
    }
  }
}

/** Guest download (SPEC §7): the original while signing, the signed copy and certificate when completed. */
export async function guestDownload(
  admin: SupabaseClient,
  signer: Signer,
  kind: 'original' | 'completed' | 'certificate',
): Promise<{ url: string; file_name: string }> {
  const doc = signer.document;
  let path: string | null;
  if (kind === 'original') {
    if (signer.token?.revoked || signer.token?.purpose !== 'sign' || needsOtp(signer)) {
      throw new HttpError('FORBIDDEN', 403, 'This link cannot download the original');
    }
    if (signer.recipient.status === 'pending' || signer.recipient.role === 'cc') {
      throw new HttpError('NOT_YOUR_TURN', 409, "It's not your turn yet");
    }
    path = doc.original_path;
  } else {
    if (doc.status !== 'completed')
      throw new HttpError('INVALID_STATE', 409, 'Available once everyone has signed');
    if (signer.token?.purpose !== 'download')
      throw new HttpError('FORBIDDEN', 403, 'Use the link in the completion email');
    path = kind === 'completed' ? doc.completed_path : doc.certificate_path;
  }
  if (!path) throw new HttpError('INVALID_STATE', 409, 'File not available');
  const base =
    doc.title
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
      .trim()
      .replace(/\.pdf$/i, '') || 'document';
  const fileName = `${base}${kind === 'certificate' ? ' - certificate' : ''}.pdf`;
  const { data, error } = await admin.storage.from('documents').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw error ?? new Error('Could not sign URL');
  await logEventAs(admin, signer.actor, doc.id, 'DOCUMENT_DOWNLOADED', 'Document downloaded', {
    kind,
    via: 'link',
  });
  return { url: `${data.signedUrl}&download=${encodeURIComponent(fileName)}`, file_name: fileName };
}
