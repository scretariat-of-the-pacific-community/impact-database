/**
 * Keyboard Shortcuts Help Modal
 * Shows all available keyboard shortcuts to users
 */

'use client';

import { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutSection {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: ['/'], description: 'Focus search' },
      { keys: ['N'], description: 'New upload' },
      { keys: ['H'], description: 'Go to home' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
  {
    title: 'Image Gallery',
    shortcuts: [
      { keys: ['Esc'], description: 'Close image preview' },
      { keys: ['←', '→'], description: 'Previous/next image' },
      { keys: ['Tab'], description: 'Navigate UI elements' },
    ],
  },
  {
    title: 'Review Workflow',
    shortcuts: [
      { keys: ['A'], description: 'Approve item' },
      { keys: ['R'], description: 'Reject item' },
      { keys: ['N'], description: 'Next item' },
      { keys: ['F'], description: 'Flag for review' },
    ],
  },
  {
    title: 'Search & Filters',
    shortcuts: [
      { keys: ['F'], description: 'Toggle filters (planned)' },
      { keys: ['Ctrl', 'K'], description: 'Command palette (planned)' },
    ],
  },
];

export default function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleShow = () => setIsOpen(true);
    window.addEventListener('show-keyboard-shortcuts', handleShow);
    return () => window.removeEventListener('show-keyboard-shortcuts', handleShow);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Keyboard className="h-6 w-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="grid gap-6 sm:grid-cols-2">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut, index) => (
                  <div
                    key={`${section.title}-${shortcut.description}`}
                    className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                  >
                    <span className="text-sm text-gray-700">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <kbd
                          key={`${section.title}-${shortcut.description}-${key}-${keyIndex}`}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 rounded-lg bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Press <kbd className="rounded border border-blue-300 bg-white px-2 py-0.5 text-xs font-semibold">?</kbd> anytime to show this help.
          </p>
        </div>
      </div>
    </div>
  );
}
