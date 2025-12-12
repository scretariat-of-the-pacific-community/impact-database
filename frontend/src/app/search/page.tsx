'use client';

import { Suspense, useState, useCallback, useEffect, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  MapPin,
  Calendar,
  Download,
  Grid,
  List,
  Map as MapIcon,
  X,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';

import { imageApi } from '@/lib/api';
import { SearchFilters, ImageMetadata, HazardType, SourceAgency, HAZARD_TYPE_LABELS, SOURCE_AGENCY_LABELS } from '@/lib/types';
import ErrorBanner from '@/components/ErrorBanner';
import { sanitizeText } from '@/lib/sanitize';
import { ImageGridCardSkeleton, ImageListCardSkeleton } from '@/components/ImageCardSkeleton';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

// Simple icon creation function that's safe for SSR
const createSimpleIcon = (hazardType: string) => {
  if (typeof window === 'undefined') return null;
  
  const L = require('leaflet');
  
  const colors: Record<string, string> = {
    flood: '#3b82f6',
    cyclone: '#8b5cf6',
    drought: '#eab308',
    earthquake: '#ef4444',
    tsunami: '#06b6d4',
    landslide: '#f97316',
    wildfire: '#dc2626',
  };

  const color = colors[hazardType] || '#6b7280';
  
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

interface SearchPageState {
  searchQuery: string;
  selectedHazards: HazardType[];
  selectedAgencies: SourceAgency[];
  dateFrom: string;
  dateTo: string;
  viewMode: 'grid' | 'list' | 'map';
  filtersOpen: boolean;
  sortBy: 'relevance' | 'date' | 'upload_date' | 'title';
  sortOrder: 'asc' | 'desc';
}

const RESULTS_PER_PAGE = 24;

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const FILTER_STORAGE_KEY = 'search_filters_v1';
  const VIEW_MODE_STORAGE_KEY = 'search_view_mode_v1';
  const searchParamsString = useMemo(() => searchParams.toString(), [searchParams]);
  
  // Initialize state with safe defaults (no localStorage access during initial render)
  const [state, setState] = useState<SearchPageState>({
    searchQuery: searchParams.get('q') || '',
    selectedHazards: [],
    selectedAgencies: [],
    dateFrom: '',
    dateTo: '',
    viewMode: (searchParams.get('view') as SearchPageState['viewMode']) || 'grid',
    filtersOpen: false,
    sortBy: 'relevance',
    sortOrder: 'desc'
  });
  
  // Load persisted filters and view mode after hydration
  const [isHydrated, setIsHydrated] = useState(false);
  
  useEffect(() => {
    if (typeof window !== 'undefined' && !isHydrated) {
      const persistedFilters = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) ?? 'null');
      const persistedView = localStorage.getItem(VIEW_MODE_STORAGE_KEY) as SearchPageState['viewMode'] | null;
      
      setState(prev => ({
        ...prev,
        searchQuery: searchParams.get('q') || persistedFilters?.searchQuery || prev.searchQuery,
        selectedHazards: persistedFilters?.selectedHazards || prev.selectedHazards,
        selectedAgencies: persistedFilters?.selectedAgencies || prev.selectedAgencies,
        dateFrom: persistedFilters?.dateFrom || prev.dateFrom,
        dateTo: persistedFilters?.dateTo || prev.dateTo,
        viewMode: (searchParams.get('view') as SearchPageState['viewMode']) || persistedView || prev.viewMode,
        sortBy: persistedFilters?.sortBy || prev.sortBy,
        sortOrder: persistedFilters?.sortOrder || prev.sortOrder
      }));
      
      setIsHydrated(true);
    }
  }, [searchParams, FILTER_STORAGE_KEY, VIEW_MODE_STORAGE_KEY, isHydrated]);
  const [currentPage, setCurrentPage] = useState(() => {
    const initial = Number(searchParams.get('page') || '1');
    return Number.isNaN(initial) || initial < 1 ? 1 : initial;
  });

  // Build search filters from state
  const filters: SearchFilters = {
    q: state.searchQuery || undefined,
    hazard_type: state.selectedHazards.length > 0 ? state.selectedHazards : undefined,
    source_agency: state.selectedAgencies.length > 0 ? state.selectedAgencies : undefined,
    date_from: state.dateFrom || undefined,
    date_to: state.dateTo || undefined,
    sort_by: state.sortBy,
    sort_order: state.sortOrder,
    page: currentPage,
    limit: RESULTS_PER_PAGE
  };

  // Query for search results
  const { data: searchResults, isLoading, error, refetch } = useQuery({
    queryKey: ['search', filters],
    queryFn: () => imageApi.search(filters),
  });
  const images = useMemo(() => searchResults?.images || [], [searchResults]);
  const totalResults = searchResults?.total || 0;
  const totalPages =
    searchResults?.total_pages || Math.max(1, Math.ceil(totalResults / RESULTS_PER_PAGE));
  const showingFrom = totalResults === 0 ? 0 : (currentPage - 1) * RESULTS_PER_PAGE + 1;
  const showingTo = Math.min(currentPage * RESULTS_PER_PAGE, totalResults);

  const handleSearch = useCallback((newQuery: string) => {
    setState(prev => ({ ...prev, searchQuery: newQuery }));
    setCurrentPage(1);
    
    // Update URL
    const params = new URLSearchParams(searchParams);
    if (newQuery) {
      params.set('q', newQuery);
    } else {
      params.delete('q');
    }
    router.push(`/search?${params.toString()}`);
  }, [router, searchParams]);

  const toggleHazardFilter = useCallback((hazard: HazardType) => {
    setState(prev => ({
      ...prev,
      selectedHazards: prev.selectedHazards.includes(hazard)
        ? prev.selectedHazards.filter(h => h !== hazard)
        : [...prev.selectedHazards, hazard]
    }));
    setCurrentPage(1);
  }, []);

  const toggleAgencyFilter = useCallback((agency: SourceAgency) => {
    setState(prev => ({
      ...prev,
      selectedAgencies: prev.selectedAgencies.includes(agency)
        ? prev.selectedAgencies.filter(a => a !== agency)
        : [...prev.selectedAgencies, agency]
    }));
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedHazards: [],
      selectedAgencies: [],
      dateFrom: '',
      dateTo: '',
      searchQuery: ''
    }));
    router.push('/search');
    setCurrentPage(1);
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    if (currentPage > 1) {
      params.set('page', currentPage.toString());
    } else {
      params.delete('page');
    }
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [currentPage, router, searchParamsString]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { filtersOpen, ...persistable } = state;
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(persistable));
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, state.viewMode);
  }, [state, FILTER_STORAGE_KEY, VIEW_MODE_STORAGE_KEY]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-deep-900/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-2xl font-semibold text-white transition hover:text-pacific-200">
                Ocean Portal
              </Link>
              <div className="text-white/40">|</div>
              <h1 className="text-xl font-semibold text-white">Search Catalog</h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 backdrop-blur">
                <span>{totalResults.toLocaleString()} results</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                name="search"
                placeholder="Search images by title, keywords, location..."
                value={state.searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 pl-10 pr-4 py-3 text-white placeholder:text-white/50 shadow-card backdrop-blur focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
              />
            </div>

            <button
              onClick={() => setState(prev => ({ ...prev, filtersOpen: !prev.filtersOpen }))}
              className={`flex items-center px-4 py-3 border rounded-lg transition-colors ${
                state.filtersOpen
                  ? 'border-pacific-300/60 bg-pacific-500/20 text-white'
                  : 'border-white/15 bg-white/5 text-white/80 hover:border-white/30 hover:bg-white/10'
              }`}
            >
              <SlidersHorizontal className="w-5 h-5 mr-2" />
              Filters
              {state.filtersOpen ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </button>

            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-white/15 bg-white/5 backdrop-blur" role="group" aria-label="Result view">
              <button
                onClick={() => setState(prev => ({ ...prev, viewMode: 'grid' }))}
                className={`p-2 transition ${state.viewMode === 'grid' ? 'bg-white/20 text-white shadow-inner' : 'text-white/70 hover:text-white'}`}
                aria-label="Grid view"
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, viewMode: 'list' }))}
                className={`p-2 border-l border-white/10 transition ${state.viewMode === 'list' ? 'bg-white/20 text-white shadow-inner' : 'text-white/70 hover:text-white'}`}
                aria-label="List view"
              >
                <List className="w-5 h-5" />
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, viewMode: 'map' }))}
                className={`p-2 border-l border-white/10 transition ${state.viewMode === 'map' ? 'bg-white/20 text-white shadow-inner' : 'text-white/70 hover:text-white'}`}
                aria-label="Map view"
              >
                <MapIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        <AnimatePresence>
          {state.filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-card backdrop-blur">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* Hazard Types */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Hazard Types</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {Object.entries(HAZARD_TYPE_LABELS).map(([value, label]) => (
                        <label key={value} className="flex items-center text-sm text-white/80">
                          <input
                            type="checkbox"
                            checked={state.selectedHazards.includes(value as HazardType)}
                            onChange={() => toggleHazardFilter(value as HazardType)}
                            className="mr-2 rounded border-white/30 bg-white/10 text-pacific-400 focus:ring-pacific-400"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Source Agencies */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Source Agencies</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {Object.entries(SOURCE_AGENCY_LABELS).map(([value, label]) => (
                        <label key={value} className="flex items-center text-sm text-white/80">
                          <input
                            type="checkbox"
                            checked={state.selectedAgencies.includes(value as SourceAgency)}
                            onChange={() => toggleAgencyFilter(value as SourceAgency)}
                            className="mr-2 rounded border-white/30 bg-white/10 text-pacific-400 focus:ring-pacific-400"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Date Range</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-white/60 mb-1">From</label>
                        <input
                          type="date"
                          value={state.dateFrom}
                          onChange={(e) => {
                            setState(prev => ({ ...prev, dateFrom: e.target.value }));
                            setCurrentPage(1);
                          }}
                          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1">To</label>
                        <input
                          type="date"
                          value={state.dateTo}
                          onChange={(e) => {
                            setState(prev => ({ ...prev, dateTo: e.target.value }));
                            setCurrentPage(1);
                          }}
                          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sort Options */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Sort By</h3>
                    <select
                      value={`${state.sortBy}-${state.sortOrder}`}
                      onChange={(e) => {
                        const [sortBy, sortOrder] = e.target.value.split('-');
                        setState(prev => ({
                          ...prev,
                          sortBy: sortBy as any,
                          sortOrder: sortOrder as 'asc' | 'desc'
                        }));
                        setCurrentPage(1);
                      }}
                      className="w-full rounded-lg border border-white/15 bg-deep-900/60 px-3 py-2 text-sm text-white focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                    >
                      <option value="relevance-desc">Relevance</option>
                      <option value="date-desc">Date (Newest)</option>
                      <option value="date-asc">Date (Oldest)</option>
                      <option value="upload_date-desc">Upload Date (Newest)</option>
                      <option value="upload_date-asc">Upload Date (Oldest)</option>
                      <option value="title-asc">Title (A-Z)</option>
                      <option value="title-desc">Title (Z-A)</option>
                    </select>

                    <button
                      onClick={clearFilters}
                      className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10 hover:text-white"
                    >
                      Clear All Filters
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Filters */}
        {(state.selectedHazards.length > 0 || state.selectedAgencies.length > 0 || state.dateFrom || state.dateTo) && (
          <div className="mb-6 flex flex-wrap gap-2">
            {state.selectedHazards.map(hazard => (
              <span key={hazard} className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                {HAZARD_TYPE_LABELS[hazard]}
                <button
                  onClick={() => toggleHazardFilter(hazard)}
                  className="ml-2 hover:text-pacific-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {state.selectedAgencies.map(agency => (
              <span key={agency} className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                {SOURCE_AGENCY_LABELS[agency]}
                <button
                  onClick={() => toggleAgencyFilter(agency)}
                  className="ml-2 hover:text-pacific-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {state.dateFrom && (
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                From: {state.dateFrom}
                <button
                  onClick={() => {
                    setState(prev => ({ ...prev, dateFrom: '' }));
                    setCurrentPage(1);
                  }}
                  className="ml-2 hover:text-pacific-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {state.dateTo && (
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                To: {state.dateTo}
                <button
                  onClick={() => {
                    setState(prev => ({ ...prev, dateTo: '' }));
                    setCurrentPage(1);
                  }}
                  className="ml-2 hover:text-pacific-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Results */}
        <div className="rounded-3xl border border-white/10 bg-white/5 shadow-card backdrop-blur">
          {isLoading ? (
            <div className="p-6">
              {state.viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {Array.from({ length: RESULTS_PER_PAGE }).map((_, index) => (
                    <ImageGridCardSkeleton key={index} />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.from({ length: RESULTS_PER_PAGE }).map((_, index) => (
                    <ImageListCardSkeleton key={index} />
                  ))}
                </div>
              )}
            </div>
          ) : error ? (
            <div className="px-4 py-6">
              <ErrorBanner
                title="We couldn't load the catalog"
                message={
                  error instanceof Error
                    ? error.message
                    : 'Something went wrong while searching. Please try again.'
                }
                tone="error"
                onRetry={() => refetch()}
                retryLabel="Retry search"
              />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-white/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No results found</h3>
              <p className="text-white/60 mb-4">Try adjusting your search terms or filters</p>
              <button
                onClick={clearFilters}
                className="font-medium text-pacific-200 hover:text-pacific-100"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between text-sm text-white/70">
                <span>
                  Showing {showingFrom}-{showingTo} of {totalResults.toLocaleString()} results
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
              {state.viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {images.map((image) => (
                    <MemoizedImageGridCard key={image.id} image={image} />
                  ))}
                </div>
              ) : state.viewMode === 'list' ? (
                <div className="space-y-4">
                  {images.map((image) => (
                    <MemoizedImageListCard key={image.id} image={image} />
                  ))}
                </div>
              ) : (
                <div className="h-96">
                  <MapContainer center={[0, 0]} zoom={2} className="h-full w-full rounded-lg">
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; OpenStreetMap contributors"
                    />
                    {images.filter(img => img.latitude && img.longitude).map(image => (
                      <Marker
                        key={image.id}
                        position={[image.latitude, image.longitude] as [number, number]}
                        icon={createSimpleIcon(image.hazard_type)}
                      >
                        <Popup>
                          <div className="text-sm">
                            <Link href={`/images/${image.id}`} className="text-blue-600 hover:underline">
                              {image.title || image.filename}
                            </Link>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-white/70">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading search experience…</div>}>
      <SearchPageContent />
    </Suspense>
  );
}

// Memoize card components to prevent re-renders when search state changes
// but individual image data hasn't changed
function ImageGridCard({ image }: { image: ImageMetadata }) {
  const safeTitle = sanitizeText(image.title);
  const safeAbstract = sanitizeText(image.abstract || 'No description available');
  const safeLocation = sanitizeText(image.latitude && image.longitude ? `${image.latitude.toFixed(2)}, ${image.longitude.toFixed(2)}` : 'No location');
  return (
    <Link href={`/images/${image.id}`} className="group">
      <div className="rounded-2xl border border-white/10 bg-deep-900/60 transition-all duration-200 hover:border-pacific-300/50 hover:shadow-card backdrop-blur">
        {/* Image placeholder */}
        <div className="aspect-video rounded-t-2xl bg-gradient-to-br from-deep-800/80 to-pacific-700/60 flex items-center justify-center">
          <div className="text-pacific-200">
            <MapPin className="w-8 h-8" />
          </div>
        </div>
        
        {/* Content */}
        <div className="p-4">
          <div className="mb-2 flex items-start justify-between">
            <h3 className="line-clamp-2 text-sm font-medium text-white transition-colors group-hover:text-pacific-200">
              {safeTitle}
            </h3>
            <span className="ml-2 inline-flex flex-shrink-0 items-center rounded bg-white/10 px-2 py-1 text-xs font-medium capitalize text-white">
              {image.hazard_type}
            </span>
          </div>

          <p className="mb-3 line-clamp-2 text-xs text-white/70">
            {safeAbstract}
          </p>

          <div className="flex items-center justify-between text-xs text-white/60">
            <div className="flex items-center">
              <MapPin className="w-3 h-3 mr-1" />
              <span>{safeLocation}</span>
            </div>
            <div className="flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              <span>{new Date(image.upload_date).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ImageListCard({ image }: { image: ImageMetadata }) {
  const safeTitle = sanitizeText(image.title);
  const safeAbstract = sanitizeText(image.abstract || 'No description available');
  const safeLocation = sanitizeText(
    image.latitude && image.longitude
      ? `${image.latitude.toFixed(4)}, ${image.longitude.toFixed(4)}`
      : 'Location not specified'
  );
  return (
    <Link href={`/images/${image.id}`} className="group">
      <div className="rounded-2xl border border-white/10 bg-deep-900/60 p-4 transition-all duration-200 hover:border-pacific-300/50 hover:shadow-card backdrop-blur">
        <div className="flex items-start space-x-4">
          {/* Image thumbnail */}
          <div className="flex-shrink-0 flex items-center justify-center h-20 w-20 rounded-xl bg-gradient-to-br from-deep-800/80 to-pacific-700/60">
            <MapPin className="w-6 h-6 text-pacific-200" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="text-lg font-medium text-white transition-colors group-hover:text-pacific-200">
                {safeTitle}
              </h3>
              <span className="ml-4 inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium capitalize text-white">
                {image.hazard_type}
              </span>
            </div>

            <p className="mb-3 line-clamp-2 text-sm text-white/70">
              {safeAbstract}
            </p>

            <div className="flex items-center space-x-6 text-sm text-white/60">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-1" />
                <span>{safeLocation}</span>
              </div>
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                <span>Uploaded {new Date(image.upload_date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center">
                <Download className="w-4 h-4 mr-1" />
                <span>{(image.file_size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Memoized versions for performance optimization
const MemoizedImageGridCard = memo(ImageGridCard);
const MemoizedImageListCard = memo(ImageListCard);
