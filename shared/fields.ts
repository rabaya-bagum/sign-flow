import { z } from 'zod';

/**
 * Field definitions shared by the editor (Phase 4), send-document (Phase 5) and signing/flattening
 * (Phase 6). SPEC §1.2, §5.6, §8 (`document_fields.properties`).
 */

export const FIELD_TYPES = [
  'signature',
  'initials',
  'full_name',
  'email',
  'date_signed',
  'text',
  'checkbox',
  'radio',
  'dropdown',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Toolbar order: MUST types first, then SHOULD (SPEC §1.2). `stamp` is LATER and not offered. */
export const MUST_FIELD_TYPES: readonly FieldType[] = [
  'signature',
  'initials',
  'full_name',
  'date_signed',
  'text',
  'checkbox',
];
export const SHOULD_FIELD_TYPES: readonly FieldType[] = ['email', 'radio', 'dropdown'];

/** Default and minimum sizes in displayed points (converted to page fractions when placed). */
export const FIELD_SIZES: Record<
  FieldType,
  { width: number; height: number; minWidth: number; minHeight: number }
> = {
  signature: { width: 150, height: 42, minWidth: 60, minHeight: 20 },
  initials: { width: 64, height: 36, minWidth: 24, minHeight: 18 },
  full_name: { width: 160, height: 24, minWidth: 40, minHeight: 14 },
  email: { width: 180, height: 24, minWidth: 40, minHeight: 14 },
  date_signed: { width: 110, height: 24, minWidth: 40, minHeight: 14 },
  text: { width: 160, height: 24, minWidth: 30, minHeight: 14 },
  checkbox: { width: 18, height: 18, minWidth: 10, minHeight: 10 },
  radio: { width: 18, height: 18, minWidth: 10, minHeight: 10 },
  dropdown: { width: 140, height: 24, minWidth: 40, minHeight: 14 },
};

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24] as const;
export const DATE_FORMATS = ['MMM d, yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy'] as const;

const align = z.enum(['left', 'center', 'right']);
const fontSize = z.literal(FONT_SIZES);
const textLike = z.object({ fontSize: fontSize.default(12), align: align.default('left') });

export const textValidationSchema = z.union([
  z.enum(['none', 'email', 'number']),
  z.object({ regex: z.string().min(1).max(200) }).refine((v) => {
    try {
      new RegExp(v.regex);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid regular expression'),
]);

export const fieldPropertiesSchemas = {
  signature: z.object({}),
  initials: z.object({}),
  full_name: textLike,
  email: textLike,
  date_signed: z.object({ format: z.enum(DATE_FORMATS).default('MMM d, yyyy') }),
  text: textLike.extend({
    placeholder: z.string().max(100).optional(),
    defaultValue: z.string().max(500).optional(),
    validation: textValidationSchema.default('none'),
    maxLength: z.number().int().min(1).max(2000).optional(),
  }),
  checkbox: z.object({ defaultChecked: z.boolean().optional() }),
  radio: z.object({ groupId: z.string().min(1).max(64), optionValue: z.string().min(1).max(100) }),
  dropdown: z.object({
    options: z.array(z.string().min(1).max(100)).min(1).max(50),
    defaultValue: z.string().max(100).optional(),
  }),
} satisfies Record<FieldType, z.ZodType>;

export type FieldProperties<T extends FieldType = FieldType> = z.output<(typeof fieldPropertiesSchemas)[T]>;

const fraction = z.number().min(0).max(1);

/** One field as saved by `save_document_fields` (and read back from `document_fields`). */
export const fieldSchema = z
  .object({
    id: z.uuid(),
    recipient_id: z.uuid(),
    page_number: z.number().int().min(1),
    type: z.enum(FIELD_TYPES),
    x: fraction,
    y: fraction,
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
    required: z.boolean(),
    properties: z.record(z.string(), z.unknown()),
  })
  .refine((f) => f.x + f.width <= 1 + 1e-6 && f.y + f.height <= 1 + 1e-6, 'Field extends past the page')
  .superRefine((f, ctx) => {
    const result = fieldPropertiesSchemas[f.type].safeParse(f.properties);
    if (!result.success)
      ctx.addIssue({ code: 'custom', message: `Invalid ${f.type} properties`, path: ['properties'] });
  });
export type Field = z.output<typeof fieldSchema>;

/** Default properties for a new field of this type. */
export function defaultProperties(
  type: FieldType,
  context: { groupId?: string; optionValue?: string } = {},
): Record<string, unknown> {
  switch (type) {
    case 'radio':
      return { groupId: context.groupId ?? 'group-1', optionValue: context.optionValue ?? 'Option 1' };
    case 'dropdown':
      return { options: ['Option 1', 'Option 2'] };
    default:
      return fieldPropertiesSchemas[type].parse({}) as Record<string, unknown>;
  }
}

/** Checkboxes are optional by default; everything else is required. */
export function defaultRequired(type: FieldType): boolean {
  return type !== 'checkbox';
}

/** Signature-type fields: a signer needs at least one of these to be sendable (SPEC §5.3). */
export function isSignatureField(type: FieldType): boolean {
  return type === 'signature';
}
