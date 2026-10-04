import {
  defaultProperties,
  defaultRequired,
  FIELD_SIZES,
  FIELD_TYPES,
  fieldPropertiesSchemas,
  fieldSchema,
} from '../fields';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  recipient_id: '22222222-2222-4222-8222-222222222222',
  page_number: 1,
  type: 'signature' as const,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.05,
  required: true,
  properties: {},
};

describe('fields', () => {
  it('has defaults that validate for every type', () => {
    for (const type of FIELD_TYPES) {
      expect(fieldPropertiesSchemas[type].safeParse(defaultProperties(type)).success).toBe(true);
      expect(FIELD_SIZES[type].width).toBeGreaterThanOrEqual(FIELD_SIZES[type].minWidth);
    }
    expect(defaultProperties('text')).toEqual({ fontSize: 12, align: 'left', validation: 'none' });
    expect(defaultProperties('date_signed')).toEqual({ format: 'MMM d, yyyy' });
    expect(defaultRequired('checkbox')).toBe(false);
    expect(defaultRequired('signature')).toBe(true);
  });

  it('accepts a valid field and rejects geometry past the page', () => {
    expect(fieldSchema.safeParse(base).success).toBe(true);
    expect(fieldSchema.safeParse({ ...base, x: 0.8 }).success).toBe(false);
    expect(fieldSchema.safeParse({ ...base, height: 0 }).success).toBe(false);
  });

  it('validates properties per type', () => {
    expect(fieldSchema.safeParse({ ...base, type: 'text', properties: { fontSize: 13 } }).success).toBe(
      false,
    );
    expect(
      fieldSchema.safeParse({ ...base, type: 'text', properties: { validation: { regex: '(' } } }).success,
    ).toBe(false);
    expect(
      fieldSchema.safeParse({ ...base, type: 'text', properties: { validation: { regex: '^[0-9]{5}$' } } })
        .success,
    ).toBe(true);
    expect(fieldSchema.safeParse({ ...base, type: 'dropdown', properties: { options: [] } }).success).toBe(
      false,
    );
    expect(fieldSchema.safeParse({ ...base, type: 'radio', properties: { groupId: 'g' } }).success).toBe(
      false,
    );
  });
});
