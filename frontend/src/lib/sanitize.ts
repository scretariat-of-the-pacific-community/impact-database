'use client';

import DOMPurify from 'isomorphic-dompurify';

const defaultOptions = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
};

export const sanitizeText = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  return DOMPurify.sanitize(value, defaultOptions);
};

export const sanitizeRichText = (value?: string | null): string => {
  if (!value) return '';
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
  });
};
