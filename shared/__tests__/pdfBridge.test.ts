import { parseMessage, surfaceCommandSchema, surfaceEventSchema } from '../pdfBridge';

const cmd = (value: unknown) => parseMessage(surfaceCommandSchema, JSON.stringify(value));
const evt = (value: unknown) => parseMessage(surfaceEventSchema, JSON.stringify(value));

describe('pdfBridge commands', () => {
  const load = {
    v: 1,
    type: 'load',
    url: 'https://p.supabase.co/x.pdf?token=t',
    background: '#0E1013',
    pageLabel: 'Page {page} of {total}',
  };

  it('accepts valid commands', () => {
    expect(cmd(load)).toEqual(load);
    expect(
      cmd({
        v: 1,
        type: 'load',
        ...{ url: 'http://127.0.0.1:54321/x.pdf' },
        background: '#FFF000',
        pageLabel: 'p',
      }),
    ).not.toBeNull();
    expect(cmd({ v: 1, type: 'setZoom', zoom: 4 })).not.toBeNull();
    expect(cmd({ v: 1, type: 'highlight', id: null })).not.toBeNull();
    expect(cmd({ v: 1, type: 'setBackground', background: '#0E1013' })).not.toBeNull();
    expect(cmd({ v: 1, type: 'setBackground', background: 'url(x)' })).toBeNull();
  });

  it.each([
    ['wrong version', { ...load, v: 2 }],
    ['missing version', { ...load, v: undefined }],
    ['file URL', { ...load, url: 'file:///etc/passwd' }],
    ['javascript URL', { ...load, url: 'javascript:alert(1)' }],
    ['data URL', { ...load, url: 'data:application/pdf;base64,AAAA' }],
    ['bad colour', { ...load, background: 'red;x' }],
    ['zoom above 4', { v: 1, type: 'setZoom', zoom: 5 }],
    ['zoom below 1', { v: 1, type: 'setZoom', zoom: 0.5 }],
    ['page 0', { v: 1, type: 'goToPage', page: 0 }],
    ['unknown type', { v: 1, type: 'eval', code: '1' }],
  ])('rejects %s', (_, value) => {
    expect(cmd(value)).toBeNull();
  });

  it('validates overlays', () => {
    const overlay = { id: 'a', page: 1, rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, kind: 'rect' };
    expect(cmd({ v: 1, type: 'setOverlays', overlays: [overlay] })).not.toBeNull();
    expect(
      cmd({ v: 1, type: 'setOverlays', overlays: [{ ...overlay, rect: { ...overlay.rect, x: -0.1 } }] }),
    ).toBeNull();
    expect(
      cmd({
        v: 1,
        type: 'setOverlays',
        overlays: [{ ...overlay, kind: 'image', src: 'https://evil.test/x.png' }],
      }),
    ).toBeNull();
    expect(
      cmd({
        v: 1,
        type: 'setOverlays',
        overlays: [{ ...overlay, kind: 'image', src: 'data:image/png;base64,iVBOR' }],
      }),
    ).not.toBeNull();
    expect(
      cmd({
        v: 1,
        type: 'setOverlays',
        overlays: Array.from({ length: 501 }, (_, i) => ({ ...overlay, id: `o${i}` })),
      }),
    ).toBeNull();
  });
});

describe('pdfBridge events', () => {
  it('accepts loaded geometry and rejects bad rotations', () => {
    const page = { page: 1, width_pt: 792, height_pt: 612, box_x_pt: 0, box_y_pt: 0, rotation: 90 };
    expect(evt({ v: 1, type: 'loaded', pageCount: 1, pages: [page] })).not.toBeNull();
    expect(evt({ v: 1, type: 'loaded', pageCount: 1, pages: [{ ...page, rotation: 45 }] })).toBeNull();
  });

  it('accepts only known error codes', () => {
    expect(evt({ v: 1, type: 'error', code: 'PDF_RENDER_FAILED', message: 'x' })).not.toBeNull();
    expect(evt({ v: 1, type: 'error', code: 'UNKNOWN', message: 'x' })).toBeNull();
  });

  it('ignores non-strings, bad JSON and oversized messages', () => {
    expect(parseMessage(surfaceEventSchema, { v: 1, type: 'ready' })).toBeNull();
    expect(parseMessage(surfaceEventSchema, '{')).toBeNull();
    expect(parseMessage(surfaceEventSchema, 'x'.repeat(4_000_001))).toBeNull();
  });
});
