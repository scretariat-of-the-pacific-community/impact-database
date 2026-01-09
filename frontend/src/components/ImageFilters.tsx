'use client';

import { useState, useMemo, memo } from 'react';
import {
  CalendarDays,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
} from 'lucide-react';
import { Card, Tag, Select } from '@/components/design-system';
import { trackFilterApplied } from '@/lib/analytics';
import { sanitizeText } from '@/lib/sanitize';
import { getCountryName } from '@/lib/countries';

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
  volcanic: '🌋',
  coastal_erosion: '🏖️',
  storm: '⛈️',
  hail: '🧊',
  other: '🛰️',
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
      ? filters.hazardTypes.filter((h) => h !== hazard)
      : [...filters.hazardTypes, hazard];
    updateFilters({ hazardTypes: newHazardTypes });
    trackFilterApplied('hazard', hazard, newHazardTypes.length);
  };

  const toggleCountry = (country: string) => {
    const newCountries = filters.countries.includes(country)
      ? filters.countries.filter((c) => c !== country)
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
    <Card
      variant="surface"
      padding="none"
      className="divide-y divide-white/10 bg-white/5 backdrop-blur border border-white/10"
    >
      {/* Main Search Bar */}
      <div className="p-4 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40 w-5 h-5" />
          <input
            id="filter-search"
            name="filter-search"
            type="text"
            autoComplete="off"
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pacific-500 focus:border-transparent"
            placeholder="Search by title, filename, location, description..."
            value={filters.searchTerm}
            onChange={(e) => updateFilters({ searchTerm: e.target.value })}
          />
        </div>
      </div>

      {/* Quick Filters */}
      <div className="p-4 border-b border-white/10">
        <div className="flex flex-wrap gap-3">
          {/* Hazard Types Quick Filter */}
          <div className="relative">
            <button
              onClick={() => setShowHazardDropdown(!showHazardDropdown)}
              className="flex items-center px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white/80 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-pacific-500"
            >
              <span className="text-sm font-medium">
                Hazard Types
                {filters.hazardTypes.length > 0 && (
                  <span className="ml-1 bg-pacific-600/20 text-pacific-400 text-xs px-2 py-0.5 rounded-full">
                    {filters.hazardTypes.length}
                  </span>
                )}
              </span>
              <ChevronDown className="ml-2 w-4 h-4 text-white/40" />
            </button>

            {showHazardDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-deep-900 border border-white/20 rounded-md shadow-lg z-10 backdrop-blur">
                <div className="p-2 max-h-60 overflow-y-auto">
                  {availableHazardTypes.map((hazard) => (
                    <label
                      key={hazard}
                      className="flex items-center p-2 hover:bg-white/10 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.hazardTypes.includes(hazard)}
                        onChange={() => toggleHazardType(hazard)}
                        className="w-4 h-4 text-pacific-600 border-white/20 rounded focus:ring-pacific-500 bg-white/5"
                      />
                      <span className="ml-3 text-sm flex items-center text-white">
                        <span className="mr-2">
                          {HAZARD_ICONS[hazard] || '⚠️'}
                        </span>
                        <span className="capitalize">
                          {sanitizeText(hazard)}
                        </span>
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
              className="flex items-center px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white/80 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-pacific-500"
            >
              <MapPin className="w-4 h-4 mr-2 text-white/40" />
              <span className="text-sm font-medium">
                Countries
                {filters.countries.length > 0 && (
                  <span className="ml-1 bg-emerald-600/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full">
                    {filters.countries.length}
                  </span>
                )}
              </span>
              <ChevronDown className="ml-2 w-4 h-4 text-white/40" />
            </button>

            {showCountryDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-deep-900 border border-white/20 rounded-md shadow-lg z-10 backdrop-blur">
                <div className="p-2 max-h-60 overflow-y-auto">
                  {availableCountries.map((country) => (
                    <label
                      key={country}
                      className="flex items-center p-2 hover:bg-white/10 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.countries.includes(country)}
                        onChange={() => toggleCountry(country)}
                        className="w-4 h-4 text-pacific-600 border-white/20 rounded focus:ring-pacific-500 bg-white/5"
                      />
                      <span className="ml-3 text-sm text-white">
                        {getCountryName(country)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white/80 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-pacific-500"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2 text-white/40" />
            <span className="text-sm font-medium">Advanced</span>
          </button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-md border border-red-500/20"
            >
              <X className="w-4 h-4 mr-1" />
              <span className="text-sm font-medium">Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="p-4 bg-white/5 border-b border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                <CalendarDays className="w-4 h-4 inline mr-1" />
                Date Range
              </label>
              <div className="space-y-2">
                <input
                  type="date"
                  value={filters.dateRange.start || ''}
                  onChange={(e) =>
                    updateFilters({
                      dateRange: {
                        ...filters.dateRange,
                        start: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pacific-500 text-sm"
                  placeholder="Start date"
                />
                <input
                  type="date"
                  value={filters.dateRange.end || ''}
                  onChange={(e) =>
                    updateFilters({
                      dateRange: { ...filters.dateRange, end: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pacific-500 text-sm"
                  placeholder="End date"
                />
              </div>
            </div>

            {/* Sort By */}
            <div>
              <Select
                label="Sort By"
                value={filters.sortBy}
                onChange={(e) =>
                  updateFilters({
                    sortBy: e.target.value as FilterState['sortBy'],
                  })
                }
                variant="dark"
                size="sm"
              >
                <option value="date">Date</option>
                <option value="location">Location</option>
                <option value="hazard_type">Hazard Type</option>
                <option value="filename">Filename</option>
              </Select>
            </div>

            {/* Sort Order */}
            <div>
              <Select
                label="Sort Order"
                value={filters.sortOrder}
                onChange={(e) =>
                  updateFilters({
                    sortOrder: e.target.value as FilterState['sortOrder'],
                  })
                }
                variant="dark"
                size="sm"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="p-4 border-t border-white/10">
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
                removableLabel={`Remove ${getCountryName(country)} filter`}
              >
                {getCountryName(country)}
              </Tag>
            ))}

            {(filters.dateRange.start || filters.dateRange.end) && (
              <Tag
                tone="brand"
                icon={<CalendarDays className="w-3 h-3" />}
                onRemove={() => updateFilters({ dateRange: {} })}
                removableLabel="Clear date range filter"
              >
                {filters.dateRange.start || 'Any'} –{' '}
                {filters.dateRange.end || 'Any'}
              </Tag>
            )}
          </div>
        </div>
      )}

      {/* Results Summary */}
      <div className="px-4 py-3 bg-white/5 border-t border-white/10 rounded-b-lg">
        <div className="flex items-center justify-between text-sm text-white/60">
          <span>
            Showing{' '}
            <span className="font-medium text-white">{filteredCount}</span> of{' '}
            <span className="font-medium text-white">{totalImages}</span> images
          </span>
          {hasActiveFilters && (
            <span className="text-pacific-400">
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
