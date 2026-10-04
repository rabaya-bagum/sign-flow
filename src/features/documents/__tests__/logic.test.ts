import { availableActions, type ActionTarget } from '../actions';
import { toAppUrl } from '../download';
import { toRpcFilters } from '../filters';
import { countActiveFilters, EMPTY_FILTERS } from '../types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/functions', () => ({ invokeFunction: jest.fn() }));

// eslint-disable-next-line import/first
import { titleFromFileName } from '../api';

const base: ActionTarget = {
  id: 'd',
  title: 'T',
  status: 'draft',
  displayStatus: 'draft',
  isOwner: true,
  uploadIncomplete: false,
  hidden: false,
};

describe('availableActions (SPEC §6.2)', () => {
  it('owner draft with a file: open, rename, share, delete', () => {
    expect(availableActions(base)).toEqual(['open', 'rename', 'share', 'delete']);
  });

  it('owner draft without a file: retry instead of share', () => {
    expect(availableActions({ ...base, uploadIncomplete: true })).toEqual([
      'open',
      'retryUpload',
      'rename',
      'delete',
    ]);
  });

  it('sent documents can only be shared or removed from the library', () => {
    expect(availableActions({ ...base, status: 'in_progress', displayStatus: 'waiting' })).toEqual([
      'open',
      'share',
      'hide',
    ]);
    expect(
      availableActions({ ...base, status: 'completed', displayStatus: 'completed', hidden: true }),
    ).toEqual(['open', 'share', 'unhide']);
  });

  it('participants never get owner actions', () => {
    expect(
      availableActions({ ...base, status: 'in_progress', displayStatus: 'needs_signature', isOwner: false }),
    ).toEqual(['open', 'share', 'hide']);
  });

  it('adds Save to device when supported and can omit Open', () => {
    expect(availableActions(base, { includeOpen: false, canSave: true })).toEqual([
      'rename',
      'share',
      'saveToDevice',
      'delete',
    ]);
  });
});

describe('toRpcFilters', () => {
  const now = new Date('2026-10-03T12:00:00Z');

  it('omits empty filters', () => {
    expect(toRpcFilters(EMPTY_FILTERS, now)).toEqual({});
  });

  it('maps presets to ISO lower bounds and trims text', () => {
    expect(
      toRpcFilters({ created: '7d', modified: '12m', senderId: 'u1', recipient: '  aaliyah ' }, now),
    ).toEqual({
      created_from: '2026-09-26T12:00:00.000Z',
      modified_from: '2025-10-03T12:00:00.000Z',
      sender_id: 'u1',
      recipient: 'aaliyah',
    });
  });

  it('counts active filters', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters({ created: '30d', modified: 'any', senderId: 'x', recipient: ' ' })).toBe(2);
  });
});

describe('toAppUrl', () => {
  it('rebases internal signed URLs onto the app Supabase URL', () => {
    expect(
      toAppUrl(
        'http://kong:8000/storage/v1/object/sign/documents/a.pdf?token=t&download=a.pdf',
        'http://10.0.2.2:54321/',
      ),
    ).toBe('http://10.0.2.2:54321/storage/v1/object/sign/documents/a.pdf?token=t&download=a.pdf');
  });
});

describe('titleFromFileName', () => {
  it('drops the extension and normalizes whitespace', () => {
    expect(titleFromFileName('Mutual  NDA (final).pdf', 'Untitled')).toBe('Mutual NDA (final)');
    expect(titleFromFileName('.pdf', 'Untitled')).toBe('Untitled');
    expect(titleFromFileName('x'.repeat(300) + '.pdf', 'Untitled')).toHaveLength(200);
  });
});
