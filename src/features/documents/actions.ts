import type { DisplayStatus } from '@/theme';

/** The facts the action menu needs about a document, from either a list row or the details read. */
export interface ActionTarget {
  id: string;
  title: string;
  status: string;
  displayStatus: DisplayStatus;
  isOwner: boolean;
  uploadIncomplete: boolean;
  hidden: boolean;
}

export type DocumentActionKey =
  'open' | 'retryUpload' | 'rename' | 'share' | 'saveToDevice' | 'delete' | 'hide' | 'unhide';

/**
 * Allowed actions by status (SPEC §6.2). Void, duplicate and remind arrive in later phases and are
 * not offered at all (rather than shown disabled).
 */
export function availableActions(
  doc: ActionTarget,
  { includeOpen = true, canSave = false }: { includeOpen?: boolean; canSave?: boolean } = {},
): DocumentActionKey[] {
  const draft = doc.status === 'draft';
  const actions: DocumentActionKey[] = [];
  if (includeOpen) actions.push('open');
  if (draft && doc.isOwner && doc.uploadIncomplete) actions.push('retryUpload');
  if (draft && doc.isOwner) actions.push('rename');
  if (!doc.uploadIncomplete) {
    actions.push('share');
    if (canSave) actions.push('saveToDevice');
  }
  if (draft && doc.isOwner) actions.push('delete');
  if (!draft) actions.push(doc.hidden ? 'unhide' : 'hide');
  return actions;
}
