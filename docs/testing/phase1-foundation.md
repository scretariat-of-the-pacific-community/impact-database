# Phase 1 – Foundation (Trustworthy & Accessible)

## Epic 1.1 – Testing up to a respectable baseline

**Goal:** lift the frontend from ~0 tests to a defensible baseline that exercises the four citizen-science flows (login, upload, review/approve, map/search). We now have representative component/integration coverage in Jest + React Testing Library, plus a concrete plan for smoke/E2E validation.

> **Lockfile ownership:** the frontend relies solely on `frontend/package-lock.json`. The root lockfile was removed so `npm test` no longer emits duplicate lock warnings—always install dependencies from `frontend/`.

### Coverage snapshot

| Flow | Component focus | Integration focus | Smoke/E2E target |
| --- | --- | --- | --- |
| Login | CTA panel + loading states | Redirect + SSO trigger logic | SSO start & guest fallback |
| Upload | File picker + validation helper | Metadata submission + success/error UI | Upload + confirmation toast |
| Review/Approve | Queue cards + review actions | Status transitions + reviewer notes | Approve/Reject happy paths |
| Map/Search | Filters + summary badges | Map markers + filter persistence | Filter impacts on map + detail drill-down |

## Flow test cases

### 1. Login form (`src/app/auth/login/page.tsx`)
- **Render guest CTA:** hero copy, SSO button, guest access prompt visible when `useAuth` reports anonymous.
- **Start SSO:** clicking “Sign In with SPC SSO” calls `signIn(returnUrl)` and disables the button while pending.
- **Failed SSO attempt:** rejected `signIn` promise restores the button label so the user can retry.
- **Guest continue:** the “Continue as Guest” text button routes to `/`.
- **Already authenticated:** `useAuth` returning `isAuthenticated=true` pushes to `returnUrl`.
- **Example tests:** `frontend/src/app/__tests__/auth-login.test.tsx`.

### 2. Upload image + metadata (`src/app/upload/page.tsx`)
- **Vocabularies load:** hazard/country selects show loading copy until `imageApi.vocabularies` resolves.
- **File validation errors:** submitting without a file or with a disallowed extension surfaces `validationError`.
- **Happy-path upload:** selecting a valid file, filling required metadata, and submitting calls `imageApi.upload` and shows the progress indicator.
- **Upload failure:** a rejected `imageApi.upload` call clears progress and logs an error (assert via mocked console).
- **Example tests:** `frontend/src/app/__tests__/upload-page.test.tsx`.

### 3. Review/approve submission (`src/components/ReviewWorkflow.tsx`)
- **Loading skeleton:** spinner renders while the review item is being fetched.
- **Error banner:** failed fetch shows the red “Error loading review item” alert.
- **Successful load:** reviewer sees metadata chips, notes textarea, and action buttons once the API returns data.
- **Status transitions:** clicking “Approve/Reject/Needs Changes” issues the corresponding `PUT /queue/:id` request and calls `onStatusChange`.
- **Flag + assign:** “Assign to Me” and “Flag” trigger the respective POST endpoints and disable the button while pending (covered via spies in future tests).
- **Example tests:** `frontend/src/components/__tests__/ReviewWorkflow.test.tsx`.

### 4. Filtered map view (`src/app/map/page.tsx`)
- **Loading state:** spinner on first render while `imageApi.search` resolves.
- **Error state:** API errors show a helpful message and retry CTA.
- **Marker rendering:** only images with latitude/longitude render markers; popup links point to `/images/:id`.
- **Empty-state:** zero geocoded images renders an empty map container without markers (assert by length 0).
- **Example tests:** `frontend/src/app/__tests__/map-page.test.tsx`.

## Smoke/E2E plan (Playwright)

| Scenario | Description | Notes |
| --- | --- | --- |
| 1. Login + guest fallback | Hit `/auth/login`, assert CTA copy, complete the mocked SSO handshake, ensure redirect to dashboard; second run selects “Continue as Guest” and verifies limited access banner. | Requires SSO mock route + storage seeding. |
| 2. Citizen upload | Authenticated user selects an image, fills metadata, submits, and sees the success toast plus new record in `/images`. | Stub upload API + fixture image. |
| 3. Admin approve | Admin visits `/curation`, opens first queue item, approves it, and sees the status chip update in the queue. | Seed queue fixture via API mock. |
| 4. Map filter | Visitor opens `/map`, sets hazard filter (query param), confirms map marker count updates, and drills into `/images/:id`. | Use network interception to stub `/api/v1/images/search`. |

Create these in `frontend/tests/e2e/core-flows.spec.ts` once Playwright is wired (tracked follow-up). ✅ Implemented via Playwright with network stubs so they can run against a local `next dev` server.

## How to run

```bash
cd frontend
npm test                # component + integration suite
npm run test:e2e        # smoke/E2E suite (requires Next dev server; automatically launched)
npx playwright install  # run once to install Chromium binaries for the suite
```

This document plus the new Jest suites take us through Phase 1; expanding Playwright, tightening coverage per component, and measuring % targets are the next checkpoints.
