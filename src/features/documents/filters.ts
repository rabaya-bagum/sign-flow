import type { DatePreset, DocumentFilters } from './types';

const DAY = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<Exclude<DatePreset, 'any'>, number> = { '7d': 7, '30d': 30, '12m': 365 };

function since(preset: DatePreset, now: Date): string | undefined {
  if (preset === 'any') return undefined;
  return new Date(now.getTime() - PRESET_DAYS[preset] * DAY).toISOString();
}

/** Converts UI filters into the `p_filters` JSON accepted by public.list_documents. */
export function toRpcFilters(filters: DocumentFilters, now: Date = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  const created = since(filters.created, now);
  const modified = since(filters.modified, now);
  if (created) out.created_from = created;
  if (modified) out.modified_from = modified;
  if (filters.senderId) out.sender_id = filters.senderId;
  if (filters.recipient.trim()) out.recipient = filters.recipient.trim();
  return out;
}
