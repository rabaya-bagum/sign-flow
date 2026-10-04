import { SurfaceSession } from '../surfaceSession';

const ready = JSON.stringify({ v: 1, type: 'ready' });
const types = (posted: string[]) => posted.map((raw) => (JSON.parse(raw) as { type: string }).type);

function session() {
  const posted: string[] = [];
  const s = new SurfaceSession();
  s.attach((raw) => posted.push(raw));
  return { s, posted };
}

describe('SurfaceSession', () => {
  it('holds commands until ready, then replays state before transient commands', () => {
    const { s, posted } = session();
    s.send({ type: 'goToPage', page: 2 });
    s.send({ type: 'goToPage', page: 3 });
    s.send({ type: 'setOverlays', overlays: [] });
    s.send({ type: 'load', url: 'https://x.test/a.pdf', background: '#FFFFFF', pageLabel: 'Page {page}' });
    expect(posted).toEqual([]);

    expect(s.receive(ready)).toEqual({ v: 1, type: 'ready' });
    expect(types(posted)).toEqual(['load', 'setOverlays', 'goToPage']);
    expect(JSON.parse(posted[2]!)).toEqual({ v: 1, type: 'goToPage', page: 3 });
  });

  it('sends directly once ready, stamped with the bridge version', () => {
    const { s, posted } = session();
    s.receive(ready);
    s.send({ type: 'setZoom', zoom: 2 });
    expect(JSON.parse(posted[0]!)).toEqual({ v: 1, type: 'setZoom', zoom: 2 });
  });

  it('replays the latest state after the surface restarts', () => {
    const { s, posted } = session();
    s.receive(ready);
    s.send({ type: 'load', url: 'https://x.test/a.pdf', background: '#FFFFFF', pageLabel: 'p' });
    s.send({ type: 'load', url: 'https://x.test/b.pdf', background: '#FFFFFF', pageLabel: 'p' });
    s.send({ type: 'highlight', id: 'f1' });
    s.send({ type: 'goToPage', page: 4 });
    s.reset();
    posted.length = 0;
    s.send({ type: 'highlight', id: 'f2' });
    expect(posted).toEqual([]);
    s.receive(ready);
    expect(posted.map((raw) => JSON.parse(raw))).toEqual([
      { v: 1, type: 'load', url: 'https://x.test/b.pdf', background: '#FFFFFF', pageLabel: 'p' },
      { v: 1, type: 'highlight', id: 'f2' },
    ]);
  });

  it('rejects invalid or foreign messages', () => {
    const { s } = session();
    expect(s.receive('not json')).toBeNull();
    expect(s.receive({ v: 1, type: 'ready' })).toBeNull(); // must be a JSON string
    expect(s.receive(JSON.stringify({ v: 2, type: 'ready' }))).toBeNull();
    expect(s.receive(JSON.stringify({ v: 1, type: 'tap', page: 1, x: 1.5, y: 0 }))).toBeNull();
    expect(s.receive(JSON.stringify({ v: 1, type: 'tap', page: 1, x: 0.5, y: 0.25 }))).toEqual({
      v: 1,
      type: 'tap',
      page: 1,
      x: 0.5,
      y: 0.25,
    });
  });
});
