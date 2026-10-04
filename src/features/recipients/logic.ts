import type { RecipientRole } from '@shared/send';

/** One editable row of the recipients step (SPEC §5.3). `id` is set for rows already saved. */
export interface RecipientRow {
  key: string;
  id?: string;
  name: string;
  email: string;
  role: RecipientRole;
}

export interface SavedRecipient {
  id: string;
  name: string;
  email: string | null;
  role: RecipientRole;
  signingOrder: number;
}

export type RowError = { name?: 'required'; email?: 'required' | 'invalid' | 'duplicate' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Signing orders: one group per row when "Sign in this order" is on, otherwise everyone in group 1. */
export function signingOrders(rows: RecipientRow[], sequential: boolean): number[] {
  let order = 0;
  return rows.map((row) => {
    if (!sequential) return 1;
    // CCs don't act, so they don't take a turn: they share the previous group.
    if (row.role === 'cc') return Math.max(order, 1);
    order += 1;
    return order;
  });
}

/** Whether saved recipients are in sequential order (more than one distinct group). */
export function isSequential(saved: SavedRecipient[]): boolean {
  return new Set(saved.filter((r) => r.role !== 'cc').map((r) => r.signingOrder)).size > 1;
}

export function validateRows(rows: RecipientRow[]): Record<string, RowError> {
  const errors: Record<string, RowError> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const error: RowError = {};
    if (!row.name.trim()) error.name = 'required';
    const email = row.email.trim().toLowerCase();
    if (!email) error.email = 'required';
    else if (!EMAIL.test(email)) error.email = 'invalid';
    else if (seen.has(email)) error.email = 'duplicate';
    else seen.add(email);
    if (error.name || error.email) errors[row.key] = error;
  }
  return errors;
}

export function move<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export interface RecipientChanges {
  insert: { name: string; email: string; role: RecipientRole; signing_order: number }[];
  update: { id: string; name: string; email: string; role: RecipientRole; signing_order: number }[];
  remove: string[];
}

/** What to write so the server matches the rows (deleted recipients take their fields with them). */
export function diffRecipients(
  saved: SavedRecipient[],
  rows: RecipientRow[],
  sequential: boolean,
): RecipientChanges {
  const orders = signingOrders(rows, sequential);
  const changes: RecipientChanges = { insert: [], update: [], remove: [] };
  rows.forEach((row, i) => {
    const values = {
      name: row.name.trim(),
      email: row.email.trim().toLowerCase(),
      role: row.role,
      signing_order: orders[i]!,
    };
    const existing = row.id ? saved.find((s) => s.id === row.id) : undefined;
    if (!existing) changes.insert.push(values);
    else if (
      existing.name !== values.name ||
      (existing.email ?? '') !== values.email ||
      existing.role !== values.role ||
      existing.signingOrder !== values.signing_order
    ) {
      changes.update.push({ id: existing.id, ...values });
    }
  });
  changes.remove = saved.filter((s) => !rows.some((r) => r.id === s.id)).map((s) => s.id);
  return changes;
}
