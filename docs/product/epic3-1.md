# Epic 3.1 – PWA, Offline & UX Polish

## Progressive Web App & Offline
- **Manifest refresh** (`public/manifest.json`): branded name/colors, maskable icons, shortcuts, and screenshots tuned for field deployments.
- **Custom service worker** (`public/sw.js`): caches the application shell, serves `/offline`, and keeps API responses available when networks flap. The SW listens for `SKIP_WAITING` to hot-update itself.
- **Offline page** (`src/app/offline/page.tsx`): explains what still works, surfaces quick links, and reminds field users that queued uploads sync automatically.
- **Upload queue** (`src/lib/offline-uploads.ts`, `src/app/upload/page.tsx`): submissions captured while offline are encoded locally, surfaced to the operator, and flushed as soon as connectivity returns.

## UX Polish & Micro-interactions
- **Skeletons** (`src/components/design-system/Skeleton.tsx`) drive premium-feeling loading states across the dashboard/search pages.
- **Map experience** (`src/app/map/page.tsx`) now ships animated insight cards, a shimmering loader, and an empty state to guide analysts while data syncs.
- **Navigation animations** on the home cards (Framer Motion) and enhanced empty states keep the UI responsive even on slow links.
- **Keyboard shortcuts** in the review workflow (`A`, `R`, `N`, `F`) speed up curator triage.
- **Persistent filters**: search and gallery filters survive reloads/new sessions via localStorage so analysts aren’t re-tuning every time.

## Field Checklist
1. **Add to home screen** – installable manifest and icons are in place.
2. **Network drops** – confirm uploads fall into the offline queue; retry via the banner when back online.
3. **Cache warm-up** – visit `/`, `/search`, `/upload`, `/offline` once before going remote so they’re stored in the shell cache.
4. **Keyboard-driven curation** – use `A/R/N/F` to process submissions faster during surge operations.

## Offline upload queue – operator guide
1. Capture a submission while offline from `/upload`. The form stores the payload (metadata + base64 file) inside `localStorage` under `ocean_offline_uploads` via `src/lib/offline-uploads.ts`.
2. The upload page surfaces a banner that lists how many submissions are queued plus a toast-style confirmation.
3. As soon as the browser regains connectivity, `subscribeToOnlineFlush` triggers `flushQueuedUploads`, which replays each payload through the normal upload API and removes successful entries.
4. Operators can force a retry with **Sync now** (calls `flushQueuedUploads`) or clear the queue manually by clearing browser storage during testing.

### Manual test recipe
1. Open DevTools → Network tab → toggle **Offline**.
2. Fill `/upload`, submit, and confirm the banner shows “Stored offline…”.
3. Toggle network **Online** and watch the banner update to “Queued uploads synced successfully” or use the **Sync now** button to flush on demand.
