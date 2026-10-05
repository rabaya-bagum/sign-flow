import { fieldPropertiesSchemas, type FieldType } from '../../../shared/fields.ts';
import type { PageBox } from '../../../shared/geometry.ts';
import { normalizeRotation } from '../../../shared/geometry.ts';
import { bytesToBase64, sha256Hex } from './crypto.ts';
import { downloadFileName } from './documents.ts';
import { PDFDocument, type PDFImage, type SupabaseClient, StandardFonts } from './deps.ts';
import { type EmailAttachment, emailProvider } from './email/provider.ts';
import { completedEmail } from './email/templates.ts';
import { logEventAs, SYSTEM_ACTOR } from './events.ts';
import { HttpError } from './http.ts';
import { buildCertificate, type CertificateData } from './pdf/certificate.ts';
import { stampImage, stampText, type TextAlign } from './pdf/stamp.ts';
import { documentLink, issueDownloadToken, signingLink } from './tokens.ts';

/** Attach the PDFs to completion emails only up to this total size (bytes). */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const AUTH_LABEL: Record<string, string> = {
  account: 'SignFlow account',
  link: 'Email link',
  link_otp: 'Email link + one-time code',
};

async function download(admin: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from('documents').download(path);
  if (error || !data) throw error ?? new Error(`Missing file ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function upload(admin: SupabaseClient, path: string, bytes: Uint8Array) {
  const { error } = await admin.storage
    .from('documents')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
}

interface FieldRow {
  id: string;
  page_number: number;
  type: FieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, unknown>;
}

/**
 * Flattens every value into a copy of the original PDF (SPEC §10 finalize-document): signatures and
 * initials as images, text as text (upright on rotated pages), checkboxes as ✔ and radio choices as ●.
 * Values that share one image (the same Uint8Array) embed it once.
 */
export async function flatten(
  original: Uint8Array,
  pages: Map<number, PageBox>,
  values: { field: FieldRow; value: string | null; image: Uint8Array | null }[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const dingbats = await pdf.embedFont(StandardFonts.ZapfDingbats);
  const embedded = new Map<Uint8Array, PDFImage>();
  for (const { field, value, image } of values) {
    const page = pages.get(field.page_number);
    if (!page) continue;
    const index = field.page_number - 1;
    const rect = { x: field.x, y: field.y, width: field.width, height: field.height };
    if (image) {
      let embeddedImage = embedded.get(image);
      if (!embeddedImage) {
        embeddedImage = await pdf.embedPng(image);
        embedded.set(image, embeddedImage);
      }
      await stampImage(pdf, index, rect, page, embeddedImage);
      continue;
    }
    if (!value) continue;
    if (field.type === 'checkbox' || field.type === 'radio') {
      if (value !== 'true') continue;
      stampText(pdf, index, rect, page, field.type === 'checkbox' ? '✔' : '●', {
        font: dingbats,
        fontSize: 72,
        align: 'center',
      });
      continue;
    }
    const style = fieldPropertiesSchemas.text.safeParse(field.properties);
    stampText(pdf, index, rect, page, value, {
      font: helvetica,
      fontSize: style.success ? style.data.fontSize : 12,
      align: (style.success ? style.data.align : 'left') as TextAlign,
    });
  }
  pdf.setModificationDate(new Date());
  return await pdf.save();
}

export interface FinalizeResult {
  /** False when another request had already completed the document. */
  completed: boolean;
  completedSha256: string | null;
}

/**
 * Finalizes a document whose signers have all finished (SPEC §6.2, §10, §12.2): flattens the values,
 * builds the certificate, stores both with their hashes, marks the document completed (which notifies
 * CCs and revokes signing links), and emails the signed copy and certificate to everyone, CCs included.
 * Safe to retry: if a previous attempt failed after storing files, this overwrites them.
 */
export async function finalizeDocument(admin: SupabaseClient, documentId: string): Promise<FinalizeResult> {
  const { data: doc, error: docError } = await admin
    .from('documents')
    .select('id, owner_id, title, status, original_path, original_sha256, page_count, sent_at, deleted_at')
    .eq('id', documentId)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc || doc.deleted_at) throw new HttpError('NOT_FOUND', 404, 'Document not found');
  if (doc.status === 'completed') return { completed: false, completedSha256: null };
  if (doc.status !== 'in_progress' || !doc.original_path) {
    throw new HttpError('INVALID_STATE', 409, 'This document cannot be completed');
  }

  const [pagesRes, fieldsRes, valuesRes, recipientsRes, ownerRes] = await Promise.all([
    admin
      .from('document_pages')
      .select('page_number, width_pt, height_pt, box_x_pt, box_y_pt, rotation')
      .eq('document_id', doc.id),
    admin
      .from('document_fields')
      .select('id, page_number, type, x, y, width, height, properties')
      .eq('document_id', doc.id),
    admin.from('field_values').select('field_id, recipient_id, value, asset_path').eq('document_id', doc.id),
    admin
      .from('document_recipients')
      .select('id, user_id, name, email, role, signing_order, status, sent_at, viewed_at, completed_at')
      .eq('document_id', doc.id)
      .order('signing_order')
      .order('created_at'),
    admin.from('profiles').select('full_name, email').eq('id', doc.owner_id).single(),
  ]);
  for (const res of [pagesRes, fieldsRes, valuesRes, recipientsRes, ownerRes]) {
    if (res.error) throw res.error;
  }
  const recipients = recipientsRes.data ?? [];
  if (
    recipients.some(
      (r) => (r.role === 'signer' || r.role === 'approver') && !['signed', 'approved'].includes(r.status),
    )
  ) {
    throw new HttpError('INVALID_STATE', 409, 'Not everyone has signed yet');
  }

  // --- Flatten ---------------------------------------------------------------------------------------
  const pages = new Map<number, PageBox>(
    (pagesRes.data ?? []).map((p) => [
      p.page_number,
      {
        width_pt: Number(p.width_pt),
        height_pt: Number(p.height_pt),
        box_x_pt: Number(p.box_x_pt),
        box_y_pt: Number(p.box_y_pt),
        rotation: normalizeRotation(p.rotation),
      },
    ]),
  );
  const fields = new Map<string, FieldRow>(
    (fieldsRes.data ?? []).map((f) => [
      f.id,
      { ...f, x: Number(f.x), y: Number(f.y), width: Number(f.width), height: Number(f.height) } as FieldRow,
    ]),
  );
  const assetPaths = [
    ...new Set((valuesRes.data ?? []).flatMap((v) => (v.asset_path ? [v.asset_path] : []))),
  ];
  const [original, assetBytes] = await Promise.all([
    download(admin, doc.original_path),
    Promise.all(assetPaths.map((path) => download(admin, path))),
  ]);
  const images = new Map(assetPaths.map((path, i) => [path, assetBytes[i]!]));
  const values = [];
  for (const v of valuesRes.data ?? []) {
    const field = fields.get(v.field_id);
    if (!field) continue;
    values.push({ field, value: v.value, image: v.asset_path ? images.get(v.asset_path)! : null });
  }
  const completed = await flatten(original, pages, values);
  const completedSha256 = await sha256Hex(completed);
  const originalSha256 = doc.original_sha256 ?? (await sha256Hex(original));

  // --- Certificate -----------------------------------------------------------------------------------
  const [{ data: events, error: eventsError }, { data: consents, error: consentsError }] = await Promise.all([
    admin
      .from('document_events')
      .select(
        'created_at, type, description, actor_name, actor_email, actor_recipient_id, ip, user_agent, metadata',
      )
      .eq('document_id', doc.id)
      .order('created_at')
      .order('id'),
    admin
      .from('esign_consents')
      .select('recipient_id, disclosure_version, accepted_at')
      .in(
        'recipient_id',
        recipients.map((r) => r.id),
      )
      .order('accepted_at'),
  ]);
  if (eventsError) throw eventsError;
  if (consentsError) throw consentsError;
  const completedAt = new Date().toISOString();
  const certificate: CertificateData = {
    documentId: doc.id,
    title: doc.title,
    pageCount: doc.page_count ?? pages.size,
    originalSha256,
    completedSha256,
    sender: { name: ownerRes.data?.full_name ?? '', email: ownerRes.data?.email ?? '' },
    sentAt: doc.sent_at,
    completedAt,
    recipients: recipients.map((r) => {
      const acted = (events ?? []).find(
        (e) =>
          e.actor_recipient_id === r.id && (e.type === 'DOCUMENT_SIGNED' || e.type === 'DOCUMENT_APPROVED'),
      );
      const consent = (consents ?? []).filter((c) => c.recipient_id === r.id).at(-1);
      const method = (acted?.metadata as { method?: string } | null)?.method;
      return {
        name: r.name,
        email: r.email ?? '',
        role: r.role === 'cc' ? 'Receives a copy' : r.role[0]!.toUpperCase() + r.role.slice(1),
        order: r.signing_order,
        status: r.role === 'cc' ? 'Copy sent at completion' : r.status[0]!.toUpperCase() + r.status.slice(1),
        sentAt: r.role === 'cc' ? completedAt : r.sent_at,
        viewedAt: r.viewed_at,
        completedAt: r.completed_at,
        ip: acted?.ip ? String(acted.ip) : null,
        userAgent: acted?.user_agent ?? null,
        authentication: r.role === 'cc' ? 'Email' : (AUTH_LABEL[method ?? ''] ?? 'Email link'),
        consentAt: consent?.accepted_at ?? null,
        consentVersion: consent?.disclosure_version ?? null,
      };
    }),
    events: [
      ...(events ?? []).map((e) => ({
        at: e.created_at,
        type: e.type,
        description: e.description,
        actor: e.actor_name ? `${e.actor_name}${e.actor_email ? ` <${e.actor_email}>` : ''}` : e.actor_email,
        ip: e.ip ? String(e.ip) : null,
      })),
      {
        at: completedAt,
        type: 'DOCUMENT_COMPLETED',
        description: 'Document completed',
        actor: null,
        ip: null,
      },
    ],
  };
  const certificateBytes = await buildCertificate(certificate);

  // --- Store and complete ----------------------------------------------------------------------------
  const base = `${doc.owner_id}/${doc.id}`;
  await Promise.all([
    upload(admin, `${base}/completed.pdf`, completed),
    upload(admin, `${base}/certificate.pdf`, certificateBytes),
  ]);
  const { data: marked, error: markError } = await admin.rpc('mark_document_completed', {
    p_document_id: doc.id,
    p_completed_path: `${base}/completed.pdf`,
    p_certificate_path: `${base}/certificate.pdf`,
    p_completed_sha256: completedSha256,
  });
  if (markError) {
    if (markError.code === 'SF031') throw new HttpError('INVALID_STATE', 409, markError.message);
    throw markError;
  }
  if (marked !== true) return { completed: false, completedSha256: null };

  await logEventAs(admin, SYSTEM_ACTOR, doc.id, 'DOCUMENT_COMPLETED', 'Document completed', {
    original_sha256: originalSha256,
    completed_sha256: completedSha256,
    certificate_sha256: await sha256Hex(certificateBytes),
  });

  // --- Email everyone, CC included -------------------------------------------------------------------
  const attach = completed.length + certificateBytes.length <= MAX_ATTACHMENT_BYTES;
  const attachments: EmailAttachment[] = attach
    ? [
        {
          filename: downloadFileName(doc.title),
          contentType: 'application/pdf',
          content: bytesToBase64(completed),
        },
        {
          filename: downloadFileName(doc.title, 'certificate'),
          contentType: 'application/pdf',
          content: bytesToBase64(certificateBytes),
        },
      ]
    : [];
  const provider = emailProvider();
  const senderName = ownerRes.data?.full_name || ownerRes.data?.email || 'the sender';
  const people: { name: string; email: string; recipientId: string | null; hasAccount: boolean }[] = [
    {
      name: ownerRes.data?.full_name ?? '',
      email: ownerRes.data?.email ?? '',
      recipientId: null,
      hasAccount: true,
    },
    ...recipients
      .filter((r) => r.email && r.email.toLowerCase() !== (ownerRes.data?.email ?? '').toLowerCase())
      .map((r) => ({ name: r.name, email: r.email!, recipientId: r.id, hasAccount: Boolean(r.user_id) })),
  ];
  for (const person of people) {
    try {
      const link =
        person.hasAccount || !person.recipientId
          ? documentLink(doc.id)
          : signingLink(await issueDownloadToken(admin, person.recipientId));
      await provider.send({
        ...completedEmail({
          recipientName: person.name,
          recipientEmail: person.email,
          documentTitle: doc.title,
          senderName,
          link,
          attached: attach,
        }),
        attachments,
      });
      if (person.recipientId) {
        await logEventAs(
          admin,
          SYSTEM_ACTOR,
          doc.id,
          'RECIPIENT_NOTIFIED',
          `Signed copy sent to ${person.name}`,
          {
            recipient_id: person.recipientId,
            channel: 'email',
            kind: 'completed',
          },
        );
      }
    } catch (error) {
      console.error('completion email failed', error instanceof Error ? error.message : error);
    }
  }
  return { completed: true, completedSha256 };
}
