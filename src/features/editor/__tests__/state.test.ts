import type { Field } from '@shared/fields';

import { editorReducer, initialEditorState, newField, type EditorState } from '../state';

const rect = { x: 0.1, y: 0.1, width: 0.2, height: 0.05 };
const field = (id: string, overrides: Partial<Field> = {}): Field =>
  newField({
    id,
    type: 'signature',
    recipientId: 'r1',
    page: 1,
    rect,
    existing: [],
    ...overrides,
  } as never) as Field;

function run(...actions: Parameters<typeof editorReducer>[1][]): EditorState {
  return actions.reduce(editorReducer, initialEditorState);
}

describe('editorReducer', () => {
  it('places, moves and selects fields', () => {
    const s = run(
      { type: 'place', field: field('a') },
      { type: 'setRect', id: 'a', rect: { ...rect, x: 0.5 } },
    );
    expect(s.fields).toHaveLength(1);
    expect(s.fields[0]!.x).toBe(0.5);
    expect(s.selectedId).toBe('a');
    expect(s.revision).toBe(2);
  });

  it('ignores no-op moves (no history entry, no autosave)', () => {
    const s = run({ type: 'place', field: field('a') }, { type: 'setRect', id: 'a', rect });
    expect(s.past).toHaveLength(1);
    expect(s.revision).toBe(1);
  });

  it('undoes and redoes', () => {
    let s = run(
      { type: 'place', field: field('a') },
      { type: 'setRect', id: 'a', rect: { ...rect, x: 0.5 } },
      { type: 'delete', id: 'a' },
    );
    expect(s.fields).toEqual([]);
    expect(s.selectedId).toBeNull();
    s = editorReducer(s, { type: 'undo' });
    expect(s.fields[0]!.x).toBe(0.5);
    s = editorReducer(s, { type: 'undo' });
    expect(s.fields[0]!.x).toBe(0.1);
    s = editorReducer(s, { type: 'redo' });
    expect(s.fields[0]!.x).toBe(0.5);
    // A new change clears the redo stack.
    s = editorReducer(s, { type: 'update', id: 'a', patch: { required: false } });
    expect(s.future).toEqual([]);
    expect(editorReducer(s, { type: 'redo' })).toBe(s);
  });

  it('duplicates with an offset that stays on the page', () => {
    const s = run(
      { type: 'place', field: field('a', { rect: { x: 0.79, y: 0.94, width: 0.2, height: 0.05 } } as never) },
      { type: 'duplicate', id: 'a', newId: 'b' },
    );
    const copy = s.fields.find((f) => f.id === 'b')!;
    expect(copy.x + copy.width).toBeLessThanOrEqual(1);
    expect(copy.y + copy.height).toBeLessThanOrEqual(1);
    expect(s.selectedId).toBe('b');
  });

  it('drops a removed recipient’s fields everywhere, including history', () => {
    const s = run(
      { type: 'place', field: field('a') },
      { type: 'place', field: { ...field('b'), recipient_id: 'r2' } },
      { type: 'recipientRemoved', recipientId: 'r2' },
    );
    expect(s.fields.map((f) => f.id)).toEqual(['a']);
    expect(editorReducer(s, { type: 'undo' }).fields.every((f) => f.recipient_id === 'r1')).toBe(true);
  });
});

describe('newField', () => {
  it('uses type defaults', () => {
    const f = newField({ id: 'x', type: 'checkbox', recipientId: 'r1', page: 2, rect, existing: [] });
    expect(f).toMatchObject({ page_number: 2, required: false, properties: {} });
    expect(
      newField({ id: 'y', type: 'text', recipientId: 'r1', page: 1, rect, existing: [] }).properties,
    ).toEqual({
      fontSize: 12,
      align: 'left',
      validation: 'none',
    });
  });

  it('adds radios to the recipient’s current group with the next option', () => {
    const first = newField({ id: '1', type: 'radio', recipientId: 'r1', page: 1, rect, existing: [] });
    const second = newField({ id: '2', type: 'radio', recipientId: 'r1', page: 1, rect, existing: [first] });
    expect(first.properties).toEqual({ groupId: 'group-1', optionValue: 'Option 1' });
    expect(second.properties).toEqual({ groupId: 'group-1', optionValue: 'Option 2' });
    const other = newField({
      id: '3',
      type: 'radio',
      recipientId: 'r2',
      page: 1,
      rect,
      existing: [first, second],
    });
    expect(other.properties).toEqual({ groupId: 'group-3', optionValue: 'Option 1' });
  });
});
