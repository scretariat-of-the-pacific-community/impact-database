'use client';

import { useState, useMemo } from 'react';
import { CalendarDays, MapPin, Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';

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

const HAZARD_COLORS: Record<string, string> = {
  flood: 'bg-blue-100 text-blue-800 border-blue-200',
  cyclone: 'bg-purple-100 text-purple-800 border-purple-200',
  drought: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  earthquake: 'bg-red-100 text-red-800 border-red-200',
  tsunami: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  landslide: 'bg-orange-100 text-orange-800 border-orange-200',
  wildfire: 'bg-red-200 text-red-900 border-red-300',
  volcano: 'bg-gray-100 text-gray-800 border-gray-200',
  storm: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  hail: 'bg-slate-100 text-slate-800 border-slate-200',
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
  };

  const toggleCountry = (country: string) => {
    const newCountries = filters.countries.includes(country)
      ? filters.countries.filter(c => c !== country)
      : [...filters.countries, country];
    updateFilters({ countries: newCountries });
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
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
                        <span className="capitalize">{hazard}</span>
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
                      <span className="ml-3 text-sm">{country}</span>
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
              <span
                key={hazard}
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
                  HAZARD_COLORS[hazard] || 'bg-gray-100 text-gray-800 border-gray-200'
                }`}
              >
                <span className="mr-1">{HAZARD_ICONS[hazard] || '⚠️'}</span>
                <span className="capitalize">{hazard}</span>
                <button
                  onClick={() => toggleHazardType(hazard)}
                  className="ml-2 text-current hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {filters.countries.map((country) => (
              <span
                key={country}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200"
              >
                <MapPin className="w-3 h-3 mr-1" />
                {country}
                <button
                  onClick={() => toggleCountry(country)}
                  className="ml-2 text-current hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {(filters.dateRange.start || filters.dateRange.end) && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200">
                <CalendarDays className="w-3 h-3 mr-1" />
                {filters.dateRange.start || 'Any'} - {filters.dateRange.end || 'Any'}
                <button
                  onClick={() => updateFilters({ dateRange: {} })}
                  className="ml-2 text-current hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
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
    </div>
  );
}