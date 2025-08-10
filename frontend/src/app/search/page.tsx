'use client';

import { useState, useCallback, useEffect } from 'react';
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
  Map,
  X,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal
} from 'lucide-react';
import Link from 'next/link';

import { imageApi } from '@/lib/api';
import { SearchFilters, ImageMetadata, HazardType, SourceAgency, HAZARD_TYPE_LABELS, SOURCE_AGENCY_LABELS } from '@/lib/types';

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

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [state, setState] = useState<SearchPageState>({
    searchQuery: searchParams.get('q') || '',
    selectedHazards: [],
    selectedAgencies: [],
    dateFrom: '',
    dateTo: '',
    viewMode: 'grid',
    filtersOpen: false,
    sortBy: 'relevance',
    sortOrder: 'desc'
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
    limit: 24
  };

  // Query for search results
  const { data: searchResults, isLoading, error } = useQuery({
    queryKey: ['search', filters],
    queryFn: () => imageApi.search(filters),
  });

  const handleSearch = useCallback((newQuery: string) => {
    setState(prev => ({ ...prev, searchQuery: newQuery }));
    
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
  }, []);

  const toggleAgencyFilter = useCallback((agency: SourceAgency) => {
    setState(prev => ({
      ...prev,
      selectedAgencies: prev.selectedAgencies.includes(agency)
        ? prev.selectedAgencies.filter(a => a !== agency)
        : [...prev.selectedAgencies, agency]
    }));
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
  }, [router]);

  const images = searchResults?.images || [];
  const totalResults = searchResults?.total || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-2xl font-bold text-blue-600">
                Ocean Portal
              </Link>
              <div className="text-gray-300">|</div>
              <h1 className="text-xl font-semibold text-gray-900">Search Catalog</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search images by title, keywords, location..."
                value={state.searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <button
              onClick={() => setState(prev => ({ ...prev, filtersOpen: !prev.filtersOpen }))}
              className={`flex items-center px-4 py-3 border rounded-lg transition-colors ${
                state.filtersOpen 
                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-5 h-5 mr-2" />
              Filters
              {state.filtersOpen ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </button>

            {/* View Mode Toggle */}
            <div className="flex border border-gray-300 rounded-lg">
              <button
                onClick={() => setState(prev => ({ ...prev, viewMode: 'grid' }))}
                className={`p-2 ${state.viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, viewMode: 'list' }))}
                className={`p-2 border-l border-gray-300 ${state.viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List className="w-5 h-5" />
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, viewMode: 'map' }))}
                className={`p-2 border-l border-gray-300 ${state.viewMode === 'map' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Map className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        {state.filtersOpen && (
          <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Hazard Types */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Hazard Types</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {Object.entries(HAZARD_TYPE_LABELS).map(([value, label]) => (
                    <label key={value} className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={state.selectedHazards.includes(value as HazardType)}
                        onChange={() => toggleHazardFilter(value as HazardType)}
                        className="mr-2 text-blue-600 focus:ring-blue-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Source Agencies */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Source Agencies</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {Object.entries(SOURCE_AGENCY_LABELS).map(([value, label]) => (
                    <label key={value} className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={state.selectedAgencies.includes(value as SourceAgency)}
                        onChange={() => toggleAgencyFilter(value as SourceAgency)}
                        className="mr-2 text-blue-600 focus:ring-blue-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Date Range</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">From</label>
                    <input
                      type="date"
                      value={state.dateFrom}
                      onChange={(e) => setState(prev => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">To</label>
                    <input
                      type="date"
                      value={state.dateTo}
                      onChange={(e) => setState(prev => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Sort Options */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Sort By</h3>
                <select
                  value={`${state.sortBy}-${state.sortOrder}`}
                  onChange={(e) => {
                    const [sortBy, sortOrder] = e.target.value.split('-');
                    setState(prev => ({ 
                      ...prev, 
                      sortBy: sortBy as any, 
                      sortOrder: sortOrder as 'asc' | 'desc' 
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
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
                  className="mt-3 w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Filters */}
        {(state.selectedHazards.length > 0 || state.selectedAgencies.length > 0 || state.dateFrom || state.dateTo) && (
          <div className="mb-6 flex flex-wrap gap-2">
            {state.selectedHazards.map(hazard => (
              <span key={hazard} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                {HAZARD_TYPE_LABELS[hazard]}
                <button
                  onClick={() => toggleHazardFilter(hazard)}
                  className="ml-2 hover:text-blue-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {state.selectedAgencies.map(agency => (
              <span key={agency} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                {SOURCE_AGENCY_LABELS[agency]}
                <button
                  onClick={() => toggleAgencyFilter(agency)}
                  className="ml-2 hover:text-green-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {state.dateFrom && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800">
                From: {state.dateFrom}
                <button
                  onClick={() => setState(prev => ({ ...prev, dateFrom: '' }))}
                  className="ml-2 hover:text-purple-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {state.dateTo && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800">
                To: {state.dateTo}
                <button
                  onClick={() => setState(prev => ({ ...prev, dateTo: '' }))}
                  className="ml-2 hover:text-purple-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Results */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Searching...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-600 mb-2">Error loading search results</div>
              <p className="text-gray-500 text-sm">Please try again or refine your search</p>
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-500 mb-4">Try adjusting your search terms or filters</p>
              <button
                onClick={clearFilters}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="p-6">
              {state.viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {images.map((image) => (
                    <ImageGridCard key={image.id} image={image} />
                  ))}
                </div>
              ) : state.viewMode === 'list' ? (
                <div className="space-y-4">
                  {images.map((image) => (
                    <ImageListCard key={image.id} image={image} />
                  ))}
                </div>
              ) : (
                <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Map className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">Map view coming soon</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageGridCard({ image }: { image: ImageMetadata }) {
  return (
    <Link href={`/images/${image.id}`} className="group">
      <div className="border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all duration-200">
        {/* Image placeholder */}
        <div className="aspect-video bg-gradient-to-br from-blue-50 to-blue-100 rounded-t-lg flex items-center justify-center">
          <div className="text-blue-400">
            <MapPin className="w-8 h-8" />
          </div>
        </div>
        
        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 text-sm">
              {image.title}
            </h3>
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize ml-2 flex-shrink-0">
              {image.hazard_type}
            </span>
          </div>
          
          <p className="text-xs text-gray-600 line-clamp-2 mb-3">
            {image.abstract || 'No description available'}
          </p>
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center">
              <MapPin className="w-3 h-3 mr-1" />
              {image.latitude && image.longitude ? (
                <span>{image.latitude.toFixed(2)}, {image.longitude.toFixed(2)}</span>
              ) : (
                <span>No location</span>
              )}
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
  return (
    <Link href={`/images/${image.id}`} className="group">
      <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all duration-200">
        <div className="flex items-start space-x-4">
          {/* Image thumbnail */}
          <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <MapPin className="w-6 h-6 text-blue-400" />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                {image.title}
              </h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize ml-4">
                {image.hazard_type}
              </span>
            </div>
            
            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
              {image.abstract || 'No description available'}
            </p>
            
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-1" />
                {image.latitude && image.longitude ? (
                  <span>{image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}</span>
                ) : (
                  <span>Location not specified</span>
                )}
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
