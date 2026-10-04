import type { FractionalRect } from '@shared/geometry';
import { defaultProperties, defaultRequired, type Field, type FieldType } from '@shared/fields';

/**
 * Field editor state (SPEC §5.6): the document's fields, the selection and an undo/redo history.
 * Pure reducer; the screen persists `fields` with debounced autosave.
 */
export interface EditorState {
  fields: Field[];
  selectedId: string | null;
  past: Field[][];
  future: Field[][];
  /** Increments on every change to `fields` (autosave trigger). */
  revision: number;
}

export type EditorAction =
  | { type: 'load'; fields: Field[] }
  | { type: 'place'; field: Field }
  | { type: 'setRect'; id: string; rect: FractionalRect }
  | { type: 'update'; id: string; patch: Partial<Pick<Field, 'recipient_id' | 'required' | 'properties'>> }
  | { type: 'delete'; id: string }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'recipientRemoved'; recipientId: string };

const HISTORY_LIMIT = 50;

export const initialEditorState: EditorState = {
  fields: [],
  selectedId: null,
  past: [],
  future: [],
  revision: 0,
};

function commit(state: EditorState, fields: Field[], selectedId = state.selectedId): EditorState {
  return {
    fields,
    selectedId,
    past: [...state.past, state.fields].slice(-HISTORY_LIMIT),
    future: [],
    revision: state.revision + 1,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return { ...initialEditorState, fields: action.fields };
    case 'place':
      return commit(state, [...state.fields, action.field], action.field.id);
    case 'setRect': {
      const field = state.fields.find((f) => f.id === action.id);
      if (!field) return state;
      const { x, y, width, height } = action.rect;
      if (field.x === x && field.y === y && field.width === width && field.height === height) return state;
      return commit(
        state,
        state.fields.map((f) => (f.id === action.id ? { ...f, x, y, width, height } : f)),
      );
    }
    case 'update':
      if (!state.fields.some((f) => f.id === action.id)) return state;
      return commit(
        state,
        state.fields.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      );
    case 'delete':
      if (!state.fields.some((f) => f.id === action.id)) return state;
      return commit(
        state,
        state.fields.filter((f) => f.id !== action.id),
        state.selectedId === action.id ? null : state.selectedId,
      );
    case 'duplicate': {
      const field = state.fields.find((f) => f.id === action.id);
      if (!field) return state;
      // Offset the copy slightly down-right, keeping it on the page.
      const x = Math.min(field.x + 0.02, 1 - field.width);
      const y = Math.min(field.y + 0.02, 1 - field.height);
      return commit(state, [...state.fields, { ...field, id: action.newId, x, y }], action.newId);
    }
    case 'select':
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        fields: previous,
        selectedId: previous.some((f) => f.id === state.selectedId) ? state.selectedId : null,
        past: state.past.slice(0, -1),
        future: [state.fields, ...state.future],
        revision: state.revision + 1,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        fields: next,
        selectedId: next.some((f) => f.id === state.selectedId) ? state.selectedId : null,
        past: [...state.past, state.fields],
        future: state.future.slice(1),
        revision: state.revision + 1,
      };
    }
    case 'recipientRemoved':
      // The database cascades; mirror it without an undo step (the recipient is gone).
      return {
        ...state,
        fields: state.fields.filter((f) => f.recipient_id !== action.recipientId),
        past: state.past.map((fields) => fields.filter((f) => f.recipient_id !== action.recipientId)),
        future: state.future.map((fields) => fields.filter((f) => f.recipient_id !== action.recipientId)),
        revision: state.revision + 1,
      };
  }
}

/** A new field of `type` with default properties; radios join the recipient's latest radio group. */
export function newField(params: {
  id: string;
  type: FieldType;
  recipientId: string;
  page: number;
  rect: FractionalRect;
  existing: Field[];
}): Field {
  const { id, type, recipientId, page, rect, existing } = params;
  let properties = defaultProperties(type);
  if (type === 'radio') {
    const radios = existing.filter((f) => f.type === 'radio' && f.recipient_id === recipientId);
    const last = radios[radios.length - 1];
    const groupId =
      (last?.properties.groupId as string | undefined) ??
      `group-${existing.filter((f) => f.type === 'radio').length + 1}`;
    const inGroup = radios.filter((f) => f.properties.groupId === groupId).length;
    properties = defaultProperties('radio', { groupId, optionValue: `Option ${inGroup + 1}` });
  }
  return {
    id,
    recipient_id: recipientId,
    page_number: page,
    type,
    ...rect,
    required: defaultRequired(type),
    properties,
  };
}
