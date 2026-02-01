'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ContentItem } from '@/lib/types';
import { X, MapPin, Calendar, Download, Share2, Eye, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { imageApi } from '@/lib/api';
import { toast } from 'sonner';

interface ContentModalProps {
  item: ContentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
}

export default function ContentModal({ item, isOpen, onClose, onDelete }: ContentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleDelete = async () => {
    if (!item) return;
    
    try {
      setIsDeleting(true);
      
      if (item.content_type === 'video') {
        await imageApi.deleteVideo(item.id);
        toast.success('Video deleted successfully');
      } else {
        await imageApi.deleteImage(item.filename || item.id);
        toast.success('Image deleted successfully');
      }
      
      setShowDeleteConfirm(false);
      onClose();
      if (onDelete) onDelete();
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err.message || 'Failed to delete content';
      toast.error(errorMessage);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !item) return null;

  const isVideo = item.content_type === 'video';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white pr-4 line-clamp-1">
            {item.title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
            {/* Media Preview */}
            <div className="lg:col-span-2">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {isVideo ? (
                  <video
                    src={item.url}
                    poster={item.thumbnail_url}
                    controls
                    className="w-full h-full"
                    controlsList="nodownload"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <Image
                    src={item.url}
                    alt={item.title}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4">
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-pacific-600 hover:bg-pacific-700 text-white rounded-lg transition-colors">
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-rose-300 dark:border-rose-600 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metadata Sidebar */}
            <div className="space-y-6">
              {/* Description */}
              {item.description && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Description
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {item.description}
                  </p>
                </div>
              )}

              {/* Hazard Type */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Hazard Type
                </h3>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-pacific-100 dark:bg-pacific-900 text-pacific-700 dark:text-pacific-300 font-medium text-sm">
                  {formatHazardType(item.hazard_type)}
                </span>
              </div>

              {/* Location */}
              {(item.location || item.country || (item.latitude && item.longitude)) && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    Location
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {item.location && <p>{item.location}</p>}
                    {item.country && <p>{item.country}</p>}
                    {item.latitude && item.longitude && (
                      <p className="text-xs font-mono">
                        {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Dates
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  {item.captured_date && (
                    <p>
                      <span className="font-medium">Captured:</span>{' '}
                      {formatDate(item.captured_date)}
                    </p>
                  )}
                  {item.upload_date && (
                    <p>
                      <span className="font-medium">Uploaded:</span>{' '}
                      {formatDate(item.upload_date)}
                    </p>
                  )}
                </div>
              </div>

              {/* Video Technical Details */}
              {isVideo && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Technical Details
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {item.duration && (
                      <p>
                        <span className="font-medium">Duration:</span>{' '}
                        {formatDuration(item.duration)}
                      </p>
                    )}
                    {item.width && item.height && (
                      <p>
                        <span className="font-medium">Resolution:</span>{' '}
                        {item.width}×{item.height}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {item.keywords && item.keywords.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Keywords
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {item.keywords.map((keyword, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Content Type Badge */}
              <div>
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded-full font-medium">
                  {isVideo ? '🎥 Video' : '📷 Image'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-600 flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Delete {isVideo ? 'Video' : 'Image'}?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This will permanently delete &quot;{item.title || item.filename}&quot;. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mb-6 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-600 rounded-lg">
              <p className="text-xs text-rose-700 dark:text-rose-300">
                <strong>Note:</strong> You can only delete {isVideo ? 'videos' : 'images'} in &quot;pending&quot; status. Approved content can only be deleted by administrators.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete {isVideo ? 'Video' : 'Image'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Functions
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatHazardType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}
