import type { Field } from '../fields';
import { firstActiveOrder, validateForSend, type SendRecipient } from '../send';

const signer = (id: string, email: string | null, order = 1): SendRecipient => ({
  id,
  name: id,
  email,
  role: 'signer',
  signingOrder: order,
});
const field = (id: string, recipientId: string, type: Field['type'] = 'signature'): Field => ({
  id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
  recipient_id: recipientId,
  page_number: 1,
  type,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.05,
  required: true,
  properties: type === 'text' ? { fontSize: 12, align: 'left', validation: 'none' } : {},
});
const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

describe('validateForSend', () => {
  it('passes a complete draft', () => {
    expect(
      validateForSend({ hasFile: true, recipients: [signer(R1, 'a@x.test')], fields: [field('1', R1)] }),
    ).toEqual([]);
  });

  it('reports every problem', () => {
    const issues = validateForSend({
      hasFile: false,
      recipients: [
        signer(R1, null),
        { id: R2, name: 'cc', email: 'A@x.test', role: 'cc', signingOrder: 1 },
        { id: 'r3', name: 'dup', email: 'a@x.test', role: 'signer', signingOrder: 2 },
      ],
      fields: [field('1', R2, 'text'), field('2', 'r3', 'text'), field('3', 'unknown')],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        { code: 'NO_FILE' },
        { code: 'MISSING_EMAIL', recipientId: R1 },
        { code: 'SIGNER_WITHOUT_SIGNATURE', recipientId: R1 },
        { code: 'FIELDS_FOR_NON_SIGNER', recipientId: R2 },
        { code: 'DUPLICATE_EMAIL', recipientId: 'r3' },
        { code: 'SIGNER_WITHOUT_SIGNATURE', recipientId: 'r3' },
        { code: 'INVALID_FIELD', fieldId: '00000000-0000-4000-8000-000000000003' },
      ]),
    );
  });

  it('needs at least one signer and valid emails', () => {
    expect(validateForSend({ hasFile: true, recipients: [], fields: [] })).toEqual([
      { code: 'NO_RECIPIENTS' },
    ]);
    expect(
      validateForSend({
        hasFile: true,
        recipients: [{ id: R2, name: 'c', email: 'c@x.test', role: 'cc', signingOrder: 1 }],
        fields: [],
      }),
    ).toEqual([{ code: 'NO_SIGNER' }]);
    expect(
      validateForSend({ hasFile: true, recipients: [signer(R1, 'not-an-email')], fields: [field('1', R1)] }),
    ).toEqual([{ code: 'INVALID_EMAIL', recipientId: R1 }]);
  });
});

describe('firstActiveOrder', () => {
  it('ignores CC recipients', () => {
    expect(
      firstActiveOrder([
        signer('a', 'a@x', 2),
        { id: 'c', name: 'c', email: 'c@x', role: 'cc', signingOrder: 1 },
      ]),
    ).toBe(2);
    expect(firstActiveOrder([])).toBeNull();
  });
});
