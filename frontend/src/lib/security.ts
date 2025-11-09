export const sanitizeReturnUrl = (value?: string | null): string => {
  if (!value) return '/';
  try {
    if (value.startsWith('/')) {
      return value;
    }
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const parsed = new URL(value, currentOrigin || 'http://localhost');
    if (currentOrigin && parsed.origin !== currentOrigin) {
      return '/';
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/';
  }
};

export const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
};
