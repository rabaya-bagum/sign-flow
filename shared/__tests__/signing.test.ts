import type { Field } from '../fields';
import {
  formatDateSigned,
  initialEntries,
  nextIncompleteField,
  normalizeValue,
  orderFields,
  requiredProgress,
  safeTimeZone,
  validateSubmission,
} from '../signing';

let n = 0;
function field(partial: Partial<Field> & Pick<Field, 'type'>): Field {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    recipient_id: '10000000-0000-4000-8000-000000000001',
    page_number: 1,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.05,
    required: true,
    properties: {},
    ...partial,
  };
}

describe('normalizeValue', () => {
  it('trims and accepts valid values per type', () => {
    expect(normalizeValue(field({ type: 'full_name' }), '  Ada Lovelace ')).toEqual({
      value: 'Ada Lovelace',
    });
    expect(normalizeValue(field({ type: 'email' }), 'ada@example.com')).toEqual({ value: 'ada@example.com' });
    expect(normalizeValue(field({ type: 'checkbox' }), 'true')).toEqual({ value: 'true' });
    expect(normalizeValue(field({ type: 'checkbox' }), '')).toEqual({ value: 'false' });
    expect(normalizeValue(field({ type: 'signature' }), 'anything')).toEqual({ value: null });
  });

  it('rejects malformed values', () => {
    expect(normalizeValue(field({ type: 'email' }), 'not-an-email')).toEqual({ issue: 'INVALID' });
    expect(normalizeValue(field({ type: 'checkbox' }), 'yes')).toEqual({ issue: 'INVALID' });
    expect(normalizeValue(field({ type: 'full_name' }), 'x'.repeat(501))).toEqual({ issue: 'INVALID' });
  });

  it('applies dropdown options and text validation', () => {
    const dropdown = field({ type: 'dropdown', properties: { options: ['Red', 'Blue'] } });
    expect(normalizeValue(dropdown, 'Blue')).toEqual({ value: 'Blue' });
    expect(normalizeValue(dropdown, 'Green')).toEqual({ issue: 'INVALID' });

    const number = field({ type: 'text', properties: { fontSize: 12, align: 'left', validation: 'number' } });
    expect(normalizeValue(number, '42.5')).toEqual({ value: '42.5' });
    expect(normalizeValue(number, 'forty')).toEqual({ issue: 'INVALID' });

    const zip = field({
      type: 'text',
      properties: { fontSize: 12, align: 'left', validation: { regex: '\\d{5}' } },
    });
    expect(normalizeValue(zip, '12345')).toEqual({ value: '12345' });
    expect(normalizeValue(zip, '123456')).toEqual({ issue: 'INVALID' }); // anchored

    const short = field({
      type: 'text',
      properties: { fontSize: 12, align: 'left', validation: 'none', maxLength: 3 },
    });
    expect(normalizeValue(short, 'abcd')).toEqual({ issue: 'INVALID' });
  });
});

describe('progress, next field and validation', () => {
  const signature = field({ type: 'signature', page_number: 2, y: 0.8 });
  const name = field({ type: 'full_name', page_number: 1, y: 0.5 });
  const optional = field({
    type: 'text',
    required: false,
    page_number: 1,
    y: 0.2,
    properties: { fontSize: 12, align: 'left', validation: 'none' },
  });
  const date = field({ type: 'date_signed', page_number: 2, y: 0.9, properties: { format: 'MMM d, yyyy' } });
  const radioA = field({
    type: 'radio',
    page_number: 1,
    y: 0.6,
    properties: { groupId: 'g', optionValue: 'A' },
  });
  const radioB = field({
    type: 'radio',
    page_number: 1,
    y: 0.7,
    properties: { groupId: 'g', optionValue: 'B' },
  });
  const fields = [signature, name, optional, date, radioA, radioB];

  it('counts required items, with a radio group as one and the date as automatic', () => {
    expect(requiredProgress(fields, {})).toEqual({ done: 0, total: 3 });
    expect(requiredProgress(fields, { [name.id]: { value: 'Ada' }, [radioB.id]: { value: 'true' } })).toEqual(
      {
        done: 2,
        total: 3,
      },
    );
  });

  it('finds the next incomplete required field in reading order, wrapping around', () => {
    expect(nextIncompleteField(fields, {})?.id).toBe(name.id);
    expect(nextIncompleteField(fields, {}, name.id)?.id).toBe(radioA.id);
    expect(nextIncompleteField(fields, {}, signature.id)?.id).toBe(name.id);
    expect(
      nextIncompleteField(fields, {
        [name.id]: { value: 'Ada' },
        [radioA.id]: { value: 'true' },
        [signature.id]: { hasImage: true },
      }),
    ).toBeNull();
  });

  it('reports missing, invalid, foreign and conflicting entries', () => {
    expect(validateSubmission(fields, {})).toEqual([
      { fieldId: name.id, code: 'REQUIRED' },
      { fieldId: radioA.id, code: 'REQUIRED' },
      { fieldId: signature.id, code: 'REQUIRED' },
    ]);
    const issues = validateSubmission(fields, {
      [name.id]: { value: 'Ada' },
      [radioA.id]: { value: 'true' },
      [radioB.id]: { value: 'true' },
      [signature.id]: { hasImage: true },
      'not-mine': { value: 'x' },
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        { fieldId: 'not-mine', code: 'INVALID' },
        { fieldId: radioA.id, code: 'INVALID' },
        { fieldId: radioB.id, code: 'INVALID' },
      ]),
    );
    expect(
      validateSubmission(fields, {
        [name.id]: { value: 'Ada' },
        [radioA.id]: { value: 'true' },
        [signature.id]: { hasImage: true },
      }),
    ).toEqual([]);
  });

  it('orders fields by page, then top, then left', () => {
    expect(orderFields(fields).map((f) => f.id)).toEqual([
      optional.id,
      name.id,
      radioA.id,
      radioB.id,
      signature.id,
      date.id,
    ]);
  });

  it('prefills name, email, defaults and default-checked boxes', () => {
    const email = field({ type: 'email', properties: { fontSize: 12, align: 'left' } });
    const box = field({ type: 'checkbox', properties: { defaultChecked: true } });
    const text = field({ type: 'text', properties: { fontSize: 12, align: 'left', defaultValue: 'N/A' } });
    expect(initialEntries([name, email, box, text], { name: 'Ada', email: 'ada@example.com' })).toEqual({
      [name.id]: { value: 'Ada' },
      [email.id]: { value: 'ada@example.com' },
      [box.id]: { value: 'true' },
      [text.id]: { value: 'N/A' },
    });
  });
});

describe('formatDateSigned', () => {
  const date = new Date('2026-03-05T23:30:00Z');
  it('formats in each supported format', () => {
    expect(formatDateSigned(date, 'MMM d, yyyy')).toBe('Mar 5, 2026');
    expect(formatDateSigned(date, 'yyyy-MM-dd')).toBe('2026-03-05');
    expect(formatDateSigned(date, 'dd/MM/yyyy')).toBe('05/03/2026');
  });
  it("uses the signer's time zone", () => {
    expect(formatDateSigned(date, 'yyyy-MM-dd', 'Asia/Dhaka')).toBe('2026-03-06');
    expect(formatDateSigned(date, 'yyyy-MM-dd', 'Not/AZone')).toBe('2026-03-05');
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
  });
});
