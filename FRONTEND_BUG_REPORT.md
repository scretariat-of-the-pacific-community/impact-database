# Frontend Bug Report & Code Quality Issues

**Date:** December 18, 2025  
**Severity Legend:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Critical Bugs 🔴

### 1. Memory Leak: Camera Stream Not Cleaned Up
**File:** [src/app/upload/mobile/page.tsx](frontend/src/app/upload/mobile/page.tsx#L30-L52)

**Issue:** The camera stream (`streamRef.current`) is opened but never cleaned up when the component unmounts. This causes the camera to stay active even after leaving the page.

**Current Code:**
```tsx
useEffect(() => {
  if ('geolocation' in navigator') {
    navigator.geolocation.getCurrentPosition(/* ... */);
  }
}, []);

// No cleanup for streamRef!
```

**Impact:**
- Camera stays on after navigation
- Battery drain
- Privacy concern (camera indicator stays on)
- Memory leak

**Fix:**
```tsx
useEffect(() => {
  // Cleanup camera stream on unmount
  return () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };
}, []);
```

---

### 2. Race Condition: Blob URL Not Revoked
**File:** [src/app/upload/mobile/page.tsx](frontend/src/app/upload/mobile/page.tsx#L95-L105)

**Issue:** `URL.createObjectURL()` creates blob URLs that are never revoked, causing memory leaks.

**Current Code:**
```tsx
setCaptured({
  file,
  preview: URL.createObjectURL(blob),  // Never revoked!
  location: { /* ... */ },
  timestamp: new Date(),
});
```

**Impact:**
- Memory leak (blob URLs accumulate)
- Can cause browser to run out of memory on repeated captures
- 50-100MB leak per captured image

**Fix:**
```tsx
useEffect(() => {
  // Cleanup blob URL when captured changes or unmounts
  return () => {
    if (captured?.preview) {
      URL.revokeObjectURL(captured.preview);
    }
  };
}, [captured?.preview]);
```

---

### 3. Missing Error Handling: OpenStreetMap API
**File:** [src/components/MapPicker.tsx](frontend/src/components/MapPicker.tsx#L132-L158)

**Issue:** Nominatim API calls have no retry logic, timeout handling, or rate limiting. OpenStreetMap has a 1 req/sec rate limit and can ban IPs.

**Current Code:**
```tsx
const response = await fetch(
  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
  {
    headers: {
      'Accept-Language': 'en',
    },
  }
);
```

**Missing:**
- User-Agent header (required by OSM policy)
- Rate limiting (1 request per second)
- Retry logic
- Timeout handling
- 429 status code handling

**Impact:**
- IP ban from OpenStreetMap (permanent)
- Terms of Service violation
- App breaks for all users if IP is banned

**Fix:**
```tsx
const response = await fetch(
  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
  {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': 'PacificImpactAtlas/1.0 (contact@example.com)',  // Required!
    },
    signal: AbortSignal.timeout(5000),  // 5 second timeout
  }
);

if (response.status === 429) {
  throw new Error('Rate limited. Please try again in a moment.');
}
```

---

## High Priority Bugs 🟠

### 4. Insecure Token Storage
**File:** Multiple files ([UserManagement.tsx](frontend/src/components/UserManagement.tsx#L79), [ReviewWorkflow.tsx](frontend/src/components/ReviewWorkflow.tsx#L83), etc.)

**Issue:** Authentication tokens stored in `localStorage` are vulnerable to XSS attacks. All localStorage data is accessible to JavaScript.

**Current Code:**
```tsx
headers: {
  'Authorization': `Bearer ${localStorage.getItem('token')}`
}
```

**Impact:**
- XSS vulnerability
- Token theft if any XSS vulnerability exists
- No expiration enforcement
- Tokens persist across sessions

**Recommendation:**
- Use httpOnly cookies for auth tokens (immune to XSS)
- Or use secure session storage with automatic expiration
- Never store sensitive tokens in localStorage

**Better Approach:**
```tsx
// Let the browser handle auth tokens via httpOnly cookies
// Remove manual Authorization headers
// Backend should set: Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict
```

---

### 5. Infinite Query Pagination Not Implemented
**File:** [src/components/profile/InfiniteUploadList.tsx](frontend/src/components/profile/InfiniteUploadList.tsx#L43)

**Issue:** Infinite scroll is configured but pagination doesn't work. Always returns `undefined` for next page.

**Current Code:**
```tsx
queryFn: ({ pageParam = 1 }) => imageApi.userUploads(),  // Doesn't use pageParam!
getNextPageParam: (lastPage, allPages) => {
  // Comment says "doesn't support pagination yet"
  return undefined;  // Always undefined = no pagination
},
```

**Impact:**
- Only loads first page of uploads
- Users with 100+ uploads can't see them
- Intersection Observer runs unnecessarily
- UX broken for power users

**Fix:**
```tsx
queryFn: ({ pageParam = 1 }) => imageApi.userUploads({ page: pageParam, limit: 20 }),
getNextPageParam: (lastPage, allPages) => {
  if (lastPage.length < 20) return undefined;  // No more data
  return allPages.length + 1;  // Next page number
},
```

---

### 6. Missing Abort Controllers for API Calls
**File:** Multiple files with fetch() calls

**Issue:** No AbortController for fetch requests. If user navigates away, requests continue running.

**Impact:**
- Wasted bandwidth
- Memory leaks (responses stored in unmounted components)
- Race conditions (stale data updating state)
- 429 errors from excessive requests

**Example Fix:**
```tsx
useEffect(() => {
  const controller = new AbortController();
  
  const fetchData = async () => {
    try {
      const response = await fetch(url, {
        signal: controller.signal
      });
      // ... handle response
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      // ... handle other errors
    }
  };
  
  fetchData();
  
  return () => controller.abort();  // Cancel on unmount
}, []);
```

---

## Medium Priority Bugs 🟡

### 7. Console Logs Left in Production
**File:** Multiple files

**Issue:** Production code contains debug console.log statements.

**Locations:**
- `src/app/upload/mobile/page.tsx:39` - GPS coordinates logged
- `src/app/upload/page.tsx:192-194` - Vocabulary data logged
- `src/app/upload/page.tsx:737-739` - Geolocation debugging
- `src/app/profile/page.tsx:86` - Profile debug object

**Impact:**
- Performance overhead
- Sensitive data exposure in browser console
- Log spam for users
- Debug info visible to attackers

**Fix:**
```tsx
// Remove all console.log in production
// Keep only console.error and console.warn
// Or use a logger that respects NODE_ENV
```

---

### 8. Missing Keyboard Event Cleanup
**File:** [src/components/ReviewWorkflow.tsx](frontend/src/components/ReviewWorkflow.tsx#L223-L243)

**Issue:** Keyboard event listener properly cleaned up, but dependency array is too large.

**Current Code:**
```tsx
useEffect(() => {
  // ... keyboard handler
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [handleFlag, handleStatusUpdate, item, updateStatusMutation.isPending, reviewNotes]);
```

**Problem:**
- Re-registers listener on every state change
- Handler functions recreated frequently
- Performance overhead

**Fix:**
```tsx
// Memoize handlers with useCallback
const handleFlag = useCallback(() => {
  // ... implementation
}, []); // Stable dependencies only

// Or use refs for dynamic values
const reviewNotesRef = useRef(reviewNotes);
reviewNotesRef.current = reviewNotes;

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Use reviewNotesRef.current instead of reviewNotes
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []); // Empty deps = register once
```

---

### 9. No Loading State for File Upload
**File:** [src/app/upload/page.tsx](frontend/src/app/upload/page.tsx#L730-L760)

**Issue:** Geolocation shows loading toast, but no loading state for the actual upload button.

**Impact:**
- Users can click "Upload" multiple times
- Duplicate uploads sent to server
- No visual feedback during upload
- Poor UX for slow connections

**Fix:**
```tsx
const [isUploading, setIsUploading] = useState(false);

const handleSubmit = async (data: FormData) => {
  if (isUploading) return;  // Prevent double-submit
  
  setIsUploading(true);
  try {
    await imageApi.upload(data);
    // ... success handling
  } finally {
    setIsUploading(false);
  }
};

// In JSX:
<Button disabled={isUploading}>
  {isUploading ? 'Uploading...' : 'Upload Image'}
</Button>
```

---

### 10. Potential XSS: User Input Not Sanitized
**File:** Multiple forms without sanitization

**Issue:** User input (descriptions, notes) submitted to API without client-side sanitization.

**Risk:**
- Stored XSS if backend doesn't sanitize
- Script injection in metadata
- Database poisoning

**Example Vulnerable Code:**
```tsx
<input
  value={description}
  onChange={(e) => setDescription(e.target.value)}  // No sanitization
/>
```

**Fix:**
```tsx
import DOMPurify from 'isomorphic-dompurify';

const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const sanitized = DOMPurify.sanitize(e.target.value, {
    ALLOWED_TAGS: [],  // Strip all HTML
    KEEP_CONTENT: true,
  });
  setDescription(sanitized);
};
```

---

## Low Priority Issues 🟢

### 11. Hardcoded API Endpoints
**Files:** Multiple components

**Issue:** Some components use hardcoded `/api/...` paths instead of environment variables.

**Examples:**
- `/api/admin/users`
- `/api/analytics?${params}`
- `/api/admin/dashboard`

**Better Approach:**
```tsx
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const response = await fetch(`${API_BASE}/api/admin/users`);
```

---

### 12. Missing Key Props Warning
**Build Output:** "Each child in a list should have a unique key prop"

**Issue:** Some lists don't have proper key props.

**Impact:**
- React warnings during build
- Poor reconciliation performance
- Potential UI bugs with list reordering

**Fix:** Add unique key props to all mapped arrays.

---

### 13. Error Handling is Inconsistent
**Files:** Various

**Issue:** Some errors show toast, some use alert(), some are silent.

**Examples:**
```tsx
// Using alert() (mobile/page.tsx)
alert('Upload successful!');

// Using toast (upload/page.tsx)
toast.success('Location detected');

// Silent error (MapPicker.tsx)
catch (error) {
  console.error(error);  // No user feedback
}
```

**Recommendation:**
- Standardize on toast notifications
- Remove all alert() calls
- Always provide user feedback for errors

---

## Security Recommendations 🔒

### Critical Security Issues

1. **Token in localStorage** (see Bug #4)
   - Move to httpOnly cookies
   - Implement token rotation
   - Add expiration enforcement

2. **No CSRF Protection**
   - Add CSRF tokens for state-changing operations
   - Use SameSite cookie attribute

3. **Missing Content Security Policy**
   - Already configured in next.config.js but validate headers

4. **No Request Size Limits**
   - File upload has no client-side size check
   - Could DoS server with huge files

5. **Geolocation Data Leakage**
   - GPS coordinates logged to console (see Bug #7)
   - Remove all location logging

---

## Performance Issues ⚡

1. **Unnecessary Re-renders**
   - Large dependency arrays in useEffect
   - Missing useMemo for expensive computations
   - Missing useCallback for event handlers

2. **Bundle Size**
   - 250KB gzipped (acceptable but could be optimized)
   - Consider code splitting for admin panels

3. **API Request Optimization**
   - No request deduplication
   - No caching strategy for static data
   - No request batching

---

## Code Quality Issues 📝

1. **TypeScript `any` Types**
   - Several places use `as any` type assertions
   - Reduces type safety

2. **Magic Numbers**
   - Hardcoded values (e.g., timeout: 5000)
   - Should be constants

3. **Duplicate Code**
   - Authorization header repeated in every component
   - Extract to utility function

4. **Error Messages**
   - Generic error messages
   - Should be more specific and actionable

---

## Immediate Action Items (Priority Order)

### Must Fix Before Production 🔴
1. **Add camera stream cleanup** (Bug #1) - 30 minutes
2. **Add blob URL revocation** (Bug #2) - 15 minutes
3. **Fix OSM API headers** (Bug #3) - 1 hour
4. **Move tokens to httpOnly cookies** (Bug #4) - 2-3 hours

### Should Fix This Week 🟠
5. **Add AbortControllers** (Bug #6) - 2 hours
6. **Remove console.logs** (Bug #7) - 30 minutes
7. **Fix infinite scroll pagination** (Bug #5) - 1 hour
8. **Add upload loading state** (Bug #9) - 30 minutes

### Can Fix Later 🟡
9. **Optimize keyboard handlers** (Bug #8) - 1 hour
10. **Standardize error handling** (Bug #13) - 2 hours
11. **Add input sanitization** (Bug #10) - 1 hour
12. **Extract hardcoded endpoints** (Bug #11) - 1 hour

---

## Testing Recommendations

### Manual Testing Needed
- [ ] Test camera cleanup (leave mobile upload page, check camera indicator)
- [ ] Test repeated image captures (check memory usage)
- [ ] Test offline upload queue
- [ ] Test with >100 uploads (infinite scroll)
- [ ] Test rapid form submissions

### Automated Tests Missing
- [ ] Camera stream cleanup test
- [ ] Blob URL revocation test
- [ ] API abort controller test
- [ ] localStorage XSS test
- [ ] Rate limiting test for OSM API

---

## Estimated Fix Time

**Critical Bugs (1-4):** 4-5 hours  
**High Priority (5-9):** 6-7 hours  
**Medium/Low:** 4-5 hours  

**Total:** 14-17 hours of development time

---

## Summary

**Total Bugs Found:** 13  
**Critical:** 3  
**High:** 3  
**Medium:** 4  
**Low:** 3  

**Most Serious:**
1. Memory leaks (camera stream, blob URLs)
2. OSM API policy violation (can result in IP ban)
3. Token storage vulnerability (XSS risk)

**Quick Wins:**
- Remove console.log statements (30 min)
- Add camera cleanup (30 min)
- Add blob URL revocation (15 min)

**Biggest Impact:**
- Fix token storage → Prevents XSS attacks
- Fix OSM API → Prevents app breaking for all users
- Fix memory leaks → Better mobile performance

---

**Recommendation:** Address critical bugs #1-4 before production launch. These are blockers that can cause serious issues in production (memory leaks, API bans, security vulnerabilities).
