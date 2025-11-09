# Epic 1.3 – Error Boundaries & Graceful Failure

## Overview
- **Global boundary**: `ErrorBoundary` wraps the entire app (in `app/layout.tsx`) so unhandled runtime errors render a friendly message instead of crashing with a white screen.
- **Localized boundaries**: heavy client sections such as the map (`map/page.tsx`) and admin portal (`curation/page.tsx`) are also wrapped to isolate failures without affecting the rest of the page.
- **Network & backend visibility**: `NetworkStatusBanner` surfaces offline states, while `ErrorBanner` standardizes error toasts/banners for API failures, auth issues, and retry affordances.
- **Auth resilience**: `AuthProvider` now tracks `error` messages (exposed via `useAuth`) so sign-in/out/callback failures show actionable guidance on the login view.
- **React Query integration**: Map, Search, Upload vocabularies, and Curation Queue/Review workflows render `ErrorBanner` with retry buttons when queries reject (500s, network issues, etc.).

## Components

### `ErrorBoundary`
```tsx
<ErrorBoundary boundaryName="map panel">
  <DynamicMap />
</ErrorBoundary>
```
- `fallback` prop accepts either JSX or a render function.
- `boundaryName` is logged for telemetry and used in the default message.
- `resetErrorBoundary` restores the happy path if the user retries.

### `ErrorBanner`
```tsx
<ErrorBanner
  title="We couldn't load the catalog"
  message={errorMessage}
  tone="error"
  onRetry={() => refetch()}
  retryLabel="Retry search"
/>
```
- Supports tones (`error | warning | info | success`).
- Optional retry button doubles as a dismiss CTA when needed.

### `NetworkStatusBanner`
Listens to `online/offline` events and informs the user that the UI is in read-only/offline mode until connectivity resumes.

## React Query Patterns
```tsx
const {
  data,
  isLoading,
  error,
  refetch
} = useQuery({ queryKey: ['map-images'], queryFn: fetchImages });

if (isLoading) return <Spinner />;
if (error) {
  return (
    <ErrorBanner
      title="Error loading map data"
      message={humanizeError(error)}
      onRetry={() => refetch()}
    />
  );
}
```
- Always surface the failure path (no silent console errors).
- Provide a retry affordance that reuses the same `refetch`.
- Offer context (e.g., “This is usually a temporary issue”) for backend 500s.

## Auth & Offline Messaging
- `useAuth()` now returns `{ error, clearError }`. Surfaces in `auth/login` via the standard banner with a “Retry sign-in” button (calls `signIn` again).
- `NetworkStatusBanner` gives immediate feedback when the browser is offline, so users understand why queries fail (“We’ll auto-retry when you’re back online”).

## Where Applied
| Area | Resilience Feature |
| --- | --- |
| `app/layout.tsx` | Global boundary + offline banner |
| `app/map/page.tsx` | Local boundary + query error banner |
| `app/curation/page.tsx` | Local boundary around admin portal |
| `components/CurationQueue.tsx` | Query error banner with retry |
| `components/ReviewWorkflow.tsx` | Query error banner with retry |
| `app/upload/page.tsx` | Vocab fetch error banner |
| `app/search/page.tsx` | Search error banner |
| `app/auth/login/page.tsx` | Auth error banner with retry |

## Runbook Checklist
1. **Wrap new heavy views** in `<ErrorBoundary boundaryName="...">`.
2. **Handle every query failure** with `ErrorBanner` + retry (or a fallback CTA).
3. **Propagate meaningful error messages** from API utilities (but avoid leaking stack traces).
4. **Keep offline detection enabled** to explain errors stemming from `navigator.onLine === false`.
5. **Test** by simulating:
   - Network offline (`Chrome devtools → offline`).
   - 500 responses (mock server / Playwright route failures).
   - Throwing components to ensure the boundary fallback renders.
