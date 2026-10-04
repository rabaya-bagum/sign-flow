import { useCallback, useEffect, useRef, useState } from 'react';

import type { Field } from '@shared/fields';

import { saveFields } from './api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const AUTOSAVE_DELAY_MS = 800;

/**
 * Debounced autosave of the field set (SPEC §5.6). Saves `AUTOSAVE_DELAY_MS` after the last change;
 * `flush()` saves immediately (Save button, leaving the editor). Saves never overlap.
 */
export function useAutosave(documentId: string, fields: Field[], revision: number, enabled: boolean) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const latest = useRef({ fields, revision });
  const savedRevision = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    latest.current = { fields, revision };
  });

  const save = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current;
    const { fields: snapshot, revision: target } = latest.current;
    if (target === savedRevision.current) return true;
    setStatus('saving');
    const attempt = saveFields(documentId, snapshot);
    inFlight.current = attempt.then(
      () => undefined,
      () => undefined,
    );
    try {
      await attempt;
      savedRevision.current = target;
      setStatus(latest.current.revision === target ? 'saved' : 'saving');
      return true;
    } catch {
      setStatus('error');
      return false;
    } finally {
      inFlight.current = null;
    }
  }, [documentId]);

  useEffect(() => {
    if (!enabled || revision === savedRevision.current) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, revision, save]);

  /** Marks the loaded state as saved (nothing to write until the first edit). */
  const markLoaded = useCallback((loadedRevision: number) => {
    savedRevision.current = loadedRevision;
  }, []);

  return { status, flush: save, markLoaded };
}
