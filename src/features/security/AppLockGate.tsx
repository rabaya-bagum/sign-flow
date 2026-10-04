import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components';
import { signOut } from '@/features/auth/api';
import { useTheme } from '@/theme';

import { authenticate, LOCK_AFTER_MS, useAppLockStore } from './appLock';

/**
 * Covers the signed-in app until the user passes biometrics, at launch and after LOCK_AFTER_MS in the
 * background. The app underneath keeps its state but is hidden from screen readers while locked.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const enabled = useAppLockStore((s) => s.enabled) && Platform.OS !== 'web';
  // The setting is read from storage asynchronously; show nothing until it is known.
  const [hydrated, setHydrated] = useState(() => useAppLockStore.persist.hasHydrated());
  const [lockRequested, setLocked] = useState(
    () => useAppLockStore.persist.hasHydrated() && useAppLockStore.getState().enabled,
  );
  const locked = enabled && lockRequested;
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(() => {
    if (prompting.current) return;
    prompting.current = true;
    void authenticate(t('appLock.prompt'), t('common.cancel')).then((ok) => {
      prompting.current = false;
      if (ok) setLocked(false);
    });
  }, [t]);

  useEffect(() => {
    if (useAppLockStore.persist.hasHydrated()) return;
    return useAppLockStore.persist.onFinishHydration((state) => {
      setLocked(state.enabled);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current !== null) {
        if (Date.now() - backgroundedAt.current >= LOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);

  // Ask straight away whenever the lock appears.
  useEffect(() => {
    if (locked) unlock();
  }, [locked, unlock]);

  if (!hydrated) return <View style={[styles.fill, { backgroundColor: theme.colors.background }]} />;

  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={locked}
      >
        {children}
      </View>
      {locked ? (
        <View
          style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: theme.colors.background }]}
          accessibilityViewIsModal
          testID="app-lock"
        >
          <AppText variant="title2" accessibilityRole="header">
            {t('appLock.title')}
          </AppText>
          <AppText color="textSecondary" style={styles.body}>
            {t('appLock.body')}
          </AppText>
          <AppButton title={t('appLock.unlock')} onPress={unlock} testID="app-lock-unlock" />
          <AppButton title={t('account.logout')} variant="ghost" onPress={() => void signOut()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lock: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  body: { textAlign: 'center', marginBottom: 12 },
});
