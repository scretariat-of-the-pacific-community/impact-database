export interface CachedSessionMetadata<TUser> {
  user: TUser;
  expires_at: number;
}

const SESSION_STORAGE_KEY = 'ocean_portal_session';

export function getCachedSession<TUser>(): CachedSessionMetadata<TUser> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as CachedSessionMetadata<TUser>;
    return parsed?.user ? parsed : null;
  } catch {
    return null;
  }
}

export function cacheSessionMetadata<TUser>(session: CachedSessionMetadata<TUser>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to cache session metadata:', error);
  }
}

export function clearCachedSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    // Cookie cleared in auth-provider; no-op here
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}

export function isCachedSessionExpired(session: CachedSessionMetadata<unknown>): boolean {
  return Date.now() >= session.expires_at;
}
