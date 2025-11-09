'use client';

import { useState, useMemo, memo } from 'react';
import { CalendarDays, MapPin, Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { Card, Tag } from '@/components/design-system';
import { trackFilterApplied } from '@/lib/analytics';
import { sanitizeText } from '@/lib/sanitize';

export interface FilterState {
  searchTerm: string;
  hazardTypes: string[];
  countries: string[];
  dateRange: {
    start?: string;
    end?: string;
  };
  sortBy: 'date' | 'location' | 'hazard_type' | 'filename';
  sortOrder: 'asc' | 'desc';
}

interface ImageFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableHazardTypes: string[];
  availableCountries: string[];
  totalImages: number;
  filteredCount: number;
}

const HAZARD_ICONS: Record<string, string> = {
  flood: '🌊',
  cyclone: '🌀',
  drought: '🏜️',
  earthquake: '🫨',
  tsunami: '🌊',
  landslide: '⛰️',
  wildfire: '🔥',
  volcano: '🌋',
  storm: '⛈️',
  hail: '🧊',
};

export default function ImageFilters({
  filters,
  onFiltersChange,
  availableHazardTypes,
  availableCountries,
  totalImages,
  filteredCount,
}: ImageFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHazardDropdown, setShowHazardDropdown] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  const updateFilters = (updates: Partial<FilterState>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const toggleHazardType = (hazard: string) => {
    const newHazardTypes = filters.hazardTypes.includes(hazard)
      ? filters.hazardTypes.filter(h => h !== hazard)
      : [...filters.hazardTypes, hazard];
    updateFilters({ hazardTypes: newHazardTypes });
    trackFilterApplied('hazard', hazard, newHazardTypes.length);
  };

  const toggleCountry = (country: string) => {
    const newCountries = filters.countries.includes(country)
      ? filters.countries.filter(c => c !== country)
      : [...filters.countries, country];
    updateFilters({ countries: newCountries });
    trackFilterApplied('country', country, newCountries.length);
  };

  const clearAllFilters = () => {
    updateFilters({
      searchTerm: '',
      hazardTypes: [],
      countries: [],
      dateRange: {},
      sortBy: 'date',
      sortOrder: 'desc',
    });
    trackFilterApplied('all', 'cleared', 0);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchTerm ||
      filters.hazardTypes.length > 0 ||
      filters.countries.length > 0 ||
      filters.dateRange.start ||
      filters.dateRange.end
    );
  }, [filters]);

  return (
    <Card variant="surface" padding="none" className="divide-y divide-gray-100">
      {/* Main Search Bar */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search by title, filename, location, description..."
            value={filters.searchTerm}
            onChange={(e) => updateFilters({ searchTerm: e.target.value })}
          />
        </div>
      </div>

      {/* Quick Filters */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex flex-wrap gap-3">
          {/* Hazard Types Quick Filter */}
          <div className="relative">
            <button
              onClick={() => setShowHazardDropdown(!showHazardDropdown)}
              className="flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span className="text-sm font-medium text-gray-700">
                Hazard Types
                {filters.hazardTypes.length > 0 && (
                  <span className="ml-1 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                    {filters.hazardTypes.length}
                  </span>
                )}
              </span>
              <ChevronDown className="ml-2 w-4 h-4 text-gray-500" />
            </button>

            {showHazardDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <div className="p-2 max-h-60 overflow-y-auto">
                  {availableHazardTypes.map((hazard) => (
                    <label
                      key={hazard}
                      className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.hazardTypes.includes(hazard)}
                        onChange={() => toggleHazardType(hazard)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-3 text-sm flex items-center">
                        <span className="mr-2">{HAZARD_ICONS[hazard] || '⚠️'}</span>
                        <span className="capitalize">{sanitizeText(hazard)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Countries Quick Filter */}
          <div className="relative">
            <button
              onClick={() => setShowCountryDropdown(!showCountryDropdown)}
              className="flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <MapPin className="w-4 h-4 mr-2 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                Countries
                {filters.countries.length > 0 && (
                  <span className="ml-1 bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                    {filters.countries.length}
                  </span>
                )}
              </span>
              <ChevronDown className="ml-2 w-4 h-4 text-gray-500" />
            </button>

            {showCountryDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <div className="p-2 max-h-60 overflow-y-auto">
                  {availableCountries.map((country) => (
                    <label
                      key={country}
                      className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.countries.includes(country)}
                        onChange={() => toggleCountry(country)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-3 text-sm">{sanitizeText(country)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Advanced</span>
          </button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
            >
              <X className="w-4 h-4 mr-1" />
              <span className="text-sm font-medium">Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="p-4 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <CalendarDays className="w-4 h-4 inline mr-1" />
                Date Range
              </label>
              <div className="space-y-2">
                <input
                  type="date"
                  value={filters.dateRange.start || ''}
                  onChange={(e) => updateFilters({
                    dateRange: { ...filters.dateRange, start: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Start date"
                />
                <input
                  type="date"
                  value={filters.dateRange.end || ''}
                  onChange={(e) => updateFilters({
                    dateRange: { ...filters.dateRange, end: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="End date"
                />
              </div>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
              <select
                value={filters.sortBy}
                onChange={(e) => updateFilters({ sortBy: e.target.value as FilterState['sortBy'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="date">Date</option>
                <option value="location">Location</option>
                <option value="hazard_type">Hazard Type</option>
                <option value="filename">Filename</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
              <select
                value={filters.sortOrder}
                onChange={(e) => updateFilters({ sortOrder: e.target.value as FilterState['sortOrder'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="p-4 border-t border-gray-100">
          <div className="flex flex-wrap gap-2">
            {filters.hazardTypes.map((hazard) => (
              <Tag
                key={hazard}
                tone="info"
                icon={HAZARD_ICONS[hazard] || '⚠️'}
                onRemove={() => toggleHazardType(hazard)}
                removableLabel={`Remove ${hazard} filter`}
                className="capitalize"
              >
                {hazard}
              </Tag>
            ))}

            {filters.countries.map((country) => (
              <Tag
                key={country}
                tone="success"
                icon={<MapPin className="w-3 h-3" />}
                onRemove={() => toggleCountry(country)}
                removableLabel={`Remove ${country} filter`}
              >
                {country}
              </Tag>
            ))}

            {(filters.dateRange.start || filters.dateRange.end) && (
              <Tag
                tone="brand"
                icon={<CalendarDays className="w-3 h-3" />}
                onRemove={() => updateFilters({ dateRange: {} })}
                removableLabel="Clear date range filter"
              >
                {filters.dateRange.start || 'Any'} – {filters.dateRange.end || 'Any'}
              </Tag>
            )}
          </div>
        </div>
      )}

      {/* Results Summary */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 rounded-b-lg">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing <span className="font-medium text-gray-900">{filteredCount}</span> of{' '}
            <span className="font-medium text-gray-900">{totalImages}</span> images
          </span>
          {hasActiveFilters && (
            <span className="text-blue-600">
              {totalImages - filteredCount} filtered out
            </span>
          )}
        </div>
      </div>

      {/* Click outside handlers */}
      {(showHazardDropdown || showCountryDropdown) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowHazardDropdown(false);
            setShowCountryDropdown(false);
          }}
        />
      )}
    </Card>
  );
}

// Memoize the component to prevent unnecessary re-renders when parent updates
// but props haven't changed. This is especially important for filter components
// that are passed callback functions.
export const MemoizedImageFilters = memo(ImageFilters);
