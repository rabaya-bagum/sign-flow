import { diffRecipients, isSequential, move, signingOrders, validateRows, type RecipientRow } from '../logic';

const row = (key: string, overrides: Partial<RecipientRow> = {}): RecipientRow => ({
  key,
  name: key.toUpperCase(),
  email: `${key}@x.test`,
  role: 'signer',
  ...overrides,
});

describe('recipients logic', () => {
  it('assigns one group per signer when sequential; CCs share the previous group', () => {
    const rows = [row('a'), row('c', { role: 'cc' }), row('b'), row('d', { role: 'approver' })];
    expect(signingOrders(rows, true)).toEqual([1, 1, 2, 3]);
    expect(signingOrders(rows, false)).toEqual([1, 1, 1, 1]);
  });

  it('detects sequential order from saved data', () => {
    expect(
      isSequential([
        { id: '1', name: 'a', email: null, role: 'signer', signingOrder: 1 },
        { id: '2', name: 'b', email: null, role: 'signer', signingOrder: 2 },
      ]),
    ).toBe(true);
    expect(
      isSequential([
        { id: '1', name: 'a', email: null, role: 'signer', signingOrder: 1 },
        { id: '2', name: 'c', email: null, role: 'cc', signingOrder: 2 },
      ]),
    ).toBe(false);
  });

  it('validates names and emails, case-insensitively unique', () => {
    expect(
      validateRows([
        row('a'),
        row('b', { email: 'A@X.test' }),
        row('c', { name: ' ', email: 'nope' }),
        row('d', { email: '' }),
      ]),
    ).toEqual({
      b: { email: 'duplicate' },
      c: { name: 'required', email: 'invalid' },
      d: { email: 'required' },
    });
  });

  it('moves rows within bounds', () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it('diffs against the saved recipients', () => {
    const saved = [
      { id: 's1', name: 'A', email: 'a@x.test', role: 'signer' as const, signingOrder: 1 },
      { id: 's2', name: 'Signer 2', email: null, role: 'signer' as const, signingOrder: 1 },
      { id: 's3', name: 'Gone', email: 'g@x.test', role: 'cc' as const, signingOrder: 1 },
    ];
    const rows = [
      row('s2', { id: 's2', name: 'Sam', email: 'Sam@X.test' }),
      row('s1', { id: 's1', name: 'A', email: 'a@x.test' }),
      row('n', { name: 'New ', email: 'n@x.test' }),
    ];
    expect(diffRecipients(saved, rows, true)).toEqual({
      insert: [{ name: 'New', email: 'n@x.test', role: 'signer', signing_order: 3 }],
      update: [
        { id: 's2', name: 'Sam', email: 'sam@x.test', role: 'signer', signing_order: 1 },
        { id: 's1', name: 'A', email: 'a@x.test', role: 'signer', signing_order: 2 },
      ],
      remove: ['s3'],
    });
    expect(
      diffRecipients(saved.slice(0, 1), [row('s1', { id: 's1', name: 'A', email: 'a@x.test' })], false),
    ).toEqual({ insert: [], update: [], remove: [] });
  });
});
