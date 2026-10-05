import type { Field } from '@shared/fields';
import type { SurfaceOverlay } from '@shared/pdfBridge';
import {
  choiceMark,
  type FieldEntries,
  type FilledField,
  isFilled,
  orderFields,
  radioGroup,
  requiredProgress,
  validateSubmission,
} from '@shared/signing';

import { bytesToBase64 } from '@/lib/base64';

import type { Submission } from './api';

type ImageKind = 'signature' | 'initials';

/** An image the signer adopted for signature or initials fields. */
export interface AdoptedImage {
  base64: string;
  dataUrl: string;
}

export interface SigningValues {
  entries: FieldEntries;
  /** One image per kind; a field with `hasImage` shows the image of its own type. */
  adopted: Partial<Record<ImageKind, AdoptedImage>>;
}

export const EMPTY_VALUES: SigningValues = { entries: {}, adopted: {} };

export function adopt(bytes: Uint8Array): AdoptedImage {
  const base64 = bytesToBase64(bytes);
  return { base64, dataUrl: `data:image/png;base64,${base64}` };
}

function imageKind(field: Field): ImageKind | null {
  return field.type === 'signature' || field.type === 'initials' ? field.type : null;
}

/** The adopted image filling this field, if any. */
function fieldImage(field: Field, values: SigningValues): AdoptedImage | undefined {
  const kind = imageKind(field);
  return kind && values.entries[field.id]?.hasImage ? values.adopted[kind] : undefined;
}

/** Sets an image field (and records the adopted image for reuse on the signer's other fields). */
export function applyImage(values: SigningValues, field: Field, image: AdoptedImage): SigningValues {
  const kind = imageKind(field);
  if (!kind) return values;
  return {
    entries: { ...values.entries, [field.id]: { hasImage: true } },
    adopted: { ...values.adopted, [kind]: image },
  };
}

export function setValue(values: SigningValues, field: Field, value: string | null): SigningValues {
  return { ...values, entries: { ...values.entries, [field.id]: { value } } };
}

/** Checkbox toggles; a radio choice clears the other options in its group. */
export function toggleChoice(values: SigningValues, field: Field, fields: readonly Field[]): SigningValues {
  const on = values.entries[field.id]?.value === 'true';
  if (field.type === 'checkbox') return setValue(values, field, on ? 'false' : 'true');
  const group = radioGroup(field);
  const entries = { ...values.entries };
  for (const f of fields) {
    if (f.type === 'radio' && radioGroup(f) === group) {
      entries[f.id] = { value: f.id === field.id ? 'true' : 'false' };
    }
  }
  return { ...values, entries };
}

/** The top-most field under a tap (later fields are drawn on top). */
export function fieldAt(fields: readonly Field[], tap: { page: number; x: number; y: number }): Field | null {
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i]!;
    if (
      f.page_number === tap.page &&
      tap.x >= f.x &&
      tap.x <= f.x + f.width &&
      tap.y >= f.y &&
      tap.y <= f.y + f.height
    ) {
      return f;
    }
  }
  return null;
}

/** Display text inside a field before and after it is filled. */
export function fieldText(
  field: Field,
  values: SigningValues,
  labels: Record<Field['type'], string>,
  today: string,
): string {
  const entry = values.entries[field.id];
  switch (field.type) {
    case 'checkbox':
    case 'radio':
      return choiceMark(field.type, entry?.value) ?? '';
    case 'date_signed':
      return today;
    case 'signature':
    case 'initials':
      return labels[field.type];
    default:
      return entry?.value?.trim() ? entry.value.trim().slice(0, 60) : labels[field.type];
  }
}

interface OverlayColors {
  required: string;
  optional: string;
  fill: string;
  filledFill: string;
}

/** Surface overlays: other people's values, then this signer's fields (highlighted until filled). */
export function buildOverlays(
  fields: readonly Field[],
  filled: readonly FilledField[],
  values: SigningValues,
  colors: OverlayColors,
  text: (field: Field) => string,
  label: (field: Field) => string,
): SurfaceOverlay[] {
  const overlays: SurfaceOverlay[] = [];
  for (const f of filled) {
    const rect = { x: f.x, y: f.y, width: f.width, height: f.height };
    if (f.image) {
      overlays.push({ id: `filled-${f.id}`, page: f.page_number, rect, kind: 'image', src: f.image });
    } else if (f.text) {
      overlays.push({
        id: `filled-${f.id}`,
        page: f.page_number,
        rect,
        kind: 'rect',
        color: '#00000000',
        text: f.text.slice(0, 60),
      });
    }
  }
  for (const field of orderFields(fields)) {
    const rect = { x: field.x, y: field.y, width: field.width, height: field.height };
    const image = fieldImage(field, values);
    if (image) {
      overlays.push({
        id: field.id,
        page: field.page_number,
        rect,
        kind: 'image',
        src: image.dataUrl,
        label: label(field),
      });
      continue;
    }
    const done = isFilled(field, values.entries[field.id]);
    overlays.push({
      id: field.id,
      page: field.page_number,
      rect,
      kind: 'rect',
      color: field.required && !done ? colors.required : colors.optional,
      fill: done ? colors.filledFill : colors.fill,
      text: text(field),
      label: label(field),
    });
  }
  return overlays;
}

export function progress(fields: readonly Field[], values: SigningValues) {
  return requiredProgress(fields, values.entries);
}

export function canFinish(fields: readonly Field[], values: SigningValues): boolean {
  return validateSubmission(fields, values.entries).length === 0;
}

/** The request body: one value per field, images sent once each. */
export function toSubmission(
  fields: readonly Field[],
  values: SigningValues,
  timezone: string | null,
): Submission {
  const assets: Record<string, string> = {};
  const out: Submission['values'] = [];
  for (const field of fields) {
    const kind = imageKind(field);
    if (kind) {
      const image = fieldImage(field, values);
      if (!image) continue;
      assets[kind] ??= image.base64;
      out.push({ field_id: field.id, asset: kind });
      continue;
    }
    const entry = values.entries[field.id];
    if (entry?.value !== undefined && entry.value !== null)
      out.push({ field_id: field.id, value: entry.value });
  }
  return { values: out, assets, timezone };
}
