import { Canvas, Path, type SkPath } from '@shopify/react-native-skia';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { AppText } from '@/components';
import { useTheme } from '@/theme';

import type { Point } from './pixels';
import { INK_COLORS, type InkColor } from './ink';
import { strokePath } from './render';

export const STROKE_BASE_WIDTH = 3;

export interface DrawPadProps {
  strokes: Point[][];
  setStrokes: Dispatch<SetStateAction<Point[][]>>;
  onSize: (size: { width: number; height: number }) => void;
  aspect: number;
  ink: InkColor;
  accessibilityLabel: string;
  accessibilityHint: string;
  baselineLabel: string;
}

/**
 * Skia drawing pad (loaded lazily, see loadProducers.ts). A light paper surface in both themes; each
 * stroke is one variable-width filled path, the same geometry the exported PNG uses.
 */
// Paths for finished strokes are cached by stroke identity, so drawing only rebuilds the live one.
const pathCache = new WeakMap<Point[], SkPath>();
function cachedPath(stroke: Point[]): SkPath {
  let path = pathCache.get(stroke);
  if (!path) {
    path = strokePath(stroke, STROKE_BASE_WIDTH);
    pathCache.set(stroke, path);
  }
  return path;
}

export default function DrawPad({
  strokes,
  setStrokes,
  onSize,
  aspect,
  ink,
  accessibilityLabel,
  accessibilityHint,
  baselineLabel,
}: DrawPadProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const height = width / aspect;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) {
      setWidth(w);
      onSize({ width: w, height: Math.round(w / aspect) });
    }
  };

  // The stroke being drawn is the last one; it grows while the finger moves.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => setStrokes((all) => [...all, [{ x: e.x, y: e.y, t: Date.now() }]]))
    .onUpdate((e) =>
      setStrokes((all) => {
        const live = all[all.length - 1];
        const last = live?.[live.length - 1];
        if (!live || !last || Math.hypot(e.x - last.x, e.y - last.y) < 1) return all;
        return [...all.slice(0, -1), [...live, { x: e.x, y: e.y, t: Date.now() }]];
      }),
    );

  const color = INK_COLORS[ink];
  const paths = useMemo(() => strokes.map(cachedPath), [strokes]);

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[
        styles.pad,
        {
          height: height || undefined,
          aspectRatio: aspect,
          backgroundColor: theme.colors.paper,
          borderRadius: theme.radius.md,
          borderColor: theme.colors.border,
        },
      ]}
      testID="draw-pad"
    >
      <View
        pointerEvents="none"
        style={[styles.baseline, { borderColor: theme.colors.paperLine, bottom: height * 0.28 }]}
      >
        <AppText variant="caption" style={{ color: theme.colors.paperText }} importantForAccessibility="no">
          {baselineLabel}
        </AppText>
      </View>
      <GestureDetector gesture={pan}>
        <Canvas style={StyleSheet.absoluteFill}>
          {paths.map((path, i) => (
            <Path key={i} path={path} color={color} />
          ))}
        </Canvas>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { width: '100%', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  baseline: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    paddingBottom: 2,
  },
});
