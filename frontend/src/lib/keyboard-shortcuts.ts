/**
 * Global keyboard shortcuts system
 * Provides consistent keyboard navigation across the application
 */

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
  modifier?: 'ctrl' | 'meta' | 'shift' | 'alt';
  global?: boolean; // Works on all pages
}

export const GLOBAL_SHORTCUTS = {
  SEARCH_FOCUS: '/',
  NEW_UPLOAD: 'n',
  HOME: 'h',
  HELP: '?',
} as const;

export const MODAL_SHORTCUTS = {
  CLOSE: 'Escape',
  NEXT: 'ArrowRight',
  PREVIOUS: 'ArrowLeft',
} as const;

export const REVIEW_SHORTCUTS = {
  APPROVE: 'a',
  REJECT: 'r',
  NEXT: 'n',
  FLAG: 'f',
} as const;

/**
 * Hook to register global keyboard shortcuts
 */
export function useGlobalShortcuts() {
  const router = useRouter();

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Ignore if user is typing in an input
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    // Global shortcuts
    switch (event.key) {
      case '/':
        event.preventDefault();
        // Focus search input
        const searchInput = document.querySelector<HTMLInputElement>('input[name="search"]');
        if (searchInput) {
          searchInput.focus();
        } else {
          // Navigate to search page
          router.push('/search');
        }
        break;

      case 'n':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          router.push('/upload');
        }
        break;

      case 'h':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          router.push('/');
        }
        break;

      case '?':
        if (!event.shiftKey) return;
        event.preventDefault();
        // Trigger keyboard shortcuts help modal
        window.dispatchEvent(new CustomEvent('show-keyboard-shortcuts'));
        break;
    }
  }, [router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);
}

/**
 * Hook for modal keyboard navigation
 */
export function useModalShortcuts(
  isOpen: boolean,
  onClose: () => void,
  onNext?: () => void,
  onPrevious?: () => void
) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;

        case 'ArrowRight':
          if (onNext) {
            event.preventDefault();
            onNext();
          }
          break;

        case 'ArrowLeft':
          if (onPrevious) {
            event.preventDefault();
            onPrevious();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, onClose, onNext, onPrevious]);
}

/**
 * Hook for review workflow shortcuts
 */
export function useReviewShortcuts(
  isActive: boolean,
  callbacks: {
    onApprove?: () => void;
    onReject?: () => void;
    onNext?: () => void;
    onFlag?: () => void;
  }
) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'a':
          if (callbacks.onApprove) {
            event.preventDefault();
            callbacks.onApprove();
          }
          break;

        case 'r':
          if (callbacks.onReject) {
            event.preventDefault();
            callbacks.onReject();
          }
          break;

        case 'n':
          if (callbacks.onNext) {
            event.preventDefault();
            callbacks.onNext();
          }
          break;

        case 'f':
          if (callbacks.onFlag) {
            event.preventDefault();
            callbacks.onFlag();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isActive, callbacks]);
}
