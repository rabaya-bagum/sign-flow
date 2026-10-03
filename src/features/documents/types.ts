import type { DisplayStatus } from '@/theme';

export const LIBRARY_BUCKETS = ['all', 'needs_signature', 'waiting', 'draft', 'completed', 'closed'] as const;
export type LibraryBucket = (typeof LIBRARY_BUCKETS)[number];

export const SORTS = ['newest', 'oldest', 'title'] as const;
export type DocumentSort = (typeof SORTS)[number];

export const DATE_PRESETS = ['any', '7d', '30d', '12m'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export interface DocumentFilters {
  created: DatePreset;
  modified: DatePreset;
  senderId: string | null;
  recipient: string;
}

export const EMPTY_FILTERS: DocumentFilters = {
  created: 'any',
  modified: 'any',
  senderId: null,
  recipient: '',
};

export interface DocumentListParams {
  bucket: LibraryBucket;
  search: string;
  sort: DocumentSort;
  filters: DocumentFilters;
}

export interface Participant {
  name: string;
  email: string;
}

export interface DocumentListItem {
  id: string;
  title: string;
  displayStatus: DisplayStatus;
  status: string;
  createdAt: string;
  updatedAt: string;
  fileSizeBytes: number | null;
  pageCount: number | null;
  ownerId: string;
  ownerName: string | null;
  participants: Participant[];
  participantCount: number;
  signersTotal: number;
  signersCompleted: number;
  uploadIncomplete: boolean;
  cursorValue: string;
}

export interface DocumentPage {
  items: DocumentListItem[];
  nextCursor: { value: string; id: string } | null;
}

export interface DocumentDetail {
  id: string;
  title: string;
  displayStatus: DisplayStatus;
  status: string;
  ownerId: string;
  ownerName: string | null;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  fileSizeBytes: number | null;
  pageCount: number | null;
  uploadIncomplete: boolean;
  hidden: boolean;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'approver' | 'viewer' | 'cc';
  signingOrder: number;
  status: 'pending' | 'sent' | 'viewed' | 'signed' | 'approved' | 'declined';
  userId: string | null;
  lastActionAt: string | null;
}

export interface SearchResult {
  id: string;
  title: string;
  displayStatus: DisplayStatus;
  updatedAt: string;
  matchedRecipientName: string | null;
  matchedRecipientEmail: string | null;
}

export function countActiveFilters(f: DocumentFilters): number {
  return [f.created !== 'any', f.modified !== 'any', f.senderId !== null, f.recipient.trim() !== ''].filter(
    Boolean,
  ).length;
}
