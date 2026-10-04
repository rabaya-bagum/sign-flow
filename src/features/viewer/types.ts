import type { StyleProp, ViewStyle } from 'react-native';

import type { PageGeometry, SurfaceOverlay } from '@shared/pdfBridge';

export interface PdfSurfaceError {
  code: 'PDF_RENDER_FAILED' | 'NETWORK_OFFLINE';
  message: string;
}

export interface PdfSurfaceProps {
  /** Short-lived signed URL of the PDF (already rebased with toAppUrl). Null shows an empty surface. */
  url: string | null;
  overlays?: SurfaceOverlay[];
  /** false renders a static first-page preview (no scroll, zoom or taps). Default true. */
  interactive?: boolean;
  highlightId?: string | null;
  onLoaded?: (info: { pageCount: number; pages: PageGeometry[] }) => void;
  onPageChanged?: (page: number, pageCount: number) => void;
  onZoomChanged?: (zoom: number) => void;
  /** Tap on a page, in displayed page fractions (top-left origin, SPEC §8.1). */
  onTap?: (tap: { page: number; x: number; y: number }) => void;
  onError?: (error: PdfSurfaceError) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface PdfSurfaceHandle {
  goToPage(page: number): void;
  setZoom(zoom: number): void;
}
