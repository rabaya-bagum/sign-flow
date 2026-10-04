/**
 * PDF surface: renders a PDF with pdf.js (continuous vertical scroll, virtualized pages, pinch/
 * double-tap zoom) and draws overlays positioned in page fractions (SPEC §8.1). Runs inside
 * react-native-webview on native and an iframe on web; talks to the host via ./transport.
 */
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  BRIDGE_VERSION,
  type PageGeometry,
  type SurfaceCommand,
  type SurfaceOverlay,
} from '../../../shared/pdfBridge';

import { emit, listen } from './transport';

declare const __PDF_WORKER_SRC__: string;

const GUTTER = 12;
const PAGE_GAP = 12;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 280;
const TAP_SLOP_PX = 10;
/** Opening (not rendering) a document; a stalled worker or network becomes an error with retry. */
const LOAD_TIMEOUT_MS = 30_000;

// --- Worker: inlined source → Blob URL (offline, single file). -----------------------------------
// A classic worker (module workers fail in opaque origins). If it cannot start, the same script runs
// on the main thread, where pdf.js finds it as `globalThis.pdfjsWorker`: slower, but it renders.
let workerMode: 'pending' | 'worker' | 'main-thread' = 'pending';
let workerReady: Promise<void> | null = null;

function ensureWorker(): Promise<void> {
  workerReady ??= new Promise<void>((resolve) => {
    const url = URL.createObjectURL(new Blob([__PDF_WORKER_SRC__], { type: 'text/javascript' }));
    let worker: Worker | null = null;
    let settled = false;
    const settle = (mode: 'worker' | 'main-thread') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (mode === 'worker' && worker) {
        GlobalWorkerOptions.workerPort = worker;
        workerMode = 'worker';
        resolve();
        return;
      }
      worker?.terminate();
      workerMode = 'main-thread';
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => resolve(); // getDocument then reports PDF_RENDER_FAILED
      document.head.appendChild(script);
    };
    // The worker announces itself with a "ready" message once its script has run.
    const timer = setTimeout(() => settle('main-thread'), 5000);
    try {
      worker = new Worker(url);
      worker.addEventListener('message', () => settle('worker'), { once: true });
      worker.addEventListener('error', () => settle('main-thread'), { once: true });
    } catch {
      settle('main-thread');
    }
  });
  return workerReady;
}

interface PageState {
  number: number;
  proxy: PDFPageProxy | null;
  baseWidth: number;
  baseHeight: number;
  el: HTMLDivElement;
  overlayLayer: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  renderedScale: number;
  task: RenderTask | null;
  near: boolean;
}

const viewer = document.getElementById('viewer') as HTMLDivElement;
const pagesEl = document.getElementById('pages') as HTMLDivElement;

let doc: PDFDocumentProxy | null = null;
let loadingTask: PDFDocumentLoadingTask | null = null;
/** Incremented per load, so a superseded load stops at its next await. */
let loadGeneration = 0;
let pages: PageState[] = [];
let zoom = 1;
let currentPage = 1;
let overlays: SurfaceOverlay[] = [];
let highlighted: string | null = null;
let observer: IntersectionObserver | null = null;
let loadStartedAt = 0;

/** Test/diagnostic counters, read by the golden and performance tests. */
const stats = { firstPageMs: -1, renders: 0, liveCanvases: 0, canvasPixels: 0, lastRenderMs: 0 };
(window as unknown as { __surface: unknown }).__surface = {
  stats,
  canvas: (n: number) => pages[n - 1]?.canvas ?? null,
  get workerMode() {
    return workerMode;
  },
};

// --- Layout ----------------------------------------------------------------------------------------
function cssScale(p: PageState): number {
  const available = Math.max(viewer.clientWidth - GUTTER * 2, 100);
  return (available / p.baseWidth) * zoom;
}

function layout(): void {
  for (const p of pages) {
    const s = cssScale(p);
    p.el.style.width = `${p.baseWidth * s}px`;
    p.el.style.height = `${p.baseHeight * s}px`;
  }
}

/** Device pixels per CSS pixel, capped so one canvas never exceeds the pixel budget. */
function outputScale(cssWidth: number, cssHeight: number): number {
  const dpr = window.devicePixelRatio || 1;
  const budget = Math.min(16_777_216, screen.width * screen.height * dpr * dpr * 3);
  return Math.max(0.5, Math.min(dpr, Math.sqrt(budget / (cssWidth * cssHeight))));
}

// --- Rendering (virtualized: only pages near the viewport keep a canvas) ----------------------------
async function renderPage(p: PageState): Promise<void> {
  if (!doc || !p.near) return;
  const s = cssScale(p);
  const out = outputScale(p.baseWidth * s, p.baseHeight * s);
  const target = s * out;
  if (p.canvas && Math.abs(p.renderedScale - target) < 0.01) return;

  p.task?.cancel();
  p.proxy ??= await doc.getPage(p.number);
  const viewport = p.proxy.getViewport({ scale: target });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.dataset.page = String(p.number);
  const started = performance.now();
  const task = p.proxy.render({ canvas, viewport });
  p.task = task;
  try {
    await task.promise;
  } catch (error) {
    if ((error as Error)?.name === 'RenderingCancelledException') return;
    throw error;
  }
  if (p.task !== task || !p.near) {
    canvas.width = 0;
    return;
  }
  p.task = null;
  releaseCanvas(p);
  p.el.insertBefore(canvas, p.overlayLayer);
  p.canvas = canvas;
  p.renderedScale = target;
  stats.renders += 1;
  stats.liveCanvases += 1;
  stats.canvasPixels += canvas.width * canvas.height;
  stats.lastRenderMs = performance.now() - started;
  if (stats.firstPageMs < 0) stats.firstPageMs = performance.now() - loadStartedAt;
}

function releaseCanvas(p: PageState): void {
  if (!p.canvas) return;
  stats.liveCanvases -= 1;
  stats.canvasPixels -= p.canvas.width * p.canvas.height;
  p.canvas.width = 0; // frees the backing store immediately
  p.canvas.remove();
  p.canvas = null;
}

function renderNearPages(): void {
  for (const p of pages) {
    if (p.near) void renderPage(p).catch(reportRenderError);
  }
}

function reportRenderError(error: unknown): void {
  emit({
    v: BRIDGE_VERSION,
    type: 'error',
    code: 'PDF_RENDER_FAILED',
    message: String((error as Error)?.message ?? error).slice(0, 500),
  });
}

// --- Overlays ----------------------------------------------------------------------------------------
function drawOverlays(): void {
  for (const p of pages) p.overlayLayer.replaceChildren();
  for (const o of overlays) {
    const p = pages[o.page - 1];
    if (!p) continue;
    const el = document.createElement(o.kind === 'image' ? 'img' : 'div');
    el.className = `overlay${o.id === highlighted ? ' highlighted' : ''}`;
    el.dataset.overlayId = o.id;
    Object.assign(el.style, {
      left: `${o.rect.x * 100}%`,
      top: `${o.rect.y * 100}%`,
      width: `${o.rect.width * 100}%`,
      height: `${o.rect.height * 100}%`,
    });
    if (o.kind === 'image' && o.src && el instanceof HTMLImageElement) {
      el.src = o.src;
      el.alt = o.label ?? '';
    } else {
      el.style.borderColor = o.color ?? '#2B59D9';
      el.style.background = o.fill ?? 'transparent';
      if (o.label) el.setAttribute('aria-label', o.label);
    }
    p.overlayLayer.appendChild(el);
  }
}

// --- Navigation --------------------------------------------------------------------------------------
function updateCurrentPage(): void {
  const mid = viewer.scrollTop + viewer.clientHeight / 2;
  const found = pages.find(
    (p) => p.el.offsetTop <= mid && p.el.offsetTop + p.el.offsetHeight + PAGE_GAP > mid,
  );
  if (found && found.number !== currentPage) {
    currentPage = found.number;
    emit({ v: BRIDGE_VERSION, type: 'pageChanged', page: currentPage, pageCount: pages.length });
  }
}

let scrollFrame = 0;
viewer.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    updateCurrentPage();
  });
});

/** Changes zoom keeping the content point under (clientX, clientY) fixed on screen. */
function setZoom(next: number, clientX = viewer.clientWidth / 2, clientY = viewer.clientHeight / 2): void {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
  if (Math.abs(clamped - zoom) < 0.001) return;
  const rect = viewer.getBoundingClientRect();
  const contentX = viewer.scrollLeft + (clientX - rect.left);
  const contentY = viewer.scrollTop + (clientY - rect.top);
  const ratio = clamped / zoom;
  zoom = clamped;
  layout();
  viewer.scrollLeft = contentX * ratio - (clientX - rect.left);
  viewer.scrollTop = contentY * ratio - (clientY - rect.top);
  renderNearPages();
  emit({ v: BRIDGE_VERSION, type: 'zoomChanged', zoom });
}

// --- Gestures: pinch (CSS transform while moving, re-render on release), double-tap, tap -------------
let pinch: { startDistance: number; midX: number; midY: number; factor: number } | null = null;
let tapStart: { x: number; y: number; t: number } | null = null;
let lastTap: { x: number; y: number; t: number } | null = null;
let pendingTap: ReturnType<typeof setTimeout> | null = null;

function distance(t: TouchList): number {
  const a = t[0]!;
  const b = t[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

viewer.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length === 2) {
      const a = e.touches[0]!;
      const b = e.touches[1]!;
      pinch = {
        startDistance: distance(e.touches),
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
        factor: 1,
      };
      tapStart = null;
      const rect = viewer.getBoundingClientRect();
      pagesEl.style.transformOrigin = `${viewer.scrollLeft + pinch.midX - rect.left}px ${viewer.scrollTop + pinch.midY - rect.top}px`;
    }
  },
  { passive: true },
);

viewer.addEventListener(
  'touchmove',
  (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    pinch.factor = Math.min(
      MAX_ZOOM / zoom,
      Math.max(MIN_ZOOM / zoom, distance(e.touches) / pinch.startDistance),
    );
    pagesEl.style.transform = `scale(${pinch.factor})`;
  },
  { passive: false },
);

viewer.addEventListener('touchend', () => {
  if (!pinch) return;
  const { factor, midX, midY } = pinch;
  pinch = null;
  pagesEl.style.transform = '';
  setZoom(zoom * factor, midX, midY);
});

// Desktop/web: ctrl/⌘ + wheel zooms.
viewer.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
  },
  { passive: false },
);

viewer.addEventListener('pointerdown', (e) => {
  if (pinch) return;
  tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
});

viewer.addEventListener('pointerup', (e) => {
  if (!tapStart || pinch) return;
  const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > TAP_SLOP_PX;
  tapStart = null;
  if (moved) return;
  const now = performance.now();
  if (
    lastTap &&
    now - lastTap.t < DOUBLE_TAP_MS &&
    Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40
  ) {
    if (pendingTap) clearTimeout(pendingTap);
    pendingTap = null;
    lastTap = null;
    setZoom(zoom > 1.5 ? 1 : 2, e.clientX, e.clientY);
    return;
  }
  lastTap = { x: e.clientX, y: e.clientY, t: now };
  const { clientX, clientY } = e;
  // Wait out the double-tap window before reporting a single tap.
  pendingTap = setTimeout(() => {
    pendingTap = null;
    emitTap(clientX, clientY);
  }, DOUBLE_TAP_MS);
});

function emitTap(clientX: number, clientY: number): void {
  for (const p of pages) {
    const r = p.el.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      emit({ v: BRIDGE_VERSION, type: 'tap', page: p.number, x, y });
      return;
    }
  }
}

window.addEventListener('resize', () => {
  layout();
  renderNearPages();
});

// --- Loading -----------------------------------------------------------------------------------------
function geometryOf(page: PDFPageProxy): PageGeometry {
  const [x0, y0, x1, y1] = page.view as [number, number, number, number];
  const rotation = (((page.rotate % 360) + 360) % 360) as PageGeometry['rotation'];
  const swap = rotation === 90 || rotation === 270;
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    page: page.pageNumber,
    width_pt: swap ? h : w,
    height_pt: swap ? w : h,
    box_x_pt: x0,
    box_y_pt: y0,
    rotation,
  };
}

async function load(command: Extract<SurfaceCommand, { type: 'load' }>): Promise<void> {
  const generation = ++loadGeneration;
  loadStartedAt = performance.now();
  document.body.style.background = command.background;
  document.body.classList.toggle('preview', command.interactive === false);
  observer?.disconnect();
  for (const p of pages) {
    p.task?.cancel();
    releaseCanvas(p);
  }
  pagesEl.replaceChildren();
  pages = [];
  zoom = 1;
  currentPage = 1;
  const previous = loadingTask;
  loadingTask = null;
  doc = null;
  await previous?.destroy();
  if (generation !== loadGeneration) return;

  let pdf: PDFDocumentProxy;
  try {
    await ensureWorker();
    if (generation !== loadGeneration) return;
    // Range requests show the first page early; the rest of the file then streams in the background
    // (auto-fetch), so later pages never depend on the short-lived signed URL still being valid.
    const task = getDocument({ url: command.url, isOffscreenCanvasSupported: false });
    loadingTask = task;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    pdf = await Promise.race([
      task.promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Timed out opening the document')), LOAD_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timeout));
  } catch (error) {
    if (generation !== loadGeneration) return;
    const offline = !navigator.onLine || /fetch|network/i.test(String((error as Error)?.message));
    emit({
      v: BRIDGE_VERSION,
      type: 'error',
      code: offline ? 'NETWORK_OFFLINE' : 'PDF_RENDER_FAILED',
      message: String((error as Error)?.message ?? error).slice(0, 500),
    });
    return;
  }

  if (generation !== loadGeneration) return;
  doc = pdf;
  const total = pdf.numPages;
  const geometry: PageGeometry[] = [];
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const p = pages[Number((entry.target as HTMLElement).dataset.page) - 1];
        if (!p) continue;
        p.near = entry.isIntersecting;
        if (p.near) void renderPage(p).catch(reportRenderError);
        else {
          p.task?.cancel();
          releaseCanvas(p);
        }
      }
    },
    { root: viewer, rootMargin: '100% 50%' },
  );

  for (let n = 1; n <= total; n++) {
    // Page sizes are needed for layout; getPage only fetches the page dictionary (range requests).
    const proxy = await pdf.getPage(n);
    if (generation !== loadGeneration) return;
    const g = geometryOf(proxy);
    geometry.push(g);
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.page = String(n);
    el.setAttribute('role', 'img');
    el.setAttribute(
      'aria-label',
      command.pageLabel.replace('{page}', String(n)).replace('{total}', String(total)),
    );
    const overlayLayer = document.createElement('div');
    overlayLayer.className = 'overlays';
    el.appendChild(overlayLayer);
    pagesEl.appendChild(el);
    pages.push({
      number: n,
      proxy,
      baseWidth: g.width_pt,
      baseHeight: g.height_pt,
      el,
      overlayLayer,
      canvas: null,
      renderedScale: 0,
      task: null,
      near: false,
    });
  }
  layout();
  drawOverlays();
  for (const p of pages) observer.observe(p.el);
  emit({ v: BRIDGE_VERSION, type: 'loaded', pageCount: total, pages: geometry });
  emit({ v: BRIDGE_VERSION, type: 'pageChanged', page: 1, pageCount: total });
}

listen((command) => {
  switch (command.type) {
    case 'load':
      void load(command);
      break;
    case 'goToPage': {
      const p = pages[command.page - 1];
      if (p) viewer.scrollTo({ top: p.el.offsetTop - PAGE_GAP, behavior: 'auto' });
      break;
    }
    case 'setZoom':
      setZoom(command.zoom);
      break;
    case 'setOverlays':
      overlays = command.overlays;
      drawOverlays();
      break;
    case 'highlight':
      highlighted = command.id;
      drawOverlays();
      break;
  }
});

// Start the worker while the host prepares its first command.
void ensureWorker();
emit({ v: BRIDGE_VERSION, type: 'ready' });
