# Epic 3.3 – Frontend Documentation & Onboarding

This guide explains how the Ocean Portal frontend is structured, how to extend it safely, and how the core citizen + admin flows work. It should help new contributors become productive within a couple of days.

---

## Frontend Architecture Overview

### Tech stack at a glance
- **Framework:** Next.js 15 (App Router) with React 19, TypeScript, and Tailwind CSS for styling.
- **State & data:** `@tanstack/react-query` for server data, `react-hook-form` for forms, and lightweight local state via React hooks.
- **API access:** Centralized Axios client defined in `frontend/src/lib/api.ts`, typed via `frontend/src/lib/types.ts`.
- **Auth:** SPC SSO (OAuth2/OIDC + PKCE) handled by `AuthProvider` (`frontend/src/providers/auth-provider.tsx`).
- **PWA/offline:** `next-pwa`, custom service worker registration, Sonner toasts, offline upload queue utilities (`frontend/src/lib/offline-uploads.ts`).
- **Tooling:** Jest + React Testing Library, Playwright (E2E), Storybook for design-system components, Lighthouse config for perf regressions.

### Directory map (frontend/src)
| Path | Purpose |
| --- | --- |
| `app/` | App Router tree. Each folder is a route segment with optional `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`. Shared `app/layout.tsx` wires global providers, analytics, keyboard shortcuts, the toaster, and accessibility affordances. |
| `components/` | Feature components (e.g., `CurationQueue`, `ReviewWorkflow`, `ImageFilters`). `components/design-system` exposes primitives (`Button`, `Card`, `FormField`, `Tag`, `Skeleton`) used to keep styling consistent. |
| `lib/` | Framework-agnostic utilities: API client, config, analytics helpers, offline queue, security helpers, map utils, keyboard shortcuts, sanitizers. |
| `providers/` | React context providers for auth, React Query cache, and analytics. They only mount once in `app/layout.tsx`. |

### Rendering & provider stack
`frontend/src/app/layout.tsx` defines `<RootLayout>` which:
1. Imports global CSS and `Inter` font.
2. Wraps every page with `<AuthProvider>` → `<QueryProvider>` → `<AnalyticsProvider>` and a top-level `<ErrorBoundary>`.
3. Mounts global UI helpers: service worker registration, keyboard shortcuts, PWA install prompt, toaster, keyboard shortcut help modal, and a network status banner.
4. Ensures accessibility via a skip link + `main#main-content`.

Because this layout lives at the root, any new page automatically benefits from auth state, caching, analytics events, and offline/pwa helpers with zero extra code.

### Data & state conventions
1. **API layer:** Add/modify calls in `frontend/src/lib/api.ts`. `APIClient` wraps Axios with base URL, timeout, auth token injection, and centralized error formatting. Avoid calling `fetch` directly from pages unless you have a strong reason (SSR streaming with `cache: 'no-store'` etc.). `imageApi` offers backwards-compatible helpers for legacy upload endpoints.
2. **React Query:** Use `useQuery` / `useMutation` with descriptive `queryKey`s. Global caching rules (retries, stale times) are defined in `frontend/src/providers/query-provider.tsx`. Always invalidate scoped keys after a mutation instead of refetching everything.
3. **Types:** co-locate request/response types in `frontend/src/lib/types.ts` to surface them to both API utilities and components. Narrow types early to guard UI states.

### Auth, permissions, and feature flags
`AuthProvider` stores the SPC SSO session, refresh token, and helper methods (`signIn`, `signOut`, `hasRole`). Client pages can gate functionality by calling `const { user, isAuthenticated, hasRole } = useAuth()`. Avoid duplicating auth logic elsewhere – the provider already handles PKCE, token refresh, and redirect sanitization.

### Offline & PWA surface area
- `frontend/src/components/service-worker-registration.tsx` wires `next-pwa`’s service worker.
- `NetworkStatusBanner` exposes connectivity state; `offline-uploads.ts` queues uploads in `localStorage`.
- Keyboard shortcuts and install prompts are globally available, so any new page should work offline where practical. If a page depends on online-only data, render an `ErrorBanner` with retry CTA similar to Upload/Curation pages.

### Testing touchpoints
- **Unit/UI:** place tests next to routes under `frontend/src/app/__tests__`. They render pages with Jest + RTL and mock API methods (see `map-page.test.tsx`).
- **Storybook:** showcase reusable components in `frontend/src/components/design-system/*.stories.tsx`.
- **E2E:** `npm run test:e2e` uses Playwright; prefer adding journeys that cover citizen uploads and admin approvals.
- **Quality gates:** `npm run lint`, `npm run test`, `npm run lighthouse:local` before shipping major UX work.

---

## How to Add a New Page

1. **Create the route segment**
   - Add a folder under `frontend/src/app`, e.g., `frontend/src/app/reports`.
   - Inside it, add `page.tsx`. Use the App Router defaults: server component by default; add `'use client';` at the top if you need hooks or browser-only APIs.

2. **Provide metadata (optional but recommended)**
   ```tsx
   // frontend/src/app/reports/page.tsx
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'Impact Reports',
     description: 'Generate and download curated impact reports.',
   };
   ```
   Use descriptive titles to improve Lighthouse + PWA install quality.

3. **Implement the UI**
   ```tsx
   // frontend/src/app/reports/page.tsx
   'use client';

   import { useQuery } from '@tanstack/react-query';
   import { oceanPortalApi } from '@/lib/api';
   import { Card } from '@/components/design-system';
   import ErrorBanner from '@/components/ErrorBanner';

   export default function ReportsPage() {
     const { data, isPending, error, refetch } = useQuery({
       queryKey: ['reports'],
       queryFn: () => oceanPortalApi.getReports(),
     });

     if (error) {
       return (
         <ErrorBanner
           tone="error"
           title="Unable to load reports"
           message="Check your connection and try again."
           onRetry={refetch}
         />
       );
     }

     return (
       <div className="max-w-7xl mx-auto py-8">
         <h1 className="text-3xl font-semibold mb-6">Impact Reports</h1>
         <Card className="space-y-4">
           {isPending ? 'Loading…' : data?.items?.map((report) => (
             <div key={report.id}>{report.name}</div>
           ))}
         </Card>
       </div>
     );
   }
   ```
   - Reuse design-system components for consistent spacing/typography.
   - Show loading, success, and error states explicitly (see Upload/Search pages).

4. **Hook the page into navigation**
   - If the route should be discoverable, add a CTA or button in `frontend/src/app/page.tsx` (home), or update whatever feature list references apply.
   - For keyboard shortcuts, register them in `frontend/src/lib/keyboard-shortcuts.ts`.

5. **Add supporting files when needed**
   - `loading.tsx` for skeletons while streaming.
   - `error.tsx` for route-level error boundaries.
   - Route-specific `layout.tsx` if you need sub-navigation.

6. **Test**
   - Add a Jest test covering the primary UI state if it handles important logic.
   - Consider a Storybook story for complex components extracted from the page.

---

## How to Add a New API Call

1. **Model the payload**
   - Update `frontend/src/lib/types.ts` with request/response interfaces.
   - Keep naming consistent with backend contract (`CamelCase` in TypeScript).

2. **Add the method to `APIClient`**
   ```ts
   // frontend/src/lib/api.ts
   class APIClient {
     // ...
     async getReports(): Promise<ReportsResponse> {
       const response = await this.client.get('/api/admin/reports');
       return response.data;
     }
   }
   ```

3. **Re-export helpers**
   - Call the method through `oceanPortalApi` (`export const oceanPortalApi = new APIClient();`).
   - Only touch `imageApi` if the endpoint must hit legacy routes (`/upload/*`).

4. **Consume it with React Query**
   ```ts
   const { data } = useQuery({
     queryKey: ['reports', filters],
     queryFn: () => oceanPortalApi.getReports(filters),
     staleTime: 5 * 60 * 1000,
   });
   ```
   - Invalidate targeted keys after mutations: `queryClient.invalidateQueries({ queryKey: ['reports'] })`.
   - Always surface network errors with `ErrorBanner` or Sonner toasts.

5. **Respect auth + config**
   - `APIClient` injects the bearer token automatically as long as the SPC session is stored (`localStorage`).
   - Use `getApiUrl()` when constructing manual `XMLHttpRequest`s (e.g., uploads) to stay in sync with `NEXT_PUBLIC_API_URL`.

6. **Tests**
   - Mock `oceanPortalApi` in Jest tests (`jest.mock('@/lib/api', () => ({ oceanPortalApi: { getReports: jest.fn() } }))`).
   - Add Playwright coverage if the call powers a critical journey.

---

## Main Flows

### Citizen Upload UX (`/upload`)
1. **Entry point:** `frontend/src/app/upload/page.tsx` is a client component that renders drag-and-drop upload UI, metadata form fields, and offline queue status banners.
2. **Form handling:** Uses `react-hook-form` for validation + error messaging, with shared `FormField` components for consistent labeling and accessibility.
3. **Metadata vocabularies:** `useQuery(['vocabularies'], () => imageApi.vocabularies())` populates dropdowns so the frontend stays in sync with backend-controlled taxonomies. Failures surface through `ErrorBanner` with retry affordances.
4. **File validation:** Client-side guards for size, extension, and filename patterns mirror backend rules (`config.UPLOAD`), preventing unnecessary upload attempts.
5. **Offline-first behavior:** If `navigator.onLine` is `false`, uploads are serialized into base64 and stored via `queueUpload`. `flushQueuedUploads` + `subscribeToOnlineFlush` auto-attempt sync when connectivity returns, with Sonner toasts summarizing success or retry states.
6. **Online uploads:** Successful submissions call `imageApi.upload(formData, onProgress)` which streams progress updates to a determinate progress bar. Upon success, React Query invalidates `['images']`, analytics events fire via `trackUploadEvent`, and the user is redirected home.
7. **User feedback:** Toasts, inline banners, and preview thumbnails keep the flow transparent. The NetworkStatusBanner plus queue counter warn users about pending uploads so they do not lose work.

### Admin Review UX (`/curation`)
1. **Entry point:** `frontend/src/app/curation/page.tsx` renders the admin portal shell: header, tabbed navigation, and layout transitions powered by Framer Motion.
2. **Dashboard + queue:** Tabs toggle between `CurationDashboard`, `CurationQueue`, `UserManagement`, and `BulkImportExport`. Each component fetches from `/api/admin/*` endpoints using React Query with scoped keys (`['curation-queue', filters, page]`, etc.).
3. **Queue management:** `CurationQueue` offers filtering, sorting, pagination, inline actions (approve/reject/flag), and uses `useMutation` to push status updates via `PUT /api/admin/curation/queue/:id`. Mutations invalidate the queue cache so counts stay accurate.
4. **Review workflow:** Selecting an item opens `ReviewWorkflow`, which fetches full metadata + comments, exposes assignment, flagging, duplicate detection, and metadata editing (`MetadataEditor`, `CommentsSystem`). Each action has its own mutation endpoint (`/assign`, `/flag`, `/duplicate`, metadata update) with optimistic UI cues.
5. **User management & bulk ops:** `UserManagement` handles role assignments, locking, and invites; `BulkImportExport` orchestrates long-running jobs with progress indicators. Both rely on shared API helpers for consistency.
6. **Error resilience:** Every panel is wrapped by `ErrorBoundary` (declared directly in the route) so a failed fetch or runtime error does not take down the entire admin experience. Each component renders `ErrorBanner` with retry hooks.
7. **Shortcuts & analytics:** Admin pages inherit global keyboard shortcuts and analytics instrumentation from `RootLayout`, so any navigation or status change can emit events without extra setup.

> Loom-style walkthroughs were not recorded in this iteration. If video documentation becomes a priority, capture the `/upload` and `/curation` flows using your preferred screen recorder and link them back here.

---

Need help? Reach out in the `#ocean-portal-frontend` channel with the page/API name and a link to your PR so reviewers can trace it against this guide.
