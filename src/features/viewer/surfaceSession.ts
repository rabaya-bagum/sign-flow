import {
  BRIDGE_VERSION,
  parseMessage,
  surfaceEventSchema,
  type SurfaceCommand,
  type SurfaceEvent,
} from '@shared/pdfBridge';

type Command = SurfaceCommand extends infer C ? (C extends SurfaceCommand ? Omit<C, 'v'> : never) : never;

/**
 * Host side of the PDF surface bridge (shared/pdfBridge.ts), independent of WebView or iframe.
 *
 * Commands sent before the surface reports `ready` are held. The latest `load`, `setOverlays` and
 * `highlight` are state: they are replayed whenever the surface (re)starts, e.g. after the WebView's
 * content process was killed. `goToPage`/`setZoom` are transient: only the latest of each is kept
 * while waiting.
 */
export class SurfaceSession {
  private ready = false;
  private state = new Map<'load' | 'setOverlays' | 'highlight', SurfaceCommand>();
  private pending = new Map<'goToPage' | 'setZoom', SurfaceCommand>();

  private post: (raw: string) => void = () => {};

  /** Sets how messages reach the surface (WebView or iframe). */
  attach(post: (raw: string) => void): void {
    this.post = post;
  }

  send(command: Command): void {
    const full = { ...command, v: BRIDGE_VERSION } as SurfaceCommand;
    switch (full.type) {
      case 'load':
      case 'setOverlays':
      case 'highlight':
        this.state.set(full.type, full);
        break;
      case 'goToPage':
      case 'setZoom':
        if (!this.ready) this.pending.set(full.type, full);
        break;
    }
    if (this.ready) this.post(JSON.stringify(full));
  }

  /** Validates a raw message from the surface. Returns the event, or null if it is invalid. */
  receive(raw: unknown): SurfaceEvent | null {
    const event = parseMessage(surfaceEventSchema, raw);
    if (event?.type === 'ready') {
      this.ready = true;
      for (const type of ['load', 'setOverlays', 'highlight'] as const) {
        const command = this.state.get(type);
        if (command) this.post(JSON.stringify(command));
      }
      for (const command of this.pending.values()) this.post(JSON.stringify(command));
      this.pending.clear();
    }
    return event;
  }

  /** The surface is restarting (reload or crash): hold commands until it is ready again. */
  reset(): void {
    this.ready = false;
  }
}
