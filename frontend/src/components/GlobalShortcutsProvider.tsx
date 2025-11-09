/**
 * Global Shortcuts Provider
 * Enables keyboard shortcuts across the entire application
 */

'use client';

import { useGlobalShortcuts } from '@/lib/keyboard-shortcuts';

export default function GlobalShortcutsProvider() {
  useGlobalShortcuts();
  return null;
}
