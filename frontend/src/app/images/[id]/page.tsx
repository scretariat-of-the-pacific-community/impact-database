'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  MapPin, 
  Calendar, 
  Download, 
  Share2, 
  Eye, 
  Info,
  Globe,
  Camera,
  FileText,
  Shield,
  User,
  Building,
  Tag,
  Clock,
  Database,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

import { imageApi } from '@/lib/api';
import { ImageMetadata, HAZARD_TYPE_LABELS, SOURCE_AGENCY_LABELS, TOPIC_CATEGORY_LABELS } from '@/lib/types';

import dynamic from 'next/dynamic';
import { configureLeafletIcons } from '@/lib/leaflet-config';
import { createCustomIcon } from '@/lib/mapUtils';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

export default function ImageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'map'>('overview');
  
  const imageId = params.id as string;
  
  // Call hooks before any conditional returns
  const { data: image, isLoading, error } = useQuery({
    queryKey: ['image', imageId],
    queryFn: () => imageApi.getById(imageId),
    enabled: !!imageId && imageId !== 'undefined' && imageId !== 'null'
  });
  
  // Handle invalid image IDs
  if (!imageId || imageId === 'undefined' || imageId === 'null') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-2">Invalid Image ID</div>
          <p className="text-gray-500 mb-4">No valid image ID was provided</p>
          <Link href="/search" className="text-blue-600 hover:text-blue-700">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  // Construct the image URL
  const imageUrl = image ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/images/${encodeURIComponent(image.filename)}` : '';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading image details...</span>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-2">Image not found</div>
          <p className="text-gray-500 mb-4">The requested image could not be found</p>
          <Link href="/search" className="text-blue-600 hover:text-blue-700">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </button>
              <div className="text-gray-300">|</div>
              <h1 className="text-xl font-semibold text-gray-900 truncate">
                {image.title}
              </h1>
            </div>
            
            <div className="flex items-center space-x-3">
              <button className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </button>
              <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                <Download className="w-4 h-4 mr-2" />
                Download
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Viewer */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="aspect-video relative bg-gradient-to-br from-blue-50 to-blue-100">
                {imageUrl && (
                  <Image
                    src={imageUrl}
                    alt={image.title || image.filename}
                    fill
                    className="object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <div className="absolute bottom-4 right-4 flex space-x-2">
                  <button className="bg-white/80 hover:bg-white text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
                    <Download className="w-4 h-4 mr-1 inline" />
                    Download
                  </button>
                </div>
                <div className="absolute bottom-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-xs">
                  {image.format_name} • {(image.file_size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {/* Tab Navigation */}
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6" role="navigation" aria-label="Image detail sections">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'overview'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Info className="w-4 h-4 inline mr-2" />
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('metadata')}
                    className={`py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'metadata'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Database className="w-4 h-4 inline mr-2" />
                    ISO Metadata
                  </button>
                  <button
                    onClick={() => setActiveTab('map')}
                    className={`py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'map'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <MapPin className="w-4 h-4 inline mr-2" />
                    Location
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'overview' && <OverviewTab image={image} />}
                {activeTab === 'metadata' && <MetadataTab image={image} />}
                {activeTab === 'map' && <LocationTab image={image} />}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Info</h2>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Tag className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Hazard Type</p>
                    <p className="text-sm text-gray-600 capitalize">
                      {HAZARD_TYPE_LABELS[image.hazard_type] || image.hazard_type}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Building className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Source Agency</p>
                    <p className="text-sm text-gray-600">
                      {SOURCE_AGENCY_LABELS[image.source_agency] || image.source_agency}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Upload Date</p>
                    <p className="text-sm text-gray-600">
                      {new Date(image.upload_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {image.latitude && image.longitude && (
                  <div className="flex items-start space-x-3">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Coordinates</p>
                      <p className="text-sm text-gray-600 font-mono">
                        {image.latitude.toFixed(6)}, {image.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start space-x-3">
                  <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">File Info</p>
                    <p className="text-sm text-gray-600">
                      {image.format_name} • {(image.file_size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Keywords */}
            {image.keywords && image.keywords.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Keywords</h2>
                <div className="flex flex-wrap gap-2">
                  {image.keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Information */}
            {image.contact && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact</h2>
                <div className="space-y-3">
                  {image.contact.organisation_name && (
                    <div className="flex items-start space-x-3">
                      <Building className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Organization</p>
                        <p className="text-sm text-gray-600">{image.contact.organisation_name}</p>
                      </div>
                    </div>
                  )}
                  {image.contact.individual_name && (
                    <div className="flex items-start space-x-3">
                      <User className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Contact Person</p>
                        <p className="text-sm text-gray-600">{image.contact.individual_name}</p>
                      </div>
                    </div>
                  )}
                  {image.contact.contact_info?.email && (
                    <div className="flex items-start space-x-3">
                      <ExternalLink className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Email</p>
                        <a 
                          href={`mailto:${image.contact.contact_info.email}`}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          {image.contact.contact_info.email}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ image }: { image: ImageMetadata }) {
  return (
    <div className="space-y-6">
      {/* Description */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3">Description</h3>
        <p className="text-gray-700 leading-relaxed">
          {image.abstract || 'No description available for this image.'}
        </p>
      </div>

      {/* Purpose */}
      {image.purpose && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Purpose</h3>
          <p className="text-gray-700 leading-relaxed">{image.purpose}</p>
        </div>
      )}

      {/* Topic Categories */}
      {image.topic_category && image.topic_category.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Topic Categories</h3>
          <div className="flex flex-wrap gap-2">
            {image.topic_category.map((category, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-green-100 text-green-800"
              >
                {TOPIC_CATEGORY_LABELS[category] || category}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Camera Information */}
      {image.camera_info && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Camera Information</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {image.camera_info.make && (
                <div>
                  <span className="font-medium text-gray-900">Make:</span>
                  <span className="ml-2 text-gray-600">{image.camera_info.make}</span>
                </div>
              )}
              {image.camera_info.model && (
                <div>
                  <span className="font-medium text-gray-900">Model:</span>
                  <span className="ml-2 text-gray-600">{image.camera_info.model}</span>
                </div>
              )}
              {image.camera_info.focal_length && (
                <div>
                  <span className="font-medium text-gray-900">Focal Length:</span>
                  <span className="ml-2 text-gray-600">{image.camera_info.focal_length}</span>
                </div>
              )}
              {image.camera_info.aperture && (
                <div>
                  <span className="font-medium text-gray-900">Aperture:</span>
                  <span className="ml-2 text-gray-600">{image.camera_info.aperture}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetadataTab({ image }: { image: ImageMetadata }) {
  const metadataFields = [
    { label: 'File Identifier', value: image.file_identifier, icon: Database },
    { label: 'Language', value: image.language, icon: Globe },
    { label: 'Character Set', value: image.character_set, icon: FileText },
    { label: 'Hierarchy Level', value: image.hierarchy_level, icon: Shield },
    { label: 'Date Stamp', value: new Date(image.date_stamp).toLocaleDateString(), icon: Clock },
    { label: 'Spatial Resolution', value: image.spatial_resolution, icon: MapPin },
    { label: 'Reference System', value: image.reference_system_info, icon: Globe },
    { label: 'Format Name', value: image.format_name, icon: FileText },
    { label: 'Format Version', value: image.format_version, icon: FileText },
    { label: 'Access Constraints', value: image.access_constraints, icon: Shield },
    { label: 'Use Constraints', value: image.use_constraints, icon: Shield },
    { label: 'Processing Level', value: image.processing_level, icon: Tag },
  ];

  const validFields = metadataFields.filter(field => field.value);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">ISO 19115 Metadata Record</h3>
        <p className="text-sm text-gray-600 mb-6">
          This image follows the ISO 19115 geographic information metadata standard.
        </p>
      </div>

      <div className="grid gap-4">
        {validFields.map((field, index) => {
          const IconComponent = field.icon;
          return (
            <div key={index} className="flex items-start space-x-3 py-3 border-b border-gray-100 last:border-b-0">
              <IconComponent className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{field.label}</p>
                <p className="text-sm text-gray-600 break-words">{field.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Geographic Extent */}
      {image.geographic_element && (
        <div className="mt-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Geographic Extent</h4>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-gray-900">West:</span>
                <span className="ml-2 text-gray-600 font-mono">
                  {image.geographic_element.west_bound_longitude}°
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-900">East:</span>
                <span className="ml-2 text-gray-600 font-mono">
                  {image.geographic_element.east_bound_longitude}°
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-900">South:</span>
                <span className="ml-2 text-gray-600 font-mono">
                  {image.geographic_element.south_bound_latitude}°
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-900">North:</span>
                <span className="ml-2 text-gray-600 font-mono">
                  {image.geographic_element.north_bound_latitude}°
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LocationTab({ image }: { image: ImageMetadata }) {
  // Call hooks before any conditional returns
  useEffect(() => {
    if (image.latitude && image.longitude) {
      configureLeafletIcons();
    }
  }, [image.latitude, image.longitude]);

  if (!image.latitude || !image.longitude) {
    return (
      <div className="text-center py-8">
        <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No location data</h3>
        <p className="text-gray-500">This image does not have geographic coordinates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Location Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Coordinates</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Latitude:</span>
                <span className="ml-2 font-mono text-gray-600">{image.latitude.toFixed(6)}°</span>
              </div>
              <div>
                <span className="font-medium">Longitude:</span>
                <span className="ml-2 font-mono text-gray-600">{image.longitude.toFixed(6)}°</span>
              </div>
              <div>
                <span className="font-medium">System:</span>
                <span className="ml-2 text-gray-600">{image.reference_system_info}</span>
              </div>
            </div>
          </div>

          {image.spatial_resolution && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Spatial Information</h4>
              <div className="text-sm">
                <span className="font-medium">Resolution:</span>
                <span className="ml-2 text-gray-600">{image.spatial_resolution}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-64">
        <MapContainer
          center={[image.latitude, image.longitude] as [number, number]}
          zoom={8}
          className="h-full w-full rounded-lg overflow-hidden"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <Marker
            position={[image.latitude, image.longitude] as [number, number]}
            icon={createCustomIcon(image.hazard_type)}
          >
            <Popup>{image.title || image.filename}</Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* External Links */}
      <div className="flex space-x-4">
        <a
          href={`https://www.google.com/maps?q=${image.latitude},${image.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View in Google Maps
        </a>
        <a
          href={`https://www.openstreetmap.org/?mlat=${image.latitude}&mlon=${image.longitude}&zoom=15`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View in OpenStreetMap
        </a>
      </div>
    </div>
  );
}
