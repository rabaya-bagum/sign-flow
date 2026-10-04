import { PDFDocument, type PDFFont, rgb, StandardFonts } from '../deps.ts';
import { encodableText } from './stamp.ts';

/** Everything the certificate of completion shows (SPEC §12.2). Times are ISO strings (UTC). */
export interface CertificateData {
  documentId: string;
  title: string;
  pageCount: number;
  originalSha256: string;
  completedSha256: string;
  sender: { name: string; email: string };
  sentAt: string | null;
  completedAt: string;
  recipients: CertificateRecipient[];
  events: CertificateEvent[];
}

export interface CertificateRecipient {
  name: string;
  email: string;
  role: string;
  order: number;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  ip: string | null;
  userAgent: string | null;
  /** 'Email link', 'Email link + one-time code' or 'SignFlow account'. */
  authentication: string;
  consentAt: string | null;
  consentVersion: string | null;
}

export interface CertificateEvent {
  at: string;
  type: string;
  description: string;
  actor: string | null;
  ip: string | null;
}

const PAGE = { width: 612, height: 792 };
const MARGIN = 50;
const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.36, 0.38, 0.44);
const ACCENT = rgb(0.17, 0.35, 0.85);

/** "2026-10-04 11:07:42 UTC" */
export function utc(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** Line-wrapping writer with automatic page breaks. */
class Writer {
  page;
  y = PAGE.height - MARGIN;
  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + 20) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - MARGIN;
    }
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of encodableText(font, text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // Break very long tokens (hashes, user agents) by characters.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let n = rest.length;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
          lines.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    text: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {},
  ) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.regular;
    const indent = opts.indent ?? 0;
    for (const line of this.wrap(text, font, size, PAGE.width - 2 * MARGIN - indent)) {
      this.ensure(size + 4);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - size,
        size,
        font,
        color: opts.color ?? INK,
      });
      this.y -= size + 4;
    }
  }

  /** "Label: value" with the label in bold, value wrapped beside it. */
  row(label: string, value: string, indent = 0) {
    const size = 9.5;
    const labelWidth = 130;
    const lines = this.wrap(value, this.regular, size, PAGE.width - 2 * MARGIN - indent - labelWidth);
    lines.forEach((line, i) => {
      this.ensure(size + 4);
      if (i === 0) {
        this.page.drawText(encodableText(this.bold, label), {
          x: MARGIN + indent,
          y: this.y - size,
          size,
          font: this.bold,
          color: MUTED,
        });
      }
      this.page.drawText(line, {
        x: MARGIN + indent + labelWidth,
        y: this.y - size,
        size,
        font: this.regular,
        color: INK,
      });
      this.y -= size + 4;
    });
  }

  gap(height = 10) {
    this.y -= height;
  }

  heading(text: string) {
    this.gap(8);
    this.ensure(30);
    this.text(text, { size: 13, bold: true, color: ACCENT });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: MUTED,
    });
    this.gap(6);
  }
}

/** Builds the certificate of completion as a separate PDF (SPEC §12.2). */
export async function buildCertificate(data: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate of completion: ${data.title}`);
  doc.setProducer('SignFlow');
  doc.setCreator('SignFlow');
  doc.setCreationDate(new Date(data.completedAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, regular, bold);

  w.text('SignFlow', { size: 12, bold: true, color: ACCENT });
  w.gap(4);
  w.text('Certificate of completion', { size: 20, bold: true });
  w.text('All times are in UTC (Coordinated Universal Time).', { color: MUTED });

  w.heading('Document');
  w.row('Title', data.title);
  w.row('Document ID', data.documentId);
  w.row('Pages', String(data.pageCount));
  w.row('Sent', utc(data.sentAt));
  w.row('Completed', utc(data.completedAt));
  w.row('Sender', `${data.sender.name} <${data.sender.email}>`);
  w.row('Original SHA-256', data.originalSha256);
  w.row('Completed SHA-256', data.completedSha256);
  w.text(
    'The SHA-256 fingerprints identify the exact files. Any change to a file, however small, changes its fingerprint.',
    { color: MUTED, size: 8.5 },
  );

  w.heading('Recipients');
  for (const r of data.recipients) {
    w.text(`${r.order}. ${r.name} <${r.email}>`, { bold: true });
    w.row('Role', r.role, 12);
    w.row('Status', r.status, 12);
    w.row('Sent', utc(r.sentAt), 12);
    w.row('Viewed', utc(r.viewedAt), 12);
    w.row(r.role === 'approver' ? 'Approved' : 'Signed', utc(r.completedAt), 12);
    w.row('Authentication', r.authentication, 12);
    if (r.consentAt)
      w.row('ESIGN consent', `${utc(r.consentAt)} (disclosure ${r.consentVersion ?? '—'})`, 12);
    if (r.ip) w.row('IP address', r.ip, 12);
    if (r.userAgent) w.row('Device', r.userAgent, 12);
    w.gap(6);
  }

  w.heading('Event history');
  for (const e of data.events) {
    const who = e.actor ? ` · ${e.actor}` : '';
    const ip = e.ip ? ` · ${e.ip}` : '';
    w.text(`${utc(e.at)}  ${e.description}${who}${ip}`, { size: 8.5 });
  }

  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = `Document ${data.documentId} · Page ${i + 1} of ${pages.length}`;
    page.drawText(label, { x: MARGIN, y: MARGIN - 20, size: 7.5, font: regular, color: MUTED });
  });
  return await doc.save();
}
