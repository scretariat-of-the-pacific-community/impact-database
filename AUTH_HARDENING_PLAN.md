# Authentication Hardening Plan

## Executive Summary

This document outlines a comprehensive plan to address critical authentication and session management issues in the Ocean Portal application. The current implementation has significant UX and security gaps that lead to poor user experience, redirect loops, and potential security vulnerabilities.

**Priority**: HIGH  
**Estimated Timeline**: 4-6 weeks (phased approach)  
**Impact**: Critical - affects all authenticated users

---

## Current State Analysis

### ✅ What's Working
- OAuth2/OIDC flow with PKCE implemented
- HttpOnly cookies being set server-side
- CSRF protection middleware in place
- Basic role-based checks exist
- Token refresh endpoint exists (`/api/v1/auth/refresh`)

### ❌ Critical Issues

#### 1. **Unfriendly Session Expiry**
- **Problem**: Users get silently redirected on token expiry with no warning
- **Impact**: Lost work, confusion, poor UX
- **Current**: 401 → redirect to login (recent toast added)
- **Missing**: Proactive warnings, graceful degradation, refresh token flow

#### 2. **Coupled State & Navigation**
- **Problem**: Multiple auth checks (useAuth + API calls) cause redirect loops
- **Example**: `/api/user/stats` 404 → redirect, but it's actually a missing DB row issue
- **Impact**: Users stuck in redirect loops, difficulty debugging

#### 3. **No SSR/CSR Symmetry**
- **Problem**: Auth is client-only; SSR pages don't know auth state
- **Impact**: Flash of protected content → redirect (FOUC)
- **Missing**: Next.js middleware, server-side auth checks

#### 4. **Token Handling Gaps**
- **Problem**: 7-day tokens, no automatic rotation, no refresh flow
- **Current**: Cookie + localStorage fallback (security risk)
- **Missing**: Short-lived access tokens, automatic refresh, clock skew handling

#### 5. **Error Handling Gaps**
- **Problem**: 401 errors log warnings, but no recovery mechanism
- **Impact**: Failed queries aren't retried after re-auth
- **Missing**: Query queue, automatic retry on auth recovery

#### 6. **Inconsistent Data Identifiers**
- **Problem**: username vs UUID confusion, missing DB rows → 404 → redirect
- **Impact**: Users can't complete onboarding, unnecessary redirects
- **Missing**: Seeding user data on first auth, normalized lookups

#### 7. **Permission Awareness**
- **Problem**: UI renders then fails if permissions insufficient
- **Impact**: Confusing errors, wasted API calls
- **Missing**: Role gates in UI, permission-based rendering

#### 8. **CSRF/Session Robustness**
- **Problem**: No session rotation on login, unclear SameSite coordination
- **Missing**: Session fixation protection, session ID rotation

#### 9. **Service Worker/PWA Interaction**
- **Problem**: Stale SW cache can serve unauthenticated responses
- **Impact**: Reload/redirect loops after session expiry
- **Missing**: Cache invalidation strategy for auth changes

---

## Proposed Architecture

### High-Level Flow
```
┌─────────────────────────────────────────────────────────────┐
│                     Authentication Flow                      │
└─────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
    ┌───▼───┐            ┌──────▼──────┐        ┌──────▼──────┐
    │ Login │            │ Token Check │        │   Refresh   │
    │ (SSO) │────────────▶│  Middleware │────────▶│    Token    │
    └───┬───┘            └──────┬──────┘        └──────┬──────┘
        │                       │                       │
        │                       ▼                       │
        │              ┌─────────────────┐             │
        │              │  Set HttpOnly   │             │
        │              │  Cookie (short) │◀────────────┘
        │              └────────┬────────┘
        │                       │
        └───────────────────────┼────────────────────────┐
                                │                        │
                        ┌───────▼───────┐        ┌──────▼──────┐
                        │  SSR/CSR Auth │        │ Client Cache│
                        │   State Sync  │────────▶│  (metadata) │
                        └───────┬───────┘        └─────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │  Authenticated│
                        │   App State   │
                        └───────────────┘
```

---

## Implementation Plan

### **Phase 1: Foundation & Critical Fixes** (Week 1-2)

#### 1.1 Token Strategy Overhaul
**Goal**: Implement short-lived access tokens + refresh token rotation

**Backend Changes**:
```python
# app/core/config.py
ACCESS_TOKEN_EXPIRE_MINUTES = 15  # Short-lived (was 7 days)
REFRESH_TOKEN_EXPIRE_DAYS = 7     # Long-lived

# app/api/auth.py
@router.post("/login")
async def login(...):
    access_token = create_access_token(
        data={"sub": user.username}, 
        expires_delta=timedelta(minutes=15)
    )
    refresh_token = create_refresh_token(
        data={"sub": user.username, "type": "refresh"},
        expires_delta=timedelta(days=7)
    )
    
    # Set access token in HttpOnly cookie
    response.set_cookie(
        key="ocean_portal_token",
        value=access_token,
        max_age=15 * 60,
        httponly=True,
        secure=True,
        samesite="strict"
    )
    
    # Set refresh token in separate HttpOnly cookie
    response.set_cookie(
        key="ocean_portal_refresh",
        value=refresh_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="strict"
    )
    
    return {"token_type": "bearer", "expires_in": 900}

@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    response: Response
):
    refresh_token = request.cookies.get("ocean_portal_refresh")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    
    # Validate refresh token
    payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    
    username = payload.get("sub")
    
    # Issue new access token
    new_access_token = create_access_token(
        data={"sub": username},
        expires_delta=timedelta(minutes=15)
    )
    
    # Rotate refresh token (optional but recommended)
    new_refresh_token = create_refresh_token(
        data={"sub": username, "type": "refresh"},
        expires_delta=timedelta(days=7)
    )
    
    response.set_cookie("ocean_portal_token", new_access_token, ...)
    response.set_cookie("ocean_portal_refresh", new_refresh_token, ...)
    
    return {"token_type": "bearer", "expires_in": 900}
```

**Frontend Changes**:
```typescript
// frontend/src/lib/auth-client.ts
export class AuthClient {
  private refreshPromise: Promise<void> | null = null;
  
  async fetchWithAuth(url: string, options: RequestInit = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include'
      });
      
      if (response.status === 401) {
        // Token expired - try refresh
        await this.refreshToken();
        
        // Retry original request
        return fetch(url, {
          ...options,
          credentials: 'include'
        });
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  }
  
  private async refreshToken(): Promise<void> {
    // Prevent multiple simultaneous refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    
    this.refreshPromise = (async () => {
      try {
        const response = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include'
        });
        
        if (!response.ok) {
          // Refresh failed - need to re-login
          throw new Error('Session expired');
        }
      } finally {
        this.refreshPromise = null;
      }
    })();
    
    return this.refreshPromise;
  }
}
```

**Files to Modify**:
- `app/api/auth.py` - Add refresh token generation
- `app/core/config.py` - Update token expiry settings
- `frontend/src/lib/auth-client.ts` - New file for auth fetch wrapper
- `frontend/src/providers/auth-provider.tsx` - Integrate auth client

**Success Criteria**:
- [ ] Access tokens expire in 15 minutes
- [ ] Refresh tokens expire in 7 days
- [ ] 401 responses trigger automatic token refresh
- [ ] Second 401 (after refresh) redirects to login
- [ ] No tokens stored in localStorage

---

#### 1.2 Proactive Session Expiry Warnings
**Goal**: Warn users before session expires, offer "Stay Signed In"

**Implementation**:
```typescript
// frontend/src/components/SessionWarningModal.tsx
export function SessionWarningModal() {
  const [show, setShow] = useState(false);
  const { session, extendSession } = useAuth();
  
  useEffect(() => {
    if (!session?.expires_at) return;
    
    const timeUntilExpiry = session.expires_at - Date.now();
    const warningThreshold = 5 * 60 * 1000; // 5 minutes
    
    if (timeUntilExpiry < warningThreshold && timeUntilExpiry > 0) {
      setShow(true);
    }
    
    const timer = setTimeout(() => {
      setShow(true);
    }, Math.max(0, timeUntilExpiry - warningThreshold));
    
    return () => clearTimeout(timer);
  }, [session]);
  
  const handleExtendSession = async () => {
    await extendSession(); // Calls /api/v1/auth/refresh
    setShow(false);
  };
  
  if (!show) return null;
  
  return (
    <Modal>
      <div className="text-center p-6">
        <Clock className="w-12 h-12 mx-auto mb-4 text-amber-500" />
        <h2 className="text-xl font-semibold mb-2">Session Expiring Soon</h2>
        <p className="text-gray-600 mb-6">
          Your session will expire in {Math.floor((session.expires_at - Date.now()) / 60000)} minutes.
          Would you like to stay signed in?
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setShow(false)}>
            Sign Out
          </Button>
          <Button onClick={handleExtendSession}>
            Stay Signed In
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

**Files to Create**:
- `frontend/src/components/SessionWarningModal.tsx`
- `frontend/src/hooks/useSessionMonitor.ts`

**Files to Modify**:
- `frontend/src/app/layout.tsx` - Add SessionWarningModal
- `frontend/src/providers/auth-provider.tsx` - Add extendSession method

**Success Criteria**:
- [ ] Modal appears 5 minutes before expiry
- [ ] "Stay Signed In" refreshes token silently
- [ ] "Sign Out" logs out gracefully
- [ ] No modal during active user activity

---

#### 1.3 Remove localStorage Token Storage
**Goal**: Remove all token storage in localStorage (security)

**Changes**:
```typescript
// frontend/src/providers/auth-provider.tsx
export function AuthProvider({ children }: { children: ReactNode }) {
  const initializeAuth = async () => {
    // REMOVE: localStorage token reading
    // const cached = getCachedSession();
    
    // ONLY rely on cookie presence
    const hasCookie = readCookie('ocean_portal_token');
    
    if (!hasCookie) {
      setIsAuthenticated(false);
      return;
    }
    
    // Verify session with backend
    try {
      const user = await fetch('/api/v1/auth/me', {
        credentials: 'include'
      }).then(r => r.json());
      
      setUser(user);
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    }
  };
}
```

**Files to Modify**:
- `frontend/src/providers/auth-provider.tsx`
- `frontend/src/lib/auth-session.ts` - Remove token caching
- `frontend/src/app/auth/login/page.tsx` - Remove localStorage.setItem calls

**Files to Remove**:
- Any code that writes access_token to localStorage

**Success Criteria**:
- [ ] No tokens in localStorage
- [ ] Auth state derived from server (/api/v1/auth/me)
- [ ] Cookies are sole auth mechanism

---

### **Phase 2: SSR/CSR Symmetry** (Week 2-3)

#### 2.1 Next.js Middleware for Auth
**Goal**: Server-side auth checks, no client-side flash

**Implementation**:
```typescript
// frontend/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/auth/login', '/auth/callback', '/', '/about'];
const PROTECTED_PATHS = ['/profile', '/upload', '/images/*/edit'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if path requires auth
  const requiresAuth = PROTECTED_PATHS.some(pattern => {
    const regex = new RegExp(`^${pattern.replace('*', '[^/]+')}$`);
    return regex.test(pathname);
  });
  
  if (!requiresAuth) {
    return NextResponse.next();
  }
  
  // Check for auth cookie
  const token = request.cookies.get('ocean_portal_token');
  
  if (!token) {
    // Not authenticated - redirect to login
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Verify token (optional - can also trust cookie)
  try {
    // Call backend to verify token
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: {
        'Cookie': `ocean_portal_token=${token.value}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Invalid token');
    }
    
    // Token valid - proceed
    return NextResponse.next();
  } catch {
    // Invalid token - clear cookie and redirect
    const response = NextResponse.redirect(new URL('/auth/login', request.url));
    response.cookies.delete('ocean_portal_token');
    return response;
  }
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/upload/:path*',
    '/images/:path*/edit',
    '/admin/:path*'
  ]
};
```

**Files to Create**:
- `frontend/src/middleware.ts`

**Success Criteria**:
- [ ] Protected routes redirect on server (no flash)
- [ ] Client-side auth provider syncs with server state
- [ ] returnUrl preserved through login flow

---

#### 2.2 Server Components with Auth Context
**Goal**: Use Next.js 13+ Server Components for initial render

**Implementation**:
```typescript
// frontend/src/lib/server-auth.ts
import { cookies } from 'next/headers';

export async function getServerAuthState() {
  const cookieStore = cookies();
  const token = cookieStore.get('ocean_portal_token');
  
  if (!token) {
    return { isAuthenticated: false, user: null };
  }
  
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: {
        'Cookie': `ocean_portal_token=${token.value}`
      },
      cache: 'no-store' // Don't cache auth checks
    });
    
    if (!response.ok) {
      return { isAuthenticated: false, user: null };
    }
    
    const user = await response.json();
    return { isAuthenticated: true, user };
  } catch {
    return { isAuthenticated: false, user: null };
  }
}
```

```typescript
// frontend/src/app/profile/page.tsx
import { getServerAuthState } from '@/lib/server-auth';
import { redirect } from 'next/navigation';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const { isAuthenticated, user } = await getServerAuthState();
  
  if (!isAuthenticated) {
    redirect('/auth/login?returnUrl=/profile');
  }
  
  // Server-rendered with user data
  return <ProfileClient user={user} />;
}
```

**Files to Create**:
- `frontend/src/lib/server-auth.ts`

**Files to Modify**:
- `frontend/src/app/profile/page.tsx` - Convert to Server Component
- `frontend/src/app/upload/page.tsx` - Convert to Server Component

**Success Criteria**:
- [ ] Protected pages server-render with auth state
- [ ] No flash of content
- [ ] Client hydration preserves state

---

### **Phase 3: Error Handling & Recovery** (Week 3-4)

#### 3.1 Centralized Auth Error Recovery
**Goal**: Queue failed requests, retry after re-auth

**Implementation**:
```typescript
// frontend/src/lib/query-retry.ts
import { QueryClient } from '@tanstack/react-query';

interface FailedQuery {
  queryKey: string[];
  queryFn: () => Promise<any>;
  timestamp: number;
}

class AuthRecoveryManager {
  private failedQueries: FailedQuery[] = [];
  private isRecovering = false;
  
  queueFailedQuery(query: FailedQuery) {
    this.failedQueries.push(query);
  }
  
  async retryQueriesAfterAuth(queryClient: QueryClient) {
    if (this.isRecovering) return;
    
    this.isRecovering = true;
    
    try {
      // Retry all queued queries
      const results = await Promise.allSettled(
        this.failedQueries.map(query => 
          queryClient.fetchQuery({
            queryKey: query.queryKey,
            queryFn: query.queryFn
          })
        )
      );
      
      // Clear successfully retried queries
      this.failedQueries = [];
      
      return results;
    } finally {
      this.isRecovering = false;
    }
  }
  
  clearQueue() {
    this.failedQueries = [];
  }
}

export const authRecoveryManager = new AuthRecoveryManager();
```

```typescript
// frontend/src/providers/query-provider.tsx
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: async (error, query) => {
            const normalized = normalizeError(error);
            const status = normalized.details.status as number | undefined;
            
            if (status === 401) {
              // Queue failed query for retry
              authRecoveryManager.queueFailedQuery({
                queryKey: query.queryKey as string[],
                queryFn: query.queryFn as () => Promise<any>,
                timestamp: Date.now()
              });
              
              // Trigger auth refresh
              // AuthProvider will call authRecoveryManager.retryQueriesAfterAuth
            }
          }
        })
      })
  );
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

**Files to Create**:
- `frontend/src/lib/query-retry.ts`

**Files to Modify**:
- `frontend/src/providers/query-provider.tsx`
- `frontend/src/providers/auth-provider.tsx` - Integrate retry manager

**Success Criteria**:
- [ ] Failed 401 queries queue for retry
- [ ] Successful re-auth triggers retry
- [ ] Users see seamless recovery
- [ ] No duplicate requests

---

#### 3.2 Graceful Degradation for Expired Sessions
**Goal**: Show cached data + read-only banner on expiry

**Implementation**:
```typescript
// frontend/src/components/SessionExpiredBanner.tsx
export function SessionExpiredBanner() {
  const { sessionExpired } = useAuth();
  const router = useRouter();
  
  if (!sessionExpired) return null;
  
  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white p-4 z-50">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5" />
          <span className="font-medium">
            Your session has expired. You're viewing cached data in read-only mode.
          </span>
        </div>
        <Button 
          variant="secondary"
          onClick={() => router.push('/auth/login?returnUrl=' + window.location.pathname)}
        >
          Sign In Again
        </Button>
      </div>
    </div>
  );
}
```

**Files to Create**:
- `frontend/src/components/SessionExpiredBanner.tsx`

**Files to Modify**:
- `frontend/src/app/layout.tsx` - Add banner
- `frontend/src/providers/auth-provider.tsx` - Set sessionExpired flag

**Success Criteria**:
- [ ] Expired sessions show read-only banner
- [ ] Cached data remains visible
- [ ] Write operations disabled
- [ ] Clear path to re-auth

---

### **Phase 4: Data & Permission Consistency** (Week 4-5)

#### 4.1 Normalize User Identifiers
**Goal**: Accept username OR UUID for all user endpoints

**Backend Changes**:
```python
# app/api/users.py
def get_user_by_identifier(identifier: str, db: Session) -> User:
    """Get user by username or UUID."""
    # Try UUID first
    try:
        uuid.UUID(identifier)
        user = db.query(User).filter(User.id == identifier).first()
        if user:
            return user
    except ValueError:
        pass
    
    # Try username
    user = db.query(User).filter(User.username == identifier).first()
    if user:
        return user
    
    # Try email
    user = db.query(User).filter(User.email == identifier).first()
    return user

@router.get("/api/user/{identifier}/stats")
async def get_user_stats(
    identifier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user = get_user_by_identifier(identifier, db)
    if not user:
        # Don't 404 - create user stats row on first access
        user = current_user
        ensure_user_stats_exist(user.id, db)
    
    return get_stats(user.id, db)
```

**Files to Modify**:
- `app/api/users.py`
- `app/api/analytics.py`
- All endpoints that accept user identifiers

**Success Criteria**:
- [ ] All user endpoints accept username/UUID/email
- [ ] Missing user stats rows auto-created
- [ ] No 404 errors for valid users

---

#### 4.2 Permission-Aware UI Components
**Goal**: Hide/disable UI elements user can't access

**Implementation**:
```typescript
// frontend/src/hooks/usePermission.ts
export function usePermission(permission: string) {
  const { user } = useAuth();
  
  return useMemo(() => {
    if (!user?.roles) return false;
    
    // Map roles to permissions
    const rolePermissions: Record<string, string[]> = {
      admin: ['*'], // All permissions
      reviewer: ['review:read', 'review:approve', 'review:reject'],
      contributor: ['upload:create', 'upload:read', 'upload:update'],
      viewer: ['read']
    };
    
    const userPermissions = user.roles.flatMap(role => 
      rolePermissions[role] || []
    );
    
    return userPermissions.includes('*') || userPermissions.includes(permission);
  }, [user, permission]);
}
```

```typescript
// frontend/src/components/PermissionGate.tsx
interface PermissionGateProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ 
  permission, 
  fallback = null, 
  children 
}: PermissionGateProps) {
  const hasPermission = usePermission(permission);
  const { isLoading } = useAuth();
  
  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }
  
  if (!hasPermission) {
    if (fallback) return <>{fallback}</>;
    
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <Lock className="inline w-4 h-4 mr-2" />
        You need additional permissions to access this feature.
      </div>
    );
  }
  
  return <>{children}</>;
}
```

**Usage**:
```typescript
// In profile tabs
<PermissionGate permission="review:read">
  <Tab label="Reviews">
    <ReviewList />
  </Tab>
</PermissionGate>
```

**Files to Create**:
- `frontend/src/hooks/usePermission.ts`
- `frontend/src/components/PermissionGate.tsx`

**Files to Modify**:
- `frontend/src/app/profile/page.tsx` - Wrap tabs in PermissionGate
- `frontend/src/app/admin/*` - Add permission checks

**Success Criteria**:
- [ ] Tabs don't render if user lacks permission
- [ ] Clear messaging when permission denied
- [ ] No confusing 403 errors after render

---

### **Phase 5: Session Security Hardening** (Week 5-6)

#### 5.1 Session Rotation on Login
**Goal**: Prevent session fixation attacks

**Backend Changes**:
```python
# app/api/auth.py
import secrets

def generate_session_id() -> str:
    """Generate cryptographically secure session ID."""
    return secrets.token_urlsafe(32)

@router.post("/login")
async def login(...):
    # Generate NEW session ID on login
    session_id = generate_session_id()
    
    # Store session in database
    db_session = Session(
        id=session_id,
        user_id=user.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=7),
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent")
    )
    db.add(db_session)
    db.commit()
    
    # Set session cookie
    response.set_cookie(
        key="ocean_portal_session_id",
        value=session_id,
        httponly=True,
        secure=True,
        samesite="strict"
    )
    
    # Also set access token...
```

**Database Migration**:
```python
# alembic/versions/xxx_add_sessions_table.py
def upgrade():
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id')),
        sa.Column('created_at', sa.DateTime, nullable=False),
        sa.Column('expires_at', sa.DateTime, nullable=False),
        sa.Column('last_activity', sa.DateTime),
        sa.Column('ip_address', sa.String(45)),
        sa.Column('user_agent', sa.String(256)),
        sa.Column('is_active', sa.Boolean, default=True)
    )
    op.create_index('idx_sessions_user_id', 'sessions', ['user_id'])
    op.create_index('idx_sessions_expires_at', 'sessions', ['expires_at'])
```

**Files to Create**:
- `app/models/session.py`
- `alembic/versions/xxx_add_sessions_table.py`

**Files to Modify**:
- `app/api/auth.py` - Add session rotation

**Success Criteria**:
- [ ] New session ID on every login
- [ ] Old sessions invalidated
- [ ] Session tracking in database
- [ ] Admin can view/revoke sessions

---

#### 5.2 Service Worker Cache Invalidation
**Goal**: Clear stale auth cache on sign-out

**Implementation**:
```typescript
// frontend/src/lib/sw-cache-control.ts
export async function invalidateAuthCache() {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      for (const registration of registrations) {
        // Send message to SW to clear auth-related caches
        registration.active?.postMessage({
          type: 'CLEAR_AUTH_CACHE'
        });
      }
      
      // Also clear Cache API directly
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.includes('auth') || cacheName.includes('user')) {
            return caches.delete(cacheName);
          }
        })
      );
    } catch (error) {
      console.error('Failed to invalidate auth cache:', error);
    }
  }
}
```

```typescript
// public/sw.js (or service worker file)
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_AUTH_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Clear API response caches
            if (cacheName.includes('api') || cacheName.includes('user')) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  }
});
```

**Files to Create**:
- `frontend/src/lib/sw-cache-control.ts`

**Files to Modify**:
- `frontend/public/sw.js` (if exists)
- `frontend/src/providers/auth-provider.tsx` - Call on sign-out

**Success Criteria**:
- [ ] Sign-out clears SW cache
- [ ] No stale unauthenticated responses
- [ ] No redirect loops after re-login

---

## Testing Strategy

### Unit Tests
```typescript
// frontend/src/__tests__/auth-flow.test.ts
describe('Authentication Flow', () => {
  it('should refresh token on 401', async () => {
    // Mock 401 response
    // Verify refresh token endpoint called
    // Verify original request retried
  });
  
  it('should redirect to login after failed refresh', async () => {
    // Mock failed refresh
    // Verify redirect to /auth/login
  });
  
  it('should queue failed queries during refresh', async () => {
    // Mock multiple 401s during refresh
    // Verify all queued and retried
  });
  
  it('should warn user 5 minutes before expiry', async () => {
    // Mock session with near expiry
    // Verify modal appears
  });
});
```

### Integration Tests
```bash
# tests/integration/test_auth_flow.sh
echo "Testing auth flow..."

# 1. Login with short-lived token
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -d '{"username":"test","password":"test"}' | jq -r '.access_token')

# 2. Verify access works
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/user/stats

# 3. Wait for expiry (or mock time)
sleep 901  # 15 minutes + 1 second

# 4. Verify refresh works
curl -X POST http://localhost:8000/api/v1/auth/refresh

# 5. Verify old token invalid
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/user/stats
# Should return 401
```

### E2E Tests (Playwright)
```typescript
// tests/e2e/auth-expiry.spec.ts
test('should show session expiry warning', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('[name=username]', 'test');
  await page.fill('[name=password]', 'test');
  await page.click('button[type=submit]');
  
  // Fast-forward time to near expiry
  await page.clock.fastForward(10 * 60 * 1000); // 10 minutes
  
  // Verify warning modal
  await expect(page.locator('text=Session Expiring Soon')).toBeVisible();
  
  // Click "Stay Signed In"
  await page.click('button:has-text("Stay Signed In")');
  
  // Verify session extended
  await expect(page.locator('text=Session Expiring Soon')).not.toBeVisible();
});
```

---

## Monitoring & Observability

### Metrics to Track
```typescript
// Track auth-related metrics
export const authMetrics = {
  loginAttempts: new Counter('auth_login_attempts_total'),
  loginFailures: new Counter('auth_login_failures_total'),
  tokenRefreshes: new Counter('auth_token_refreshes_total'),
  sessionExpiryWarnings: new Counter('auth_session_warnings_total'),
  sessionExtensions: new Counter('auth_session_extensions_total'),
  authErrors: new Counter('auth_errors_total', ['error_type']),
};
```

### Logging
```python
# Backend structured logging
logger.info("User login", extra={
    "event": "auth.login",
    "user_id": user.id,
    "username": user.username,
    "ip_address": request.client.host,
    "user_agent": request.headers.get("user-agent"),
    "session_id": session_id
})

logger.info("Token refresh", extra={
    "event": "auth.refresh",
    "user_id": user.id,
    "session_id": session_id,
    "old_token_expires_at": old_expiry,
    "new_token_expires_at": new_expiry
})
```

---

## Rollout Plan

### Phase 1 (Weeks 1-2)
1. Deploy token refresh endpoint (backend)
2. Update token expiry to 15 minutes
3. Add auth client with retry logic (frontend)
4. Remove localStorage token storage
5. **Rollout**: 10% → 50% → 100% over 3 days

### Phase 2 (Weeks 2-3)
1. Deploy Next.js middleware
2. Convert protected pages to Server Components
3. **Rollout**: Feature flag, enable for authenticated users

### Phase 3 (Weeks 3-4)
1. Deploy query retry manager
2. Add session expiry warnings
3. Add graceful degradation banner
4. **Rollout**: 100% (UI-only changes)

### Phase 4 (Weeks 4-5)
1. Deploy normalized user identifiers (backend)
2. Add permission gates (frontend)
3. **Rollout**: Backend first, then frontend

### Phase 5 (Weeks 5-6)
1. Add sessions table
2. Implement session rotation
3. Add SW cache invalidation
4. **Rollout**: Backend first, monitor for issues

---

## Success Metrics

### User Experience
- **Session expiry complaints**: Reduce by 80%
- **Redirect loop incidents**: Reduce to 0
- **FOUC (Flash of Unauthorized Content)**: Reduce to 0
- **Successful re-auth rate**: > 95%

### Security
- **Tokens in localStorage**: 0
- **Token lifetime**: 15 minutes (access), 7 days (refresh)
- **Session fixation vulnerabilities**: 0
- **XSS token theft risk**: Eliminated

### Performance
- **Auth check latency (SSR)**: < 50ms
- **Token refresh latency**: < 200ms
- **Failed request retry time**: < 500ms

---

## Risks & Mitigations

### Risk 1: Breaking Changes
**Mitigation**: 
- Feature flags for all major changes
- Gradual rollout (10% → 50% → 100%)
- Rollback plan for each phase

### Risk 2: Backend Overload
**Mitigation**:
- Cache /api/v1/auth/me responses (30 seconds)
- Rate limit token refresh endpoint
- Monitor backend latency

### Risk 3: User Confusion
**Mitigation**:
- Clear messaging in session expiry modal
- Help docs explaining changes
- Support team training

### Risk 4: Third-Party Integration Breakage
**Mitigation**:
- Test all OAuth providers
- Maintain backwards compatibility period
- API versioning

---

## Open Questions

1. **Do we need offline support?** If yes, need read-only mode with cached data
2. **What's the acceptable session extension window?** 5 minutes? 10?
3. **Should we implement "Remember Me"?** Longer refresh token expiry
4. **Do we need multi-device session management?** View/revoke sessions
5. **What's the refresh token rotation strategy?** Rotate on every use? Daily?

---

## Next Steps

1. **Review this plan** with team
2. **Prioritize phases** based on business needs
3. **Create JIRA tickets** for each task
4. **Set up feature flags** in LaunchDarkly/similar
5. **Schedule kickoff meeting** for Phase 1

---

## References

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

**Last Updated**: December 22, 2025  
**Authors**: Development Team  
**Status**: Draft - Pending Review
