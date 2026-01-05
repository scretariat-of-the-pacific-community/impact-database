'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Command } from 'cmdk';
import { Search, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { imageApi } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { sanitizeText } from '@/lib/sanitize';
import { getCountryName } from '@/lib/countries';

interface SearchResult {
  id: string;
  filename: string;
  title?: string;
  hazard_type?: string;
  country?: string;
  thumbnail_url?: string;
  image_url?: string;
}

export default function SmartSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const data = await imageApi.search({
        q: searchQuery,
        limit: 8,
        sort_by: 'relevance',
      });
      setResults(data.images || []);
    } catch (error: any) {
      // Don't show error for aborted requests
      if (error?.name !== 'AbortError') {
        console.error('Search failed:', error);
        setResults([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      search(value);
    }, 300);
  }, [search]);

  const handleSelect = useCallback((imageId: string) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(`/images/${imageId}`);
  }, [router]);

  const buildThumbnailUrl = (result: SearchResult) => {
    if (result.thumbnail_url) {
      return getApiUrl(result.thumbnail_url);
    }
    if (result.image_url) {
      return getApiUrl(result.image_url);
    }
    return null;
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button
        id="search-box"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur transition hover:bg-white/20"
      >
        <Search className="h-4 w-4" />
        <span>Search images...</span>
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {/* Command Dialog */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            {/* Search Modal */}
            <motion.div
              className="fixed left-1/2 top-[20%] z-50 w-full max-w-2xl"
              initial={{ opacity: 0, scale: 0.95, x: '-50%', y: -20 }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: '-50%', y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Command
                className="overflow-hidden rounded-2xl border border-white/20 bg-deep-900/95 shadow-2xl backdrop-blur-xl"
                shouldFilter={false}
              >
                <div className="flex items-center border-b border-white/10 px-4">
                  <Search className="mr-2 h-5 w-5 text-white/40" />
                  <Command.Input
                    value={query}
                    onValueChange={handleQueryChange}
                    placeholder="Search by title, hazard type, location..."
                    className="w-full border-0 bg-transparent py-4 text-white placeholder:text-white/40 focus:outline-none"
                  />
                  {isLoading && (
                    <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                  )}
                </div>

                <Command.List className="max-h-96 overflow-y-auto p-2">
                  {results.length === 0 && query && !isLoading && (
                    <Command.Empty className="py-6 text-center text-sm text-white/60">
                      No results found for &quot;{query}&quot;
                    </Command.Empty>
                  )}

                  {results.map((result) => (
                    <Command.Item
                      key={result.id}
                      value={result.id}
                      onSelect={() => handleSelect(result.id)}
                      className="group flex cursor-pointer items-center gap-4 rounded-xl p-3 aria-selected:bg-white/10"
                    >
                      {/* Thumbnail */}
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-white/5">
                        {buildThumbnailUrl(result) ? (
                          <img
                            src={buildThumbnailUrl(result)!}
                            alt={result.title || result.filename}
                            className="h-full w-full object-cover transition group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-white/20" />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-medium text-white">
                          {sanitizeText(result.title) || sanitizeText(result.filename)}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                          {result.hazard_type && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5">
                              {result.hazard_type}
                            </span>
                          )}
                          {result.country && (
                            <span>{getCountryName(result.country)}</span>
                          )}
                        </div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.List>

                {results.length > 0 && (
                  <div className="border-t border-white/10 px-4 py-3 text-xs text-white/40">
                    Use ↑↓ to navigate, Enter to select, Esc to close
                  </div>
                )}
              </Command>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
