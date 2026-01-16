'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { config } from '@/lib/config';
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
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

import { imageApi } from '@/lib/api';
import {
  ImageMetadata,
  HAZARD_TYPE_LABELS,
  SOURCE_AGENCY_LABELS,
  TOPIC_CATEGORY_LABELS,
} from '@/lib/types';

import dynamic from 'next/dynamic';
import { configureLeafletIcons } from '@/lib/leaflet-config';
import { createCustomIcon } from '@/lib/mapUtils';

const formatFileSize = (bytes?: number) => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
    return null;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), {
  ssr: false,
});
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), {
  ssr: false,
});

export default function ImageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'map'>(
    'overview'
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const imageId = params.id as string;

  // Call hooks before any conditional returns
  const {
    data: image,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['image', imageId],
    queryFn: () => imageApi.getById(imageId),
    enabled: !!imageId && imageId !== 'undefined' && imageId !== 'null',
  });

  // Handle invalid image IDs
  if (!imageId || imageId === 'undefined' || imageId === 'null') {
    return (
      <div className="min-h-screen bg-deep-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-2">Invalid Image ID</div>
          <p className="text-surface-soft/70 mb-4">
            No valid image ID was provided
          </p>
          <Link
            href="/search"
            className="text-pacific-400 hover:text-pacific-300"
          >
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  // Construct the image URL
  const imageUrl = image
    ? `${config.API.BASE_URL}/upload/images/${encodeURIComponent((image as any).filename)}`
    : '';
  const fileSizeLabel = formatFileSize((image as any)?.file_size);

  const handleDownload = async () => {
    if (!image || !imageUrl) return;
    try {
      setDownloadError(null);
      setIsDownloading(true);

      // Use the download=true query parameter to force download
      const downloadUrl = `${imageUrl}?download=true`;

      // Use a direct anchor element with the download attribute
      // This allows the browser to handle the download natively
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download =
        (image as any).filename || `${(image as any).id || 'image'}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to download file';
      setDownloadError(message);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-deep-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pacific-500"></div>
        <span className="ml-3 text-surface-soft">Loading image details...</span>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="min-h-screen bg-deep-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-2">Image not found</div>
          <p className="text-surface-soft/70 mb-4">
            The requested image could not be found
          </p>
          <Link
            href="/search"
            className="text-pacific-400 hover:text-pacific-300"
          >
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-deep-950">
      {/* Header */}
      <header className="bg-deep-900/50 border-b border-white/10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="flex items-center text-surface-soft hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </button>
              <div className="text-white/20">|</div>
              <h1 className="text-xl font-semibold text-white truncate">
                {(image as any).title || (image as any).filename}
              </h1>
            </div>

            <div className="flex items-center space-x-3">
              <Link
                href={`/images/${imageId}/edit`}
                className="flex items-center px-3 py-2 text-white border border-palm-500/50 bg-palm-600/20 rounded-lg hover:bg-palm-600/30 transition-colors"
              >
                <FileText className="w-4 h-4 mr-2" />
                Edit
              </Link>
              <button className="flex items-center px-3 py-2 text-surface-soft hover:text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors">
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </button>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center px-4 py-2 bg-pacific-600 text-white rounded-lg hover:bg-pacific-500 transition-colors disabled:opacity-60"
              >
                <Download className="w-4 h-4 mr-2" />
                {isDownloading ? 'Downloading…' : 'Download'}
              </button>
            </div>
          </div>
          {downloadError && (
            <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-900/30 px-3 py-2 text-sm text-rose-100">
              {downloadError}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Viewer */}
            <div className="bg-deep-900/50 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm">
              <div className="aspect-video relative bg-gradient-to-br from-deep-900 to-pacific-950">
                {imageUrl && (
                  <Image
                    src={imageUrl}
                    alt={(image as any).title || (image as any).filename}
                    fill
                    className="object-contain"
                    unoptimized
                    onError={(e: any) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <div className="absolute bottom-4 right-4 flex space-x-2">
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/20 disabled:opacity-60"
                  >
                    <Download className="w-4 h-4 mr-1 inline" />
                    {isDownloading ? 'Downloading…' : 'Download'}
                  </button>
                </div>
                <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs border border-white/10">
                  {(image as any).format_name}
                  {fileSizeLabel ? ` • ${fileSizeLabel}` : ''}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-deep-900/50 rounded-2xl border border-white/10 backdrop-blur-sm">
              {/* Tab Navigation */}
              <div className="border-b border-white/10">
                <nav
                  className="flex space-x-8 px-6"
                  role="navigation"
                  aria-label="Image detail sections"
                >
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'overview'
                        ? 'border-pacific-500 text-pacific-400'
                        : 'border-transparent text-surface-soft/70 hover:text-white'
                    }`}
                  >
                    <Info className="w-4 h-4 inline mr-2" />
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('metadata')}
                    className={`py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'metadata'
                        ? 'border-pacific-500 text-pacific-400'
                        : 'border-transparent text-surface-soft/70 hover:text-white'
                    }`}
                  >
                    <Database className="w-4 h-4 inline mr-2" />
                    ISO Metadata
                  </button>
                  <button
                    onClick={() => setActiveTab('map')}
                    className={`py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'map'
                        ? 'border-pacific-500 text-pacific-400'
                        : 'border-transparent text-surface-soft/70 hover:text-white'
                    }`}
                  >
                    <MapPin className="w-4 h-4 inline mr-2" />
                    Location
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'overview' && (
                  <OverviewTab image={image as any} />
                )}
                {activeTab === 'metadata' && (
                  <MetadataTab image={image as any} />
                )}
                {activeTab === 'map' && <LocationTab image={image as any} />}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="bg-deep-900/50 rounded-2xl border border-white/10 p-6 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white mb-4">
                Quick Info
              </h2>

              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Tag className="w-5 h-5 text-pacific-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      Hazard Type
                    </p>
                    <p className="text-sm text-surface-soft capitalize">
                      {HAZARD_TYPE_LABELS[
                        (image as any)
                          .hazard_type as keyof typeof HAZARD_TYPE_LABELS
                      ] || (image as any).hazard_type}
                    </p>
                  </div>
                </div>

                {(image as any).source_agency && (
                  <div className="flex items-start space-x-3">
                    <Building className="w-5 h-5 text-pacific-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        Source Agency
                      </p>
                      <p className="text-sm text-surface-soft">
                        {SOURCE_AGENCY_LABELS[
                          (image as any)
                            .source_agency as keyof typeof SOURCE_AGENCY_LABELS
                        ] || (image as any).source_agency}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start space-x-3">
                  <Calendar className="w-5 h-5 text-pacific-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      Upload Date
                    </p>
                    <p className="text-sm text-surface-soft">
                      {new Date(
                        (image as any).upload_date
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {(image as any).latitude && (image as any).longitude && (
                  <div className="flex items-start space-x-3">
                    <MapPin className="w-5 h-5 text-pacific-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        Coordinates
                      </p>
                      <p className="text-sm text-surface-soft font-mono">
                        {(image as any).latitude.toFixed(6)},{' '}
                        {(image as any).longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}

                {((image as any).format_name || fileSizeLabel) && (
                  <div className="flex items-start space-x-3">
                    <FileText className="w-5 h-5 text-pacific-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        File Info
                      </p>
                      <p className="text-sm text-surface-soft">
                        {(image as any).format_name || 'Unknown format'}
                        {fileSizeLabel ? ` • ${fileSizeLabel}` : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Keywords */}
            {(image as any).keywords && (image as any).keywords.length > 0 && (
              <div className="bg-deep-900/50 rounded-2xl border border-white/10 p-6 backdrop-blur-sm">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Keywords
                </h2>
                <div className="flex flex-wrap gap-2">
                  {(image as any).keywords.map((keyword: any, index: any) => (
                    <span
                      key={`${keyword}-${(image as any).id}-${index}`}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pacific-500/20 text-pacific-300 border border-pacific-500/30"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Information */}
            {(image as any).contact && (
              <div className="bg-deep-900/50 rounded-2xl border border-white/10 p-6 backdrop-blur-sm">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Contact
                </h2>
                <div className="space-y-4">
                  {(image as any).contact.organisation_name && (
                    <div className="flex items-start space-x-3">
                      <Building className="w-4 h-4 text-pacific-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          Organisation
                        </p>
                        <p className="text-sm text-surface-soft">
                          {(image as any).contact.organisation_name}
                        </p>
                      </div>
                    </div>
                  )}
                  {(image as any).contact.individual_name && (
                    <div className="flex items-start space-x-3">
                      <User className="w-4 h-4 text-pacific-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          Individual
                        </p>
                        <p className="text-sm text-surface-soft">
                          {(image as any).contact.individual_name}
                        </p>
                      </div>
                    </div>
                  )}
                  {(image as any).contact.contact_info?.email && (
                    <div className="flex items-start space-x-3">
                      <ExternalLink className="w-4 h-4 text-pacific-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Email</p>
                        <a
                          href={`mailto:${(image as any).contact.contact_info.email}`}
                          className="text-sm text-pacific-400 hover:text-pacific-300"
                        >
                          {(image as any).contact.contact_info.email}
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
        <h3 className="text-lg font-medium text-white mb-3">Description</h3>
        <p className="text-surface-soft leading-relaxed">
          {image.abstract || 'No description available for this image.'}
        </p>
      </div>

      {/* Purpose */}
      {image.purpose && (
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Purpose</h3>
          <p className="text-surface-soft leading-relaxed">{image.purpose}</p>
        </div>
      )}

      {/* Topic Categories */}
      {image.topic_category && image.topic_category.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-white mb-3">
            Topic Categories
          </h3>
          <div className="flex flex-wrap gap-2">
            {image.topic_category.map((category) => (
              <span
                key={`${category}-${(image as any).id}`}
                className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-green-500/20 text-green-300 border border-green-500/30"
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
          <h3 className="text-lg font-medium text-white mb-3">
            Camera Information
          </h3>
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {image.camera_info.make && (
                <div>
                  <span className="font-medium text-white">Make:</span>
                  <span className="ml-2 text-surface-soft">
                    {image.camera_info.make}
                  </span>
                </div>
              )}
              {image.camera_info.model && (
                <div>
                  <span className="font-medium text-white">Model:</span>
                  <span className="ml-2 text-surface-soft">
                    {image.camera_info.model}
                  </span>
                </div>
              )}
              {image.camera_info.focal_length && (
                <div>
                  <span className="font-medium text-white">Focal Length:</span>
                  <span className="ml-2 text-surface-soft">
                    {image.camera_info.focal_length}
                  </span>
                </div>
              )}
              {image.camera_info.aperture && (
                <div>
                  <span className="font-medium text-white">Aperture:</span>
                  <span className="ml-2 text-surface-soft">
                    {image.camera_info.aperture}
                  </span>
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
  // Format date stamp safely
  const formatDateStamp = (dateStr: string) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date.toLocaleDateString();
    } catch {
      return null;
    }
  };

  const metadataFields = [
    { label: 'File Identifier', value: image.file_identifier, icon: Database },
    { label: 'Language', value: image.language, icon: Globe },
    { label: 'Character Set', value: image.character_set, icon: FileText },
    { label: 'Hierarchy Level', value: image.hierarchy_level, icon: Shield },
    {
      label: 'Date Stamp',
      value: formatDateStamp(image.date_stamp),
      icon: Clock,
    },
    {
      label: 'Spatial Resolution',
      value: image.spatial_resolution,
      icon: MapPin,
    },
    {
      label: 'Reference System',
      value: image.reference_system_info,
      icon: Globe,
    },
    { label: 'Format Name', value: (image as any).format_name, icon: FileText },
    { label: 'Format Version', value: image.format_version, icon: FileText },
    {
      label: 'Access Constraints',
      value: image.access_constraints,
      icon: Shield,
    },
    { label: 'Use Constraints', value: image.use_constraints, icon: Shield },
    { label: 'Processing Level', value: image.processing_level, icon: Tag },
  ];

  const validFields = metadataFields.filter((field) => field.value);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">
          ISO 19115 Metadata Record
        </h3>
        <p className="text-sm text-surface-soft/70 mb-6">
          This image follows the ISO 19115 geographic information metadata
          standard.
        </p>
      </div>

      <div className="grid gap-4">
        {validFields.map((field) => {
          const IconComponent = field.icon;
          return (
            <div
              key={field.label}
              className="flex items-start space-x-3 py-3 border-b border-white/10 last:border-b-0"
            >
              <IconComponent className="w-5 h-5 text-pacific-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{field.label}</p>
                <p className="text-sm text-surface-soft break-words">
                  {field.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Geographic Extent */}
      {image.geographic_element && (
        <div className="mt-6">
          <h4 className="text-md font-medium text-white mb-3">
            Geographic Extent
          </h4>
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-white">West:</span>
                <span className="ml-2 text-surface-soft font-mono">
                  {image.geographic_element.west_bound_longitude}°
                </span>
              </div>
              <div>
                <span className="font-medium text-white">East:</span>
                <span className="ml-2 text-surface-soft font-mono">
                  {image.geographic_element.east_bound_longitude}°
                </span>
              </div>
              <div>
                <span className="font-medium text-white">South:</span>
                <span className="ml-2 text-surface-soft font-mono">
                  {image.geographic_element.south_bound_latitude}°
                </span>
              </div>
              <div>
                <span className="font-medium text-white">North:</span>
                <span className="ml-2 text-surface-soft font-mono">
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
    if ((image as any).latitude && (image as any).longitude) {
      configureLeafletIcons();
    }
  }, [(image as any).latitude, (image as any).longitude]);

  if (!(image as any).latitude || !(image as any).longitude) {
    return (
      <div className="text-center py-8">
        <MapPin className="w-12 h-12 text-pacific-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">
          No location data
        </h3>
        <p className="text-surface-soft/70">
          This image does not have geographic coordinates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">
          Location Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h4 className="font-medium text-white mb-2">Coordinates</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-white">Latitude:</span>
                <span className="ml-2 font-mono text-surface-soft">
                  {(image as any).latitude.toFixed(6)}°
                </span>
              </div>
              <div>
                <span className="font-medium text-white">Longitude:</span>
                <span className="ml-2 font-mono text-surface-soft">
                  {(image as any).longitude.toFixed(6)}°
                </span>
              </div>
              <div>
                <span className="font-medium text-white">System:</span>
                <span className="ml-2 text-surface-soft">
                  {image.reference_system_info}
                </span>
              </div>
            </div>
          </div>

          {image.spatial_resolution && (
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h4 className="font-medium text-white mb-2">
                Spatial Information
              </h4>
              <div className="text-sm">
                <span className="font-medium text-white">Resolution:</span>
                <span className="ml-2 text-surface-soft">
                  {image.spatial_resolution}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-64">
        <MapContainer
          center={
            [(image as any).latitude, (image as any).longitude] as [
              number,
              number,
            ]
          }
          zoom={8}
          className="h-full w-full rounded-lg overflow-hidden"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <Marker
            position={
              [(image as any).latitude, (image as any).longitude] as [
                number,
                number,
              ]
            }
            icon={createCustomIcon((image as any).hazard_type)}
          >
            <Popup>{(image as any).title || (image as any).filename}</Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* External Links */}
      <div className="flex flex-wrap gap-4">
        <a
          href={`https://www.google.com/maps?q=${(image as any).latitude},${(image as any).longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-4 py-2 border border-white/20 rounded-lg text-sm font-medium text-surface-soft hover:bg-white/5 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View in Google Maps
        </a>
        <a
          href={`https://www.openstreetmap.org/?mlat=${(image as any).latitude}&mlon=${(image as any).longitude}&zoom=15`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-4 py-2 border border-white/20 rounded-lg text-sm font-medium text-surface-soft hover:bg-white/5 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View in OpenStreetMap
        </a>
      </div>
    </div>
  );
}
