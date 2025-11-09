# Epic 2.3 – Monitoring, Logging & Analytics

## What’s in place
- **Sentry** (`@sentry/nextjs`): initialized for client, server, and edge runtimes (`sentry.*.config.ts`). It captures unhandled exceptions, React Query failures, and frontend traces (sampled) plus lightweight session replays (low rate, masked inputs).
- **Query error reporting**: `QueryProvider` pipes query/mutation errors into Sentry and the analytics pipeline with metadata (`queryKey`, mutation key).
- **Usage analytics** (`src/lib/analytics.ts`):
  - Generates an anonymous session id (stored in `sessionStorage`) to correlate events.
  - Sends events via `navigator.sendBeacon` to `/api/analytics/events` (or `NEXT_PUBLIC_ANALYTICS_ENDPOINT`).
  - Tracks page views (via `AnalyticsProvider`), filter interactions, upload lifecycle (started/succeeded/failed), map movements, and query errors.
- **UX instrumentation**:
  - Upload form fires telemetry on start/success/failure.
  - Search filters emit `filter_applied` events whenever hazard/country/date filters change or are cleared.
  - Map view logs initial load + every pan/zoom (with coarse lat/lng + zoom only).

## Privacy & Security Considerations
- No personal data or raw metadata payloads are sent—only high-level event names plus derived counts/booleans.
- Sentry Replay masks inputs + media; sample rates default to low values (override via env vars).
- Session ids are anonymous UUIDs stored in `sessionStorage`, expiring with the tab.
- If you extend analytics, keep the payload limited to aggregate state (e.g., filter name) and never include filenames, emails, or auth tokens.

## Environment Variables
```bash
NEXT_PUBLIC_SENTRY_DSN=<dsn>
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE=0.01
NEXT_PUBLIC_ANALYTICS_ENDPOINT=/api/analytics/events  # optional custom endpoint
```

## Extending Analytics
Use the helpers in `src/lib/analytics.ts`:
```ts
import { trackMapInteraction, trackFilterApplied } from '@/lib/analytics';

trackFilterApplied('sidebar', 'hazard:flood', activeHazardCount);
trackMapInteraction('zoom_button', { zoom: map.getZoom() });
```

If you add a new event:
1. Define a typed union in `analytics.ts` so payloads stay consistent.
2. Call the helper from client components only (`'use client'` guard).
3. Update your backend analytics endpoint to store / dashboard the events.

## Sentry + Backend Correlation
- Every Sentry event automatically carries the anonymous session id (stored via analytics) so backend logs can include the same id (e.g., pass it as `X-Session-Id` header when calling APIs).
- For deeper traces, propagate Sentry’s `sentry-trace` header (already handled by SDK for fetch/XHR).

## Operational Runbook
1. Configure DSN + sample rates in the deployment environment.
2. Wire `/api/analytics/events` to your logging or BI stack (Matomo/PostHog, etc.).
3. Review Sentry issues routinely (triage severity, link to backend incidents via session id).
4. Expand instrumentation for future epics: more granular map events, upload drop-offs, etc.
