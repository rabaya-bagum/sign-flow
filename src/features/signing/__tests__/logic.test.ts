import type { Field } from '@shared/fields';

import { bytesToBase64 } from '@/lib/base64';
import {
  adopt,
  applyImage,
  buildOverlays,
  canFinish,
  EMPTY_VALUES,
  fieldAt,
  setValue,
  toggleChoice,
  toSubmission,
} from '../logic';

const base = { recipient_id: 'r1', page_number: 1, width: 0.2, height: 0.05, required: true, properties: {} };
const sig = { ...base, id: 'f-sig', type: 'signature', x: 0.1, y: 0.1 } as Field;
const sig2 = { ...base, id: 'f-sig2', type: 'signature', x: 0.1, y: 0.5, page_number: 2 } as Field;
const name = {
  ...base,
  id: 'f-name',
  type: 'full_name',
  x: 0.5,
  y: 0.1,
  properties: { fontSize: 12, align: 'left' },
} as Field;
const radioA = {
  ...base,
  id: 'f-a',
  type: 'radio',
  x: 0.1,
  y: 0.3,
  properties: { groupId: 'g', optionValue: 'A' },
} as Field;
const radioB = {
  ...base,
  id: 'f-b',
  type: 'radio',
  x: 0.4,
  y: 0.3,
  properties: { groupId: 'g', optionValue: 'B' },
} as Field;
const box = { ...base, id: 'f-box', type: 'checkbox', required: false, x: 0.1, y: 0.7 } as Field;
const fields = [sig, sig2, name, radioA, radioB, box];
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

it('encodes base64 like the standard alphabet', () => {
  expect(bytesToBase64(new TextEncoder().encode('Man'))).toBe('TWFu');
  expect(bytesToBase64(new TextEncoder().encode('Ma'))).toBe('TWE=');
  expect(bytesToBase64(new TextEncoder().encode('M'))).toBe('TQ==');
});

it('finds the field under a tap on the right page', () => {
  expect(fieldAt(fields, { page: 1, x: 0.15, y: 0.12 })?.id).toBe('f-sig');
  expect(fieldAt(fields, { page: 2, x: 0.15, y: 0.12 })).toBeNull();
  expect(fieldAt(fields, { page: 2, x: 0.2, y: 0.52 })?.id).toBe('f-sig2');
});

it('radio choices are exclusive within a group; checkboxes toggle', () => {
  let v = toggleChoice(EMPTY_VALUES, radioA, fields);
  v = toggleChoice(v, radioB, fields);
  expect(v.entries['f-a']?.value).toBe('false');
  expect(v.entries['f-b']?.value).toBe('true');
  v = toggleChoice(v, box, fields);
  v = toggleChoice(v, box, fields);
  expect(v.entries['f-box']?.value).toBe('false');
});

it('an adopted signature fills fields and is sent once', () => {
  const image = adopt(png);
  let v = applyImage(EMPTY_VALUES, sig, image);
  v = applyImage(v, sig2, image);
  v = setValue(v, name, 'Ada Lovelace');
  expect(canFinish(fields, v)).toBe(false); // radio group still required
  v = toggleChoice(v, radioA, fields);
  expect(canFinish(fields, v)).toBe(true);

  const submission = toSubmission(fields, v, 'Europe/London');
  expect(submission.assets).toEqual({ signature: bytesToBase64(png) });
  expect(submission.values).toEqual(
    expect.arrayContaining([
      { field_id: 'f-sig', asset: 'signature' },
      { field_id: 'f-sig2', asset: 'signature' },
      { field_id: 'f-name', value: 'Ada Lovelace' },
      { field_id: 'f-a', value: 'true' },
      { field_id: 'f-b', value: 'false' },
    ]),
  );
  expect(submission.timezone).toBe('Europe/London');
});

it('overlays: earlier values first, then own fields highlighted until filled', () => {
  const v = applyImage(EMPTY_VALUES, sig, adopt(png));
  const overlays = buildOverlays(
    [sig, name],
    [
      {
        id: 'o1',
        page_number: 1,
        x: 0,
        y: 0,
        width: 0.1,
        height: 0.1,
        type: 'signature',
        text: null,
        image: 'data:image/png;base64,AA',
      },
      {
        id: 'o2',
        page_number: 1,
        x: 0,
        y: 0.2,
        width: 0.1,
        height: 0.1,
        type: 'text',
        text: 'Hello',
        image: null,
      },
    ],
    v,
    { required: '#2B59D9', optional: '#888888', fill: '#FFF4D6E6', filledFill: '#FFFFFF00' },
    (f) => `text:${f.type}`,
    (f) => `label:${f.type}`,
  );
  expect(overlays.map((o) => [o.id, o.kind])).toEqual([
    ['filled-o1', 'image'],
    ['filled-o2', 'rect'],
    ['f-sig', 'image'],
    ['f-name', 'rect'],
  ]);
  expect(overlays[3]).toMatchObject({ color: '#2B59D9', fill: '#FFF4D6E6', text: 'text:full_name' });
});
