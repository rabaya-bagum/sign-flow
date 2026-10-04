import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import type { SurfaceEvent } from '@shared/pdfBridge';

import { useTheme } from '@/theme';

import { SurfaceSession } from './surfaceSession';
import type { PdfSurfaceError, PdfSurfaceHandle, PdfSurfaceProps } from './types';

/** Wires PdfSurfaceProps to a SurfaceSession; the platform component attaches its transport. */
export function useSurface(props: PdfSurfaceProps, ref: Ref<PdfSurfaceHandle> | undefined) {
  const { url, overlays, highlightId, interactive = true } = props;
  const { t } = useTranslation();
  const theme = useTheme();
  const [session] = useState(() => new SurfaceSession());

  // Latest callbacks without re-subscribing.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const background = theme.colors.background;
  const pageLabel = t('viewer.pageLabel', { page: '{page}', total: '{total}' });
  // The theme colour is sent separately, so switching light/dark never reloads the document.
  const backgroundRef = useRef(background);
  useEffect(() => {
    backgroundRef.current = background;
    session.send({ type: 'setBackground', background });
  }, [session, background]);
  useEffect(() => {
    if (url) session.send({ type: 'load', url, background: backgroundRef.current, pageLabel, interactive });
  }, [session, url, pageLabel, interactive]);
  useEffect(() => {
    session.send({ type: 'setOverlays', overlays: overlays ?? [] });
  }, [session, overlays]);
  useEffect(() => {
    session.send({ type: 'highlight', id: highlightId ?? null });
  }, [session, highlightId]);

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (page) => session.send({ type: 'goToPage', page }),
      setZoom: (zoom) => session.send({ type: 'setZoom', zoom: Math.min(4, Math.max(1, zoom)) }),
    }),
    [session],
  );

  const receive = (raw: unknown) => {
    const event = session.receive(raw);
    if (event) dispatch(event, propsRef.current);
  };

  const fail = useCallback((error: PdfSurfaceError) => propsRef.current.onError?.(error), []);

  return { session, receive, fail };
}

function dispatch(event: SurfaceEvent, props: PdfSurfaceProps) {
  switch (event.type) {
    case 'loaded':
      props.onLoaded?.({ pageCount: event.pageCount, pages: event.pages });
      break;
    case 'pageChanged':
      props.onPageChanged?.(event.page, event.pageCount);
      break;
    case 'zoomChanged':
      props.onZoomChanged?.(event.zoom);
      break;
    case 'tap':
      props.onTap?.({ page: event.page, x: event.x, y: event.y });
      break;
    case 'error':
      props.onError?.({ code: event.code, message: event.message });
      break;
    case 'overlayTap':
      props.onOverlayTap?.(event.id);
      break;
    case 'overlayChanged':
      props.onOverlayChanged?.({ id: event.id, page: event.page, rect: event.rect });
      break;
  }
}
