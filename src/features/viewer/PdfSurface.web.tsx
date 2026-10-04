import { Asset } from 'expo-asset';
import { useEffect, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { SURFACE_ASSET } from './surfaceAsset';
import type { PdfSurfaceHandle, PdfSurfaceProps } from './types';
import { useSurface } from './useSurface';

/**
 * PDF renderer (web): the same offline surface as native, in a sandboxed iframe. `allow-scripts`
 * without `allow-same-origin` gives it an opaque origin, so it cannot reach the app's storage or
 * session. Messages are accepted only from that iframe's window.
 */
export function PdfSurface({ ref, ...props }: PdfSurfaceProps & { ref?: Ref<PdfSurfaceHandle> }) {
  const theme = useTheme();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const { session, receive } = useSurface(props, ref);
  const receiveRef = useRef(receive);
  useEffect(() => {
    receiveRef.current = receive;
  });

  useEffect(() => {
    // The surface has an opaque origin, which cannot be named as a target; the message still only
    // goes to this iframe's window.
    session.attach((raw) => frameRef.current?.contentWindow?.postMessage(raw, '*'));
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      receiveRef.current(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [session]);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }, props.style]}
      testID={props.testID}
    >
      <iframe
        ref={frameRef}
        src={Asset.fromModule(SURFACE_ASSET).uri}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title="PDF"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
});
