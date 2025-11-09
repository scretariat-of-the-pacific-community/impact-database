// Basic sanitization for text content
// For SSR compatibility, we use simple string escaping instead of DOMPurify
const escapeHtml = (text: string): string => {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'\/]/g, (char) => htmlEscapes[char] || char);
};

export const sanitizeText = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  // For server-side and client-side, use simple HTML escaping
  return escapeHtml(value);
};

export const sanitizeRichText = (value?: string | null): string => {
  if (!value) return '';
  // For rich text, we still escape but keep basic formatting
  // In production, consider using a proper sanitization library on the client
  return escapeHtml(value);
};
