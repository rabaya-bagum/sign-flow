import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { Field } from '@shared/fields';

import { saveFields } from './api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const AUTOSAVE_DELAY_MS = 800;

/**
 * Debounced autosave of the field set (SPEC §5.6). Saves `AUTOSAVE_DELAY_MS` after the last change;
 * `flush()` saves immediately (Save/Next, leaving the editor). Saves never overlap. The status reads
 * "saving" from the moment there are unsaved changes, so "saved" always means everything is stored.
 */
export function useAutosave(documentId: string, fields: Field[], revision: number, enabled: boolean) {
  const [savedRevision, setSavedRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  const [touched, setTouched] = useState(false);
  const latest = useRef({ fields, revision });
  const savedRef = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    latest.current = { fields, revision };
  });

  const save = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current;
    const { fields: snapshot, revision: target } = latest.current;
    if (target === savedRef.current) return true;
    setTouched(true);
    const attempt = saveFields(documentId, snapshot);
    inFlight.current = attempt.then(
      () => undefined,
      () => undefined,
    );
    try {
      await attempt;
      savedRef.current = target;
      setSavedRevision(target);
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      inFlight.current = null;
    }
  }, [documentId]);

  useEffect(() => {
    if (!enabled || revision === savedRef.current) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, revision, save]);

  const dirty = enabled && revision !== savedRevision;

  // Web: warn before closing or reloading the tab with unsaved changes.
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      void save();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, save]);

  /** Marks a revision as already stored (e.g. after a server-side cascade). */
  const markLoaded = useCallback((loadedRevision: number) => {
    savedRef.current = loadedRevision;
    setSavedRevision(loadedRevision);
  }, []);

  const status: SaveStatus = failed && dirty ? 'error' : dirty ? 'saving' : touched ? 'saved' : 'idle';
  return { status, flush: save, markLoaded };
}
