import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppButton, AppText } from '@/components';
import { useTheme } from '@/theme';

import { loadDrawPad } from './loadProducers';
import type { Point } from './pixels';
import type { InkColor } from './ink';
import { PAD_ASPECT, type SignatureKind } from './types';

const DrawPad = lazy(loadDrawPad);

interface DrawPaneProps {
  kind: SignatureKind;
  strokes: Point[][];
  setStrokes: Dispatch<SetStateAction<Point[][]>>;
  onSize: (size: { width: number; height: number }) => void;
  ink: InkColor;
}

export function DrawPane({ kind, strokes, setStrokes, onSize, ink }: DrawPaneProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const aspect = PAD_ASPECT[kind];
  return (
    // Gestures inside a Modal need their own root view on Android.
    <GestureHandlerRootView style={{ gap: theme.spacing.sm }}>
      <Suspense
        fallback={
          <View
            style={[
              styles.placeholder,
              { aspectRatio: aspect, backgroundColor: theme.colors.paper, borderRadius: theme.radius.md },
            ]}
          >
            <ActivityIndicator
              color={theme.colors.paperText}
              accessibilityLabel={t('signatures.loadingTools')}
            />
          </View>
        }
      >
        <DrawPad
          strokes={strokes}
          setStrokes={setStrokes}
          onSize={onSize}
          aspect={aspect}
          ink={ink}
          accessibilityLabel={t(`signatures.drawLabel_${kind}`)}
          accessibilityHint={t('signatures.drawHint')}
          baselineLabel={t('signatures.drawBaseline')}
        />
      </Suspense>
      <View style={styles.row}>
        <AppButton
          title={t('signatures.undo')}
          icon="arrow-undo"
          variant="ghost"
          disabled={strokes.length === 0}
          onPress={() => setStrokes((all) => all.slice(0, -1))}
          testID="draw-undo"
        />
        <AppButton
          title={t('signatures.clear')}
          variant="ghost"
          disabled={strokes.length === 0}
          onPress={() => setStrokes([])}
          testID="draw-clear"
        />
        {strokes.length === 0 ? (
          <AppText variant="footnote" color="textSecondary" style={styles.flex}>
            {t('signatures.drawEmpty')}
          </AppText>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  placeholder: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  flex: { flex: 1 },
});
