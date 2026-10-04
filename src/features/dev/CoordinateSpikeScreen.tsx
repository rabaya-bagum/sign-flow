import { useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { clampFractionRect } from '@shared/geometry';
import type { PageGeometry, SurfaceOverlay } from '@shared/pdfBridge';

import { AppButton, AppText, ChipGroup, InlineAlert, Screen } from '@/components';
import { useAuthStore } from '@/features/auth/store';
import { toAppUrl } from '@/features/documents/download';
import { PdfSurface, type PdfSurfaceHandle } from '@/features/viewer';
import { invokeFunction } from '@/lib/functions';
import { useTheme } from '@/theme';

// Dev-only route (/dev/coordinate-spike, guarded by __DEV__; Phase 3 §C). Tap the left document to
// place boxes, press Stamp, and compare with the stamped PDF from the dev-stamp function on the right.
// Strings here are intentionally untranslated developer UI.

const FIXTURES = [
  'portrait-3p',
  'landscape-a4',
  'rotated-90',
  'rotated-180',
  'rotated-270-offset',
  'mixed-sizes',
  'offset-cropbox',
  'nonzero-origin',
  'a6',
  'a0',
] as const;
type Fixture = (typeof FIXTURES)[number];
type Kind = 'rect' | 'image';

interface Box {
  page: number;
  kind: Kind;
  rect: { x: number; y: number; width: number; height: number };
}

interface DevStampResult {
  url: string;
  pages: PageGeometry[];
}

/** Box size in displayed points: big enough to see, small enough to place precisely. */
const BOX_PT = { rect: [120, 36], image: [96, 48] } as const;

export function CoordinateSpikeScreen() {
  const theme = useTheme();
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const { width } = useWindowDimensions();
  const [fixture, setFixture] = useState<Fixture>('rotated-270-offset');
  const [kind, setKind] = useState<Kind>('rect');
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [original, setOriginal] = useState<DevStampResult | null>(null);
  const [stampedUrl, setStampedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState('');
  const left = useRef<PdfSurfaceHandle>(null);
  const right = useRef<PdfSurfaceHandle>(null);

  const call = async (body: { fixture: Fixture; boxes?: Box[] }) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await invokeFunction<DevStampResult>('dev-stamp', { ...body });
      return { ...result, url: toAppUrl(result.url) };
    } catch (error) {
      setMessage(
        `dev-stamp failed: ${(error as Error).message}. Is functions:serve running with DEV_TOOLS=true?`,
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const open = async (name: Fixture) => {
    setFixture(name);
    setBoxes([]);
    setStampedUrl(null);
    setOriginal(await call({ fixture: name }));
  };

  const stamp = async () => {
    const result = await call({ fixture, boxes });
    if (result) setStampedUrl(result.url);
  };

  const onTap = ({ page: n, x, y }: { page: number; x: number; y: number }) => {
    const geometry = original?.pages[n - 1];
    if (!geometry) return;
    const [w, h] = BOX_PT[kind];
    const rect = clampFractionRect({
      x: x - w / geometry.width_pt / 2,
      y: y - h / geometry.height_pt / 2,
      width: w / geometry.width_pt,
      height: h / geometry.height_pt,
    });
    setBoxes((current) => [...current, { page: n, kind, rect }]);
    setStampedUrl(null);
  };

  // Outlines only, so the stamped fill underneath shows any misalignment on the right.
  const overlays = useMemo<SurfaceOverlay[]>(
    () =>
      boxes.map((box, i) => ({
        id: `box-${i}`,
        page: box.page,
        rect: box.rect,
        kind: 'rect',
        color: box.kind === 'rect' ? '#1D4ED8' : '#7C3AED',
        label: `Box ${i + 1}`,
      })),
    [boxes],
  );

  if (!signedIn) {
    return (
      <Screen padded>
        <InlineAlert tone="info" message="Sign in first: dev-stamp needs your session." />
      </Screen>
    );
  }

  const sideBySide = width >= 600;
  return (
    <Screen edges={['bottom']} padded={false}>
      <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
        <ChipGroup
          scroll
          accessibilityLabel="Fixture"
          options={FIXTURES.map((value) => ({ value, label: value }))}
          value={fixture}
          onChange={(name) => void open(name)}
          testID="spike-fixture"
        />
        <View style={styles.row}>
          <ChipGroup
            accessibilityLabel="Box kind"
            options={[
              { value: 'rect', label: 'Rect' },
              { value: 'image', label: 'Image' },
            ]}
            value={kind}
            onChange={setKind}
          />
          <AppText variant="footnote" color="textSecondary">
            {boxes.length} boxes {page}
          </AppText>
        </View>
        <View style={styles.row}>
          {original ? null : (
            <AppButton title="Open" onPress={() => void open(fixture)} loading={busy} testID="spike-open" />
          )}
          <AppButton
            title="Stamp"
            onPress={() => void stamp()}
            loading={busy}
            disabled={!original || boxes.length === 0}
            testID="spike-stamp"
          />
          <AppButton
            title="Clear"
            variant="secondary"
            onPress={() => {
              setBoxes([]);
              setStampedUrl(null);
            }}
            disabled={boxes.length === 0}
          />
          <AppButton title="2×" variant="ghost" onPress={() => left.current?.setZoom(2)} />
          <AppButton title="1×" variant="ghost" onPress={() => left.current?.setZoom(1)} />
        </View>
        {message ? <InlineAlert tone="error" message={message} /> : null}
      </View>
      <View style={[styles.panes, { flexDirection: sideBySide ? 'row' : 'column', gap: 2 }]}>
        <PdfSurface
          ref={left}
          url={original?.url ?? null}
          overlays={overlays}
          onTap={onTap}
          onPageChanged={(n, total) => {
            setPage(`· page ${n}/${total}`);
            right.current?.goToPage(n);
          }}
          onError={(error) => setMessage(`${error.code}: ${error.message}`)}
          testID="spike-original"
        />
        <PdfSurface
          ref={right}
          url={stampedUrl}
          overlays={stampedUrl ? overlays : []}
          onError={(error) => setMessage(`${error.code}: ${error.message}`)}
          testID="spike-stamped"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  panes: { flex: 1 },
});
