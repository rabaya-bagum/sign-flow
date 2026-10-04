/**
 * DEV ONLY: backs the `/dev/coordinate-spike` route (Phase 3 §C). Serves a geometry fixture, or the
 * fixture stamped at the boxes tapped on screen, as a short-lived signed URL.
 *
 * Refuses unless the function environment has `DEV_TOOLS=true`, and is left out of the deploy list
 * (`npm run functions:deploy`). Never enable it on a hosted project.
 */
import { SIGNED_URL_TTL_SECONDS } from '../../../shared/limits.ts';
import type { RequestContext } from '../_shared/context.ts';
import { PDFDocument, z } from '../_shared/deps.ts';
import { HttpError } from '../_shared/http.ts';
import { inspectPdf, type PageGeometry } from '../_shared/pdf/inspect.ts';
import { stampImage, stampRect } from '../_shared/pdf/stamp.ts';
import { FIXTURES, MARKER_PNG } from './fixtures.ts';

export function devToolsEnabled(): boolean {
  return Deno.env.get('DEV_TOOLS') === 'true';
}

const fraction = z.number().min(0).max(1);

export const DevStampInput = z.object({
  fixture: z.string().refine((name) => Object.hasOwn(FIXTURES, name), 'Unknown fixture'),
  boxes: z
    .array(
      z.object({
        page: z.number().int().min(1),
        kind: z.enum(['rect', 'image']),
        rect: z.object({ x: fraction, y: fraction, width: fraction, height: fraction }),
      }),
    )
    .max(50)
    .default([]),
});

export interface DevStampResult {
  url: string;
  expires_in: number;
  pages: PageGeometry[];
}

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

export async function devStamp(
  input: z.output<typeof DevStampInput>,
  ctx: RequestContext,
): Promise<DevStampResult> {
  if (!devToolsEnabled()) throw new HttpError('NOT_FOUND', 404, 'Not found');

  const original = decode(FIXTURES[input.fixture]!);
  const { pages } = await inspectPdf(original);
  let bytes: Uint8Array = original;
  if (input.boxes.length > 0) {
    const doc = await PDFDocument.load(original);
    const marker = decode(MARKER_PNG);
    for (const box of input.boxes) {
      const page = pages[box.page - 1];
      if (!page) throw new HttpError('INVALID_INPUT', 400, `No page ${box.page}`);
      if (box.kind === 'rect')
        stampRect(doc, box.page - 1, box.rect, page, { color: [0.86, 0.1, 0.1], opacity: 0.6 });
      else await stampImage(doc, box.page - 1, box.rect, page, marker);
    }
    bytes = await doc.save();
  }

  // Scratch files under the caller's own folder; no document row refers to them.
  const path = `${ctx.userId}/dev-spike/${input.fixture}${input.boxes.length > 0 ? '.stamped' : ''}.pdf`;
  const upload = await ctx.admin.storage
    .from('documents')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upload.error) throw upload.error;
  const { data, error } = await ctx.admin.storage
    .from('documents')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw error ?? new Error('Could not sign URL');
  return { url: data.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS, pages };
}
