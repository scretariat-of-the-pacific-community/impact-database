'use client';

type AnalyticsEvent =
  | {
      name: 'page_view';
      properties: { path: string; sessionId: string };
    }
  | {
      name: 'upload';
      properties: { state: 'started' | 'succeeded' | 'failed'; hazardType?: string; sessionId: string };
    }
  | {
      name: 'filter_applied';
      properties: { filterType: string; value: string; activeCount: number; sessionId: string };
    }
  | {
      name: 'map_interaction';
      properties: { action: string; zoom?: number; lat?: number; lng?: number; sessionId: string };
    }
  | {
      name: 'query_error';
      properties: { key?: string; message: string; sessionId: string };
    };

const ANALYTICS_ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || '/api/analytics/events';
const STORAGE_KEY = 'ocean_portal_session';

const isBrowser = typeof window !== 'undefined';

const getSessionId = (): string => {
  if (!isBrowser) return 'server';
  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEY, generated);
  return generated;
};

const sendEvent = (event: AnalyticsEvent) => {
  if (!isBrowser) return;
  const payload = JSON.stringify(event);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ANALYTICS_ENDPOINT, payload);
    return;
  }
  fetch(ANALYTICS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[analytics] failed to send event', event);
    }
  });
};

export const trackPageView = (path: string) => {
  sendEvent({ name: 'page_view', properties: { path, sessionId: getSessionId() } });
};

export const trackUploadEvent = (state: 'started' | 'succeeded' | 'failed', hazardType?: string) => {
  sendEvent({
    name: 'upload',
    properties: { state, hazardType, sessionId: getSessionId() },
  });
};

export const trackFilterApplied = (filterType: string, value: string, activeCount: number) => {
  sendEvent({
    name: 'filter_applied',
    properties: { filterType, value, activeCount, sessionId: getSessionId() },
  });
};

export const trackMapInteraction = (action: string, details?: { zoom?: number; lat?: number; lng?: number }) => {
  sendEvent({
    name: 'map_interaction',
    properties: { action, sessionId: getSessionId(), ...details },
  });
};

export const trackQueryError = (key: string | undefined, message: string) => {
  sendEvent({
    name: 'query_error',
    properties: { key, message, sessionId: getSessionId() },
  });
};

export const trackEvent = sendEvent;

