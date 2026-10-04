import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BottomSheet, ErrorState, IconButton } from '@/components';
import { shareDocument } from '@/features/documents/download';
import { useDocument, useViewUrl } from '@/features/documents/hooks';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { queryKeys } from '@/lib/queryKeys';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { PdfSurface } from './PdfSurface';
import type { PdfSurfaceError, PdfSurfaceHandle } from './types';

const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > current + 0.01) ?? 4;
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.01) ?? 1;
}

/** Full-screen document viewer (SPEC §5.4): continuous scroll, pinch/double-tap/buttons zoom, page jump. */
export function ViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const errorMessage = useAppErrorMessage();
  const queryClient = useQueryClient();
  const document = useDocument(id);
  const viewUrl = useViewUrl(id);
  const surface = useRef<PdfSurfaceHandle>(null);
  const [page, setPage] = useState({ current: 1, total: 0 });
  const [zoom, setZoom] = useState(1);
  const [renderError, setRenderError] = useState<PdfSurfaceError | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const loaded = page.total > 0;

  const retry = () => {
    setRenderError(null);
    setPage({ current: 1, total: 0 });
    void queryClient.resetQueries({ queryKey: queryKeys.documents.viewUrl(id) });
  };

  const share = async () => {
    setSharing(true);
    try {
      await shareDocument(id);
    } catch (e) {
      Alert.alert(t('errors.title'), errorMessage(e));
    } finally {
      setSharing(false);
    }
  };

  const changeZoom = (direction: 1 | -1) => {
    const target = nextZoom(zoom, direction);
    setZoom(target);
    surface.current?.setZoom(target);
  };

  const failure = viewUrl.error ?? renderError;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]} testID="viewer-screen">
      <Stack.Screen
        options={{
          title: document.data?.title ?? t('viewer.title'),
          headerRight: () => (
            <IconButton
              icon="share-outline"
              accessibilityLabel={t('viewer.share')}
              onPress={() => void share()}
              color={sharing ? 'textTertiary' : 'primary'}
              testID="viewer-share"
            />
          ),
        }}
      />
      {failure ? (
        <View style={styles.center}>
          <ErrorState
            message={`${t('viewer.error')} ${renderError ? t(`errors.${renderError.code}`) : errorMessage(failure)}`}
            onRetry={retry}
          />
        </View>
      ) : (
        <>
          <PdfSurface
            ref={surface}
            url={viewUrl.data ?? null}
            onLoaded={({ pageCount }) => setPage({ current: 1, total: pageCount })}
            onPageChanged={(current, total) => setPage({ current, total })}
            onZoomChanged={setZoom}
            onError={setRenderError}
            testID="viewer-surface"
          />
          {!loaded ? (
            <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
              <ActivityIndicator
                color={theme.colors.textSecondary}
                accessibilityLabel={t('viewer.loading')}
              />
            </View>
          ) : null}
        </>
      )}

      {loaded && !failure ? (
        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderTopColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, theme.spacing.sm),
            },
          ]}
        >
          <IconButton
            icon="remove"
            accessibilityLabel={t('viewer.zoomOut')}
            onPress={() => changeZoom(-1)}
            testID="viewer-zoom-out"
          />
          <Pressable
            onPress={() => setJumpOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('viewer.pageButton', { page: page.current, total: page.total })}
            style={[
              styles.pageButton,
              { borderRadius: theme.radius.full, backgroundColor: theme.colors.surface },
            ]}
            testID="viewer-page"
          >
            <AppText variant="subhead" weight="600">
              {t('viewer.pageIndicator', { page: page.current, total: page.total })}
            </AppText>
          </Pressable>
          <IconButton
            icon="add"
            accessibilityLabel={t('viewer.zoomIn')}
            onPress={() => changeZoom(1)}
            testID="viewer-zoom-in"
          />
          <AppText
            variant="footnote"
            color="textSecondary"
            style={styles.zoomLabel}
            testID="viewer-zoom-level"
          >
            {t('viewer.zoomLevel', { percent: Math.round(zoom * 100) })}
          </AppText>
        </View>
      ) : null}

      <BottomSheet
        visible={jumpOpen}
        title={t('viewer.jumpTitle')}
        onClose={() => setJumpOpen(false)}
        closeLabel={t('signatures.close')}
      >
        <View style={styles.grid}>
          {Array.from({ length: page.total }, (_, i) => i + 1).map((n) => {
            const current = n === page.current;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  surface.current?.goToPage(n);
                  setJumpOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('viewer.jumpPage', { page: n })}
                aria-selected={current}
                style={[
                  styles.cell,
                  {
                    borderRadius: theme.radius.md,
                    backgroundColor: current ? theme.colors.primary : theme.colors.surface,
                  },
                ]}
                testID={`viewer-jump-${n}`}
              >
                <AppText
                  weight="600"
                  style={{ color: current ? theme.colors.onPrimary : theme.colors.textPrimary }}
                >
                  {n}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pageButton: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 96,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: { minWidth: 44, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 16 },
  cell: {
    width: MIN_TOUCH_TARGET + 12,
    height: MIN_TOUCH_TARGET + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
