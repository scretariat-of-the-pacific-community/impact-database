'use client';

import { useQuery } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { ArrowLeft, Download, MapPin, Calendar, Globe, Camera, FileText, Share2, ExternalLink, Map, Eye } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';

interface ImageMetadata {
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
  acquisition_date?: string;
  // ISO 19115 Metadata fields
  responsible_party?: string;
  spatial_resolution?: string;
  temporal_extent?: string;
  lineage?: string;
  data_quality?: string;
  constraints?: string;
  maintenance_info?: string;
  contact_info?: string;
  citation_info?: string;
  distribution_info?: string;
  metadata_standard?: string;
  character_set?: string;
  hierarchy_level?: string;
  language?: string;
  topic_category?: string[] | undefined;
  extent_description?: string;
  reference_system?: string;
  format_name?: string;
  format_version?: string;
}

interface RelatedImageProps {
  image: ImageMetadata;
  onClick: () => void;
}

function RelatedImageCard({ image, onClick }: RelatedImageProps) {
  const imageUrl = `${process.env.NEXT_PUBLIC_API_URL}/images/${encodeURIComponent(image.filename)}`;
  
  return (
    <div 
      className="bg-white rounded-lg shadow hover:shadow-md transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
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
          <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>
      </div>
      <div className="p-3">
        <h4 className="font-medium text-gray-900 text-sm truncate mb-1">
          {image.title || image.filename}
        </h4>
        <p className="text-xs text-gray-600 truncate">{image.location}</p>
        {image.timestamp && (
          <p className="text-xs text-gray-500 mt-1">
            {new Date(image.timestamp).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

function MetadataSection({ title, children, icon }: { title: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        {icon}
        <h2 className="text-lg font-semibold text-gray-900 ml-2">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MetadataField({ label, value, className = "" }: { label: string; value?: string | number; className?: string }) {
  if (!value) return null;
  
  return (
    <div className={`py-2 ${className}`}>
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900 mt-1">{value}</dd>
    </div>
  );
}

export default function ImageDetailPage() {
  const params = useParams();
  const filename = decodeURIComponent(params.filename as string);
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  
  // Fetch single image metadata
  const { data: imageData, isLoading, error } = useQuery({
    queryKey: ['image', filename],
    queryFn: () => imageApi.getMetadata(filename).then(res => res.data),
  });

  // Fetch all images for related images
  const { data: allImages } = useQuery({
    queryKey: ['images'],
    queryFn: () => imageApi.getAll().then(res => res.data),
  });

  // Find related images
  const relatedImages = useMemo(() => {
    if (!allImages || !imageData) return [];
    
    return allImages
      .filter(img => 
        img.filename !== imageData.filename &&
        (img.hazard_type === imageData.hazard_type || 
         img.location === imageData.location ||
         img.country === imageData.country)
      )
      .slice(0, 6);
  }, [allImages, imageData]);

  const imageUrl = imageData ? `${process.env.NEXT_PUBLIC_API_URL}/images/${encodeURIComponent(imageData.filename)}` : '';
  const downloadUrl = imageUrl ? `${imageUrl}?download=true` : '';

  const getHazardColor = (hazard: string) => {
    const colors: Record<string, string> = {
      flood: 'bg-blue-100 text-blue-800',
      cyclone: 'bg-purple-100 text-purple-800',
      drought: 'bg-yellow-100 text-yellow-800',
      earthquake: 'bg-red-100 text-red-800',
      tsunami: 'bg-cyan-100 text-cyan-800',
      landslide: 'bg-orange-100 text-orange-800',
      wildfire: 'bg-red-100 text-red-800',
    };
    return colors[hazard] || 'bg-gray-100 text-gray-800';
  };

  const getHazardIcon = (hazard: string) => {
    switch (hazard) {
      case 'flood': return '🌊';
      case 'cyclone': return '🌀';
      case 'drought': return '🏜️';
      case 'earthquake': return '🫨';
      case 'tsunami': return '🌊';
      case 'landslide': return '⛰️';
      case 'wildfire': return '🔥';
      default: return '⚠️';
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You might want to show a toast notification here
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading image details...</p>
        </div>
      </div>
    );
  }

  if (error || !imageData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Image Not Found</h1>
          <p className="text-gray-600 mb-6">The requested image could not be found.</p>
          <Link 
            href="/images" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Gallery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <Link href="/images" className="mr-4">
                <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-gray-900" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 truncate">
                  {imageData.title || imageData.filename}
                </h1>
                <div className="flex items-center mt-1">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getHazardColor(imageData.hazard_type)}`}>
                    <span className="mr-1">{getHazardIcon(imageData.hazard_type)}</span>
                    {imageData.hazard_type}
                  </span>
                  <span className="ml-3 text-sm text-gray-600">{imageData.location}</span>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => copyToClipboard(window.location.href)}
                className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </button>
              
              {imageData.latitude && imageData.longitude && (
                <Link
                  href={`/map?lat=${imageData.latitude}&lng=${imageData.longitude}&zoom=12`}
                  className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Map className="w-4 h-4 mr-2" />
                  View on Map
                </Link>
              )}
              
              <a
                href={downloadUrl}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Image */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="relative aspect-video bg-gray-100">
                <Image
                  src={imageUrl}
                  alt={imageData.title || imageData.filename}
                  fill
                  className="object-contain"
                  priority
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder-image.svg';
                  }}
                />
              </div>
              
              {/* Image Info Bar */}
              <div className="p-4 bg-gray-50 border-t">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Filename: {imageData.filename}</span>
                  {imageData.file_size && (
                    <span>Size: {(imageData.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Metadata Sidebar */}
          <div className="space-y-6">
            {/* Basic Information */}
            <MetadataSection title="Basic Information" icon={<FileText className="w-5 h-5 text-gray-600" />}>
              <dl className="divide-y divide-gray-200">
                <MetadataField label="Title" value={imageData.title} />
                <MetadataField label="Abstract" value={imageData.abstract} />
                <MetadataField label="Hazard Type" value={imageData.hazard_type} />
                <MetadataField label="Location" value={imageData.location} />
                <MetadataField label="Country" value={imageData.country} />
                {imageData.keywords && imageData.keywords.length > 0 && (
                  <div className="py-2">
                    <dt className="text-sm font-medium text-gray-600">Keywords</dt>
                    <dd className="text-sm text-gray-900 mt-1">
                      <div className="flex flex-wrap gap-1">
                        {imageData.keywords.map((keyword: string, index: number) => (
                          <span
                            key={index}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </dd>
                  </div>
                )}
              </dl>
            </MetadataSection>

            {/* Geographic Information */}
            <MetadataSection title="Geographic Information" icon={<Globe className="w-5 h-5 text-gray-600" />}>
              <dl className="divide-y divide-gray-200">
                {imageData.latitude && imageData.longitude && (
                  <>
                    <MetadataField label="Latitude" value={imageData.latitude.toFixed(6)} />
                    <MetadataField label="Longitude" value={imageData.longitude.toFixed(6)} />
                    <div className="py-2">
                      <dt className="text-sm font-medium text-gray-600">Coordinates</dt>
                      <dd className="text-sm text-gray-900 mt-1 font-mono">
                        {imageData.latitude.toFixed(6)}, {imageData.longitude.toFixed(6)}
                        <button
                          onClick={() => copyToClipboard(`${imageData.latitude},${imageData.longitude}`)}
                          className="ml-2 text-blue-600 hover:text-blue-700 text-xs"
                        >
                          Copy
                        </button>
                      </dd>
                    </div>
                  </>
                )}
                <MetadataField label="Reference System" value={imageData.reference_system} />
                <MetadataField label="Spatial Resolution" value={imageData.spatial_resolution} />
              </dl>
            </MetadataSection>

            {/* Temporal Information */}
            <MetadataSection title="Temporal Information" icon={<Calendar className="w-5 h-5 text-gray-600" />}>
              <dl className="divide-y divide-gray-200">
                {(imageData.timestamp || imageData.acquisition_date) && (
                  <div className="py-2">
                    <dt className="text-sm font-medium text-gray-600">Date</dt>
                    <dd className="text-sm text-gray-900 mt-1">
                      {new Date(imageData.timestamp || imageData.acquisition_date!).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </dd>
                  </div>
                )}
                <MetadataField label="Temporal Extent" value={imageData.temporal_extent} />
              </dl>
            </MetadataSection>

            {/* Technical Information */}
            <MetadataSection title="Technical Information" icon={<Camera className="w-5 h-5 text-gray-600" />}>
              <dl className="divide-y divide-gray-200">
                <MetadataField label="Format" value={imageData.format_name} />
                <MetadataField label="Format Version" value={imageData.format_version} />
                <MetadataField label="Character Set" value={imageData.character_set} />
                <MetadataField label="Language" value={imageData.language} />
                <MetadataField label="Topic Category" value={imageData.topic_category} />
              </dl>
            </MetadataSection>
          </div>
        </div>

        {/* ISO 19115 Metadata */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">ISO 19115 Metadata Standard</h2>
                <button
                  onClick={() => setShowFullMetadata(!showFullMetadata)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showFullMetadata ? 'Hide Details' : 'Show Full Metadata'}
                </button>
              </div>
            </div>
            
            {showFullMetadata && (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-md font-medium text-gray-900 mb-3">Identification</h3>
                    <dl className="space-y-2">
                      <MetadataField label="Citation Info" value={imageData.citation_info} />
                      <MetadataField label="Responsible Party" value={imageData.responsible_party} />
                      <MetadataField label="Maintenance Info" value={imageData.maintenance_info} />
                      <MetadataField label="Extent Description" value={imageData.extent_description} />
                    </dl>
                  </div>
                  
                  <div>
                    <h3 className="text-md font-medium text-gray-900 mb-3">Quality & Lineage</h3>
                    <dl className="space-y-2">
                      <MetadataField label="Data Quality" value={imageData.data_quality} />
                      <MetadataField label="Lineage" value={imageData.lineage} />
                      <MetadataField label="Constraints" value={imageData.constraints} />
                    </dl>
                  </div>
                  
                  <div>
                    <h3 className="text-md font-medium text-gray-900 mb-3">Distribution</h3>
                    <dl className="space-y-2">
                      <MetadataField label="Distribution Info" value={imageData.distribution_info} />
                      <MetadataField label="Contact Info" value={imageData.contact_info} />
                    </dl>
                  </div>
                  
                  <div>
                    <h3 className="text-md font-medium text-gray-900 mb-3">Metadata</h3>
                    <dl className="space-y-2">
                      <MetadataField label="Metadata Standard" value={imageData.metadata_standard} />
                      <MetadataField label="Hierarchy Level" value={imageData.hierarchy_level} />
                    </dl>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related Images */}
        {relatedImages.length > 0 && (
          <div className="mt-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Related Images</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {relatedImages.map((image) => (
                  <RelatedImageCard
                    key={image.filename}
                    image={image}
                    onClick={() => window.location.href = `/images/${encodeURIComponent(image.filename)}`}
                  />
                ))}
              </div>
              
              {allImages && allImages.length > relatedImages.length + 1 && (
                <div className="mt-4 text-center">
                  <Link
                    href={`/images?hazard=${imageData.hazard_type}`}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    View All {imageData.hazard_type} Images
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <a
              href={downloadUrl}
              className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Original
            </a>
            
            <Link
              href={`/images?location=${encodeURIComponent(imageData.location)}`}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Same Location
            </Link>
            
            <Link
              href={`/images?hazard=${imageData.hazard_type}`}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              {getHazardIcon(imageData.hazard_type)}
              <span className="ml-2">Same Hazard</span>
            </Link>
            
            <Link
              href="/images"
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Gallery
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}