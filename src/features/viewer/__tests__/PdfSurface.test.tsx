import { act, createRef, useState } from 'react';

import { renderWithProviders } from '@/test/render';

import { PdfSurface } from '../PdfSurface';
import type { PdfSurfaceHandle } from '../types';

const SURFACE_URI = 'file:///data/cache/ExponentAsset-abc.html';

jest.mock('../surfaceAsset', () => ({ SURFACE_ASSET: 1 }));
jest.mock('expo-asset', () => ({
  useAssets: () => [[{ localUri: 'file:///data/cache/ExponentAsset-abc.html' }], undefined],
}));

interface MockWebViewProps {
  ref?: (api: { postMessage: (raw: string) => void } | null) => void;
  onMessage: (event: { nativeEvent: { data: string; url: string } }) => void;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
  [key: string]: unknown;
}
const webView: { props: MockWebViewProps | null; posted: string[] } = { props: null, posted: [] };

jest.mock('react-native-webview', () => {
  const { useLayoutEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    WebView: (props: MockWebViewProps) => {
      webView.props = props;
      useLayoutEffect(() => {
        props.ref?.({ postMessage: (raw) => webView.posted.push(raw) });
      });
      return null;
    },
  };
});

const message = (data: unknown, url = SURFACE_URI) =>
  act(() => webView.props!.onMessage({ nativeEvent: { data: JSON.stringify(data), url } }));

beforeEach(() => {
  webView.props = null;
  webView.posted = [];
});

describe('PdfSurface (native)', () => {
  it('loads the local surface in a locked-down WebView', async () => {
    await renderWithProviders(<PdfSurface url={null} />);
    const props = webView.props!;
    expect(props.source).toEqual({ uri: SURFACE_URI });
    expect(props.originWhitelist).toEqual(['file://']);
    expect(props.allowFileAccessFromFileURLs).toBe(false);
    expect(props.allowUniversalAccessFromFileURLs).toBe(false);
    expect(props.allowingReadAccessToURL).toBe('file:///data/cache/');
    expect(props.setSupportMultipleWindows).toBe(false);
    expect(props.javaScriptCanOpenWindowsAutomatically).toBe(false);
    expect(props.cacheEnabled).toBe(false);
    expect(props.incognito).toBe(true);
  });

  it('allows navigation only to the surface itself', async () => {
    await renderWithProviders(<PdfSurface url={null} />);
    const allow = webView.props!.onShouldStartLoadWithRequest;
    expect(allow({ url: SURFACE_URI })).toBe(true);
    expect(allow({ url: `${SURFACE_URI}#page=2` })).toBe(true);
    expect(allow({ url: 'https://evil.test/' })).toBe(false);
    expect(allow({ url: 'file:///data/user/0/app/files/secret.db' })).toBe(false);
  });

  it('sends load and overlays after ready, and forwards validated events', async () => {
    const onLoaded = jest.fn();
    const onTap = jest.fn();
    const onError = jest.fn();
    const ref = createRef<PdfSurfaceHandle>();
    const overlays = [
      { id: 'a', page: 1, kind: 'rect' as const, rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 } },
    ];
    await renderWithProviders(
      <PdfSurface
        ref={ref}
        url="https://p.test/doc.pdf?token=t"
        overlays={overlays}
        onLoaded={onLoaded}
        onTap={onTap}
        onError={onError}
      />,
    );
    act(() => ref.current!.setZoom(9));
    expect(webView.posted).toEqual([]);

    await message({ v: 1, type: 'ready' });
    const sent = webView.posted.map((raw) => JSON.parse(raw));
    expect(sent).toEqual([
      {
        v: 1,
        type: 'load',
        url: 'https://p.test/doc.pdf?token=t',
        background: '#FFFFFF',
        pageLabel: 'Page {page} of {total}',
        interactive: true,
      },
      { v: 1, type: 'setBackground', background: '#FFFFFF' },
      { v: 1, type: 'setOverlays', overlays },
      { v: 1, type: 'highlight', id: null },
      { v: 1, type: 'setZoom', zoom: 4 },
    ]);

    const page = { page: 1, width_pt: 612, height_pt: 792, box_x_pt: 0, box_y_pt: 0, rotation: 0 };
    await message({ v: 1, type: 'loaded', pageCount: 1, pages: [page] });
    expect(onLoaded).toHaveBeenCalledWith({ pageCount: 1, pages: [page] });

    await message({ v: 1, type: 'tap', page: 1, x: 0.25, y: 0.5 });
    expect(onTap).toHaveBeenCalledWith({ page: 1, x: 0.25, y: 0.5 });

    // Invalid, or from a page other than the surface: ignored.
    await message({ v: 1, type: 'tap', page: 1, x: 2, y: 0.5 });
    await message({ v: 1, type: 'tap', page: 1, x: 0.1, y: 0.1 }, 'https://evil.test/');
    expect(onTap).toHaveBeenCalledTimes(1);

    await message({ v: 1, type: 'error', code: 'PDF_RENDER_FAILED', message: 'Invalid PDF structure' });
    expect(onError).toHaveBeenCalledWith({ code: 'PDF_RENDER_FAILED', message: 'Invalid PDF structure' });
  });

  it('recolours on theme change without reloading the document', async () => {
    const { ThemeProvider } = jest.requireActual<typeof import('@/theme')>('@/theme');
    let setScheme: (scheme: 'light' | 'dark') => void = () => {};
    function Harness() {
      const [scheme, set] = useState<'light' | 'dark'>('light');
      setScheme = set;
      return (
        <ThemeProvider scheme={scheme}>
          <PdfSurface url="https://p.test/doc.pdf?token=t" />
        </ThemeProvider>
      );
    }
    await renderWithProviders(<Harness />);
    await message({ v: 1, type: 'ready' });
    webView.posted = [];
    await act(async () => setScheme('dark'));
    const sent = webView.posted.map((raw) => JSON.parse(raw) as { type: string; background?: string });
    expect(sent.some((m) => m.type === 'load')).toBe(false);
    expect(sent).toContainEqual({ v: 1, type: 'setBackground', background: '#0E1013' });
  });
});
