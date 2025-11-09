# Epic 2.4 – Security & Hardening

## Default Security Headers
Configured globally via `next.config.js`:
- **Content-Security-Policy** limits scripts, styles, images, connections, and frames to trusted origins (self, SPC API, OpenStreetMap tiles, Sentry).
- **X-Frame-Options: DENY**, **X-Content-Type-Options: nosniff**, **Referrer-Policy: strict-origin-when-cross-origin**, **Permissions-Policy** (camera/mic/geolocation disabled) and **Strict-Transport-Security** (prod only).
- Requests to `/monitoring` tunnel Sentry traffic to avoid exposing DSN publicly.

## User-Generated Content
- All titles/descriptions/locations from the backend are now sanitized via `sanitizeText` (DOMPurify) before rendering (`page.tsx`, `images/page.tsx`, `hazards/page.tsx`, admin panels, etc.).
- When rich text is required, use `sanitizeRichText` to whitelist specific tags instead of `dangerouslySetInnerHTML`.

## Authentication Notes
- Return URLs from query params are normalized to same-origin paths before use (prevents open redirects).
- Access tokens are still stored client-side for now, but we added support for mirrored `Secure; SameSite=Strict` cookies so a future backend can migrate to HttpOnly cookies. On every login/logout the cookie is updated/cleared.
- For production, prefer issuing tokens via HttpOnly cookies from the API gateway and rely on backend session validation, keeping local storage only as an offline fallback.

## Analytics & Logging
- Sentry captures client errors (including React Query failures) and correlates them with session ids used by the analytics pipeline to ease cross-tier investigations.
- Custom analytics events intentionally avoid PII—only aggregate info such as hazard type, filter names, or upload states.

## Page-Level Checklist
1. **Headers**: ensure new pages don’t require CSP relaxations; if they do, document the rationale.
2. **User content**: pass every API string through `sanitizeText` before rendering or attributes. Never use `dangerouslySetInnerHTML` unless paired with DOMPurify.
3. **External resources**: load assets via Next’s pipeline (fonts, images) or add hosts to CSP explicitly; prefer `https`.
4. **Auth redirects**: run return URLs through `sanitizeReturnUrl` before storing/redirecting.
5. **Sensitive data**: never log tokens, emails, or payloads to analytics/Sentry; use correlation ids instead.
6. **Forms/uploads**: validate client-side (size/type) but assume backend re-validates; ensure user feedback doesn’t leak stack traces.

Following this checklist keeps the frontend acceptable for government/disaster-agency deployments while leaving room for future enhancements (e.g., full HttpOnly session cookies, per-page CSP tightening).
