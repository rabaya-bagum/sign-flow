import { useAssets } from 'expo-asset';
import { useEffect, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { useTheme } from '@/theme';

import { SURFACE_ASSET } from './surfaceAsset';
import type { PdfSurfaceHandle, PdfSurfaceProps } from './types';
import { useSurface } from './useSurface';

/** The page URL without a fragment, for comparing navigation requests. */
const pageOf = (url: string) => url.split('#')[0];

/**
 * PDF renderer (native): the offline pdf.js surface in a locked-down WebView, loaded from the app's
 * own asset file. The surface fetches the signed URL itself (range requests), so PDF bytes never
 * cross the bridge. Only bridge messages validated by shared/pdfBridge.ts are acted on.
 */
export function PdfSurface({ ref, ...props }: PdfSurfaceProps & { ref?: Ref<PdfSurfaceHandle> }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [assets, assetError] = useAssets(SURFACE_ASSET);
  const { session, receive, fail } = useSurface(props, ref);
  // Remounts the WebView after its content process dies (iOS memory pressure, Android renderer crash).
  const [generation, setGeneration] = useState(0);

  const asset = assets?.[0];
  const surfaceUri = asset?.localUri ?? null;
  useEffect(() => {
    if (assetError) fail({ code: 'PDF_RENDER_FAILED', message: assetError.message });
  }, [assetError, fail]);

  const restart = () => {
    session.reset();
    setGeneration((g) => g + 1);
  };

  const allowOnly = (request: ShouldStartLoadRequest) =>
    surfaceUri !== null && pageOf(request.url) === pageOf(surfaceUri);

  const onMessage = (event: WebViewMessageEvent) => {
    if (surfaceUri === null || pageOf(event.nativeEvent.url) !== pageOf(surfaceUri)) return;
    receive(event.nativeEvent.data);
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }, props.style]}
      testID={props.testID}
    >
      {surfaceUri ? (
        <WebView
          key={generation}
          ref={(webView) => {
            session.attach((raw) => webView?.postMessage(raw));
          }}
          source={{ uri: surfaceUri }}
          originWhitelist={['file://']}
          onShouldStartLoadWithRequest={allowOnly}
          onMessage={onMessage}
          onContentProcessDidTerminate={restart}
          onRenderProcessGone={restart}
          onLoadStart={() => session.reset()}
          // The surface is a local file that only needs itself; it must not read other files.
          allowingReadAccessToURL={surfaceUri.replace(/[^/]*$/, '')}
          allowFileAccess
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          // Signed PDFs are not kept in the WebView's caches.
          cacheEnabled={false}
          incognito
          domStorageEnabled={false}
          thirdPartyCookiesEnabled={false}
          sharedCookiesEnabled={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          allowsLinkPreview={false}
          allowsBackForwardNavigationGestures={false}
          textInteractionEnabled={false}
          // The surface handles pinch, double tap and scrolling itself.
          setBuiltInZoomControls={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          webviewDebuggingEnabled={__DEV__}
          style={[styles.webView, { backgroundColor: theme.colors.background }]}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.textSecondary} accessibilityLabel={t('common.loading')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  webView: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
