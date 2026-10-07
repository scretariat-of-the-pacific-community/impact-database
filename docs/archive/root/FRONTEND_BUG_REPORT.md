# Frontend Bug Report & Code Quality Issues

**Date:** December 19, 2025
**Severity Legend:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Critical Bugs 🔴

### 1. Missing OAuth `state` Validation (Open Redirect / CSRF)
**File:** [frontend/src/providers/auth-provider.tsx](frontend/src/providers/auth-provider.tsx#L102-L218)

**Issue:** The PKCE flow generates a random `state` value before redirecting to the identity provider, but the value is never stored or compared when `handleCallback` runs. The `state` argument that comes back from the IdP is ignored entirely.

**Impact:**
- Enables CSRF/authorization code injection: an attacker can complete the flow against their own account and push the victim’s browser through the callback URL, forcing the victim to sign in as the attacker.
- Breaks the threat model required by OAuth/OIDC; auditors will flag this immediately.

**Fix:**
1. Persist the generated `state` in `sessionStorage` (e.g., `sessionStorage.setItem('oauth_state', state)`).
2. In `handleCallback`, read the stored value and verify it matches the `state` param. Reject the callback and clear storage if it does not.

```ts
const state = crypto.randomUUID();
sessionStorage.setItem('oauth_state', state);
// ...
const storedState = sessionStorage.getItem('oauth_state');
if (!state || state !== storedState) throw new Error('State mismatch');
```

---

### 2. Upload Requests Ignore Cookie-Based Auth
**File:** [frontend/src/lib/api.ts](frontend/src/lib/api.ts#L471-L525)

**Issue:** The `imageApi.upload` helper bypasses the shared Axios client and rolls its own `XMLHttpRequest`:
- It only adds an `Authorization` header if it finds `authToken` in `localStorage`. When tokens live in httpOnly cookies (per security policy), uploads immediately fail with 401.
- The request never sets `xhr.withCredentials = true`, so browser cookies are not sent to the API origin even if they exist.

**Impact:**
- Core upload flow is broken for any account that completed the cookie-based login. QA reproduced this with a `401 Unauthorized` every time.
- Developers are forced to keep tokens in `localStorage`, re‑introducing the very XSS risk we were trying to remove.

**Fix:**
1. Replace the custom XHR with `fetch`/`axios` configured with `credentials: 'include'`, or at minimum set `xhr.withCredentials = true`.
2. Stop reading from `localStorage`—rely on cookies that the browser attaches automatically.
3. Prefer reusing the hardened `authFetch` helper so progress callbacks and errors stay consistent.

---

## High Priority Bugs 🟠

### 3. Session Tokens Persist in `localStorage`
**File:** [frontend/src/providers/auth-provider.tsx](frontend/src/providers/auth-provider.tsx#L200-L296)

**Issue:** `storeSession` serializes the entire `AuthSession` (including `access_token` + `refresh_token`) into `localStorage` under `ocean_portal_session`. This contradicts the documented “cookies only” posture and leaves bearer tokens readable by any script on the page.

**Impact:**
- Any XSS (even a minor content injection) can exfiltrate long‑lived access and refresh tokens.
- PWAs running on shared devices can leak credentials between users because `localStorage` lacks per-session isolation.

**Fix:**
1. Move token storage entirely to server-set httpOnly cookies; the frontend should only cache non-sensitive display data.
2. If offline support is mandatory, encrypt tokens with WebCrypto + device binding and store them in IndexedDB, never plain `localStorage`.
3. After migrating, make `AuthProvider` read session info via a `/api/auth/me` call instead of trusting client storage.

---

## Medium Priority Bugs 🟡

### 4. Search Filters Are Not Shareable or Restorable
**File:** [frontend/src/app/search/page.tsx](frontend/src/app/search/page.tsx#L164-L234)

**Issue:** Filter interactions (hazard, agency, date, sort) mutate component state and `localStorage`, but only the `q` and `page` parameters are synced to the URL. Sharing `/search?...` links therefore drops every filter except the keyword, and users who clear their storage lose their saved view.

**Impact:**
- Analysts cannot share an exact filtered view with colleagues—links reopen with default filters, leading to inconsistent reviews.
- Browser navigation/back-forward feels broken because the filter state is not encoded in history entries.

**Fix:**
1. Push filter selections into the URL query string whenever they change (e.g., `hazard=flood&agency=spc&date_from=...`).
2. Read from the URL first, falling back to `localStorage` only if no params are set.
3. Consider using `router.replace` to avoid cluttering history for rapid toggles.

---

### 5. `navigator` Referenced During Server Render (Mobile Upload Offline Banner)
**File:** [frontend/src/app/upload/mobile/page.tsx](frontend/src/app/upload/mobile/page.tsx#L502-L519)

**Issue:** The JSX renders `{!navigator.onLine && (...)}`. Next.js still evaluates Client Components on the server during the build/initial render, where `navigator` is undefined. This crashes `next build`, Storybook, and any Jest test that imports the page (`ReferenceError: navigator is not defined`).

**Impact:**
- The mobile upload route cannot be pre-rendered, so CI builds fail unless the file is stubbed.
- Local developers running `next build` hit a hard crash before deployment.

**Fix:**
Wrap the check in a browser guard (or derive `isOffline` from `useState`):
```tsx
const [isOffline, setIsOffline] = useState(false);
useEffect(() => {
  if (typeof navigator !== 'undefined') {
    setIsOffline(!navigator.onLine);
    const handler = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }
}, []);
// ...
{isOffline && <Card>...</Card>}
```

---

## Testing Recommendations
- [ ] Regression test OAuth login: verify mismatched `state` rejects the callback.
- [ ] Upload an image with tokens stored only in cookies to confirm the XHR path works after the fix.
- [ ] Automated security test ensuring `localStorage` never contains `access_token` or `refresh_token`.
- [ ] E2E search test that reloads a filtered URL and checks the filters stay applied.
- [ ] `next build` / Jest smoke test for the mobile upload page to ensure no `navigator` reference remains in render.

---

## Estimated Fix Effort
- Critical items (#1–2): ~6–8 hours (auth flow refactor + upload client rewrite).
- High (#3): ~4 hours (session storage redesign, QA).
- Medium (#4–5): ~3 hours (URL sync + render guard).

**Total:** Roughly 13–15 engineering hours including testing.
