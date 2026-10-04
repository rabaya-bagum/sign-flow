import { parseMessage, surfaceCommandSchema, type SurfaceCommand, type SurfaceEvent } from '../../../shared/pdfBridge';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

const listeners: ((event: SurfaceEvent) => void)[] = [];
let hostOrigin: string | null = null;

/** Sends an event to the host (native WebView, or the parent window on web). */
export function emit(event: SurfaceEvent): void {
  const message = JSON.stringify(event);
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(message);
  } else if (window.parent !== window) {
    // Until the host has spoken we only send `ready`, which carries no data.
    window.parent.postMessage(message, hostOrigin ?? (event.type === 'ready' ? '*' : 'null'));
  }
  for (const listener of listeners) listener(event);
}

/** Test hook: observe emitted events in-page. */
export function onEmit(listener: (event: SurfaceEvent) => void): void {
  listeners.push(listener);
}

/** Receives validated commands. Invalid or foreign messages are ignored. */
export function listen(handler: (command: SurfaceCommand) => void): void {
  const receive = (event: MessageEvent) => {
    const fromParent = window.parent !== window && event.source === window.parent;
    // react-native-webview delivers host messages with no source window.
    const fromNative = Boolean(window.ReactNativeWebView) && (event.source === null || event.source === window);
    if (!fromParent && !fromNative) return;
    const command = parseMessage(surfaceCommandSchema, event.data);
    if (!command) return;
    if (fromParent && event.origin && event.origin !== 'null') hostOrigin = event.origin;
    handler(command);
  };
  window.addEventListener('message', receive);
  // Android react-native-webview dispatches on document.
  document.addEventListener('message', receive as unknown as EventListener);
}
