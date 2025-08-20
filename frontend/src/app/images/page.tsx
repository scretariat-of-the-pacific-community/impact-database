'use client';

import { useQuery } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { ArrowLeft, MapPin, Calendar, Eye, X, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useState, useMemo } from 'react';
import Image from 'next/image';
import ImageFilters, { FilterState } from '@/components/ImageFilters';

interface ImageData {
  filename: string;
  title?: string;
  location: string;
  country?: string;
  hazard_type: string;
  timestamp?: string;
  latitude?: number;
  longitude?: number;
  abstract?: string;
  keywords?: string[];
  file_size?: number;
  acquisitionDate?: string;
}

interface QuickViewModalProps {
  image: ImageData;
  isOpen: boolean;
  onClose: () => void;
}

function QuickViewModal({ image, isOpen, onClose }: QuickViewModalProps) {
  if (!isOpen) return null;

  const imageUrl = `${process.env.NEXT_PUBLIC_API_URL}/upload/images/${encodeURIComponent(image.filename)}`;
  const downloadUrl = `${imageUrl}?download=true`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 truncate">
            {image.title || image.filename}
          </h2>
          <div className="flex items-center space-x-2">
            <a
              href={downloadUrl}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-md"
              title="Download image"
            >
              <Download className="w-5 h-5" />
            </a>
            <Link
              href={`/images/${encodeURIComponent(image.filename)}`}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-md"
              title="View full details"
            >
              <ExternalLink className="w-5 h-5" />
            </Link>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Image */}
          <div className="flex-1 flex items-center justify-center bg-gray-50 p-4">
            <div className="relative max-w-full max-h-full">
              <Image
                src={imageUrl}
                alt={image.title || image.filename}
                width={800}
                height={600}
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder-image.svg';
                }}
              />
            </div>
          </div>

          {/* Metadata Sidebar */}
          <div className="w-80 bg-gray-50 p-4 overflow-y-auto border-l border-gray-200">
            <div className="space-y-4">
              {/* Hazard Type */}
              <div>
                <span className="inline-block px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full capitalize">
                  {image.hazard_type}
                </span>
              </div>

              {/* Location */}
              <div className="flex items-start">
                <MapPin className="w-5 h-5 mr-2 text-gray-400 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">{image.location}</div>
                  {image.country && (
                    <div className="text-sm text-gray-600">{image.country}</div>
                  )}
                  {image.latitude && image.longitude && (
                    <div className="text-xs text-gray-500 mt-1">
                      {image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}
                    </div>
                  )}
                </div>
              </div>

              {/* Date */}
              {(image.timestamp || image.acquisitionDate) && (
                <div className="flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-900">
                      {new Date(image.timestamp || image.acquisitionDate!).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(image.timestamp || image.acquisitionDate!).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Abstract */}
              {image.abstract && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Description</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{image.abstract}</p>
                </div>
              )}

              {/* Keywords */}
              {image.keywords && image.keywords.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Keywords</h4>
                  <div className="flex flex-wrap gap-1">
                    {image.keywords.map((keyword, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* File Info */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">File Information</h4>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Filename: {image.filename}</div>
                  {image.file_size && (
                    <div>Size: {(image.file_size / (1024 * 1024)).toFixed(2)} MB</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageThumbnail({ image, onClick }: { image: ImageData; onClick: () => void }) {
  const imageUrl = `${process.env.NEXT_PUBLIC_API_URL}/upload/images/${encodeURIComponent(image.filename)}`;

  return (
    <div 
      className="bg-white rounded-lg shadow hover:shadow-lg transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
      {/* Thumbnail Image */}
      <div className="aspect-video relative overflow-hidden rounded-t-lg bg-gray-100">
        <Image
          src={imageUrl}
          alt={image.title || image.filename}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-200"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/placeholder-image.svg';
          }}
        />
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-200 flex items-center justify-center">
          <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>
        {/* Hazard Type Badge */}
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded-full capitalize shadow-lg">
            {image.hazard_type}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 truncate mb-2">
          {image.title || image.filename}
        </h3>
        
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center">
            <MapPin className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
            <span className="truncate">{image.location}</span>
            {image.country && <span className="text-gray-400 ml-1">({image.country})</span>}
          </div>
          
          {(image.timestamp || image.acquisitionDate) && (
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
              <span>{new Date(image.timestamp || image.acquisitionDate!).toLocaleDateString()}</span>
            </div>
          )}
          
          {image.latitude && image.longitude && (
            <div className="text-xs text-gray-500">
              {image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}
            </div>
          )}
        </div>
        
        {image.abstract && (
          <p className="mt-3 text-sm text-gray-600 line-clamp-2 leading-relaxed">
            {image.abstract}
          </p>
        )}
      </div>
    </div>
  );
}
// Ensure the file is treated as a module with JSX support
export default function ImagesPage() {
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    hazardTypes: [],
    countries: [],
    dateRange: {},
    sortBy: 'date',
    sortOrder: 'desc',
  });

  const { data: images, isLoading, error } = useQuery<ImageData[]>({
    queryKey: ['images'],
    queryFn: async (): Promise<ImageData[]> => {
      const res = await imageApi.getAll();
      // Filter out any items that do not have required fields
      return (res.data as ImageData[]).filter(
        (img: any) => img.filename && img.location && img.hazard_type
      );
    },
  });

  const availableHazardTypes = useMemo(() => {
    return [...new Set((images ?? []).map((img: ImageData) => img.hazard_type))].sort();
  }, [images]);

  const availableCountries = useMemo(() => {
    return [
      ...new Set(
        (images ?? [])
          .map((img: ImageData) => img.country)
          .filter((c) => !!c)
      ),
    ].sort();
  }, [images]);

  const filteredAndSortedImages = useMemo(() => {
    if (!images) return [];

    let filtered = (images as ImageData[]).filter((image: ImageData) => {
      // Search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matchesSearch =
          image.filename.toLowerCase().includes(searchLower) ||
          image.location.toLowerCase().includes(searchLower) ||
          image.country?.toLowerCase().includes(searchLower) ||
          image.title?.toLowerCase().includes(searchLower) ||
          image.abstract?.toLowerCase().includes(searchLower);

        if (!matchesSearch) return false;
      }

      // Hazard type filter
      if (filters.hazardTypes.length > 0 && !filters.hazardTypes.includes(image.hazard_type)) {
        return false;
      }

      // Country filter
      if (filters.countries.length > 0 && image.country && !filters.countries.includes(image.country)) {
        return false;
      }

      // Date range filter
      if (filters.dateRange.start || filters.dateRange.end) {
        const imageDate = image.timestamp || image.acquisitionDate;
        if (imageDate) {
          const date = new Date(imageDate);
          if (filters.dateRange.start && date < new Date(filters.dateRange.start)) {
            return false;
          }
          if (filters.dateRange.end && date > new Date(filters.dateRange.end)) {
            return false;
          }
        }
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a: ImageData, b: ImageData) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

      switch (filters.sortBy) {
        case 'date':
          aValue = new Date(a.timestamp || a.acquisitionDate || '');
          bValue = new Date(b.timestamp || b.acquisitionDate || '');
          break;
        case 'location':
          aValue = a.location.toLowerCase();
          bValue = b.location.toLowerCase();
          break;
        case 'hazard_type':
          aValue = a.hazard_type.toLowerCase();
          bValue = b.hazard_type.toLowerCase();
          break;
        case 'filename':
          aValue = a.filename.toLowerCase();
          bValue = b.filename.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return filters.sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return filters.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [images, filters]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <Link href="/" className="mr-4">
                <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-gray-900" />
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Browse Images</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link 
                href="/map" 
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                View on Map
              </Link>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Filters */}
        <div className="mb-6">
          <ImageFilters
            filters={filters}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Filters */}
        <div className="mb-6">
          <ImageFilters
            filters={filters}
            onFiltersChange={setFilters}
            availableHazardTypes={availableHazardTypes}
            availableCountries={availableCountries}
            totalImages={images?.length || 0}
            filteredCount={filteredAndSortedImages.length}
          />
        </div>

        {/* Images Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading images...</div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">Failed to load images.</div>
        ) : Array.isArray(images) && images.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-12 text-center">
            No images uploaded yet.
            <Link 
              href="/upload" 
              className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Upload Your First Image
            </Link>
          </div>
        ) : filteredAndSortedImages.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-12 text-center">
            No images match your search criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredAndSortedImages.map((image: ImageData) => (
              <ImageThumbnail
                key={image.filename}
                image={image}
                onClick={() => setSelectedImage(image)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Quick View Modal */}
      <QuickViewModal
        image={selectedImage as ImageData}
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </div>
  );
}