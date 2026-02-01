'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendFetch } from '@/lib/auth-utils';
import { getApiUrl } from '@/lib/config';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PencilIcon,
  ArrowsRightLeftIcon,
  FlagIcon,
  EyeIcon,
  UserIcon,
  MapPinIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import MetadataEditor from './MetadataEditor';
import CommentsSystem from './CommentsSystem';
import Image from 'next/image';
import { sanitizeText } from '@/lib/sanitize';
import ErrorBanner from './ErrorBanner';

interface ReviewItem {
  id: string;
  content_type?: string;  // 'image' or 'video'
  image_filename: string;
  status:
    | 'pending'
    | 'under_review'
    | 'approved'
    | 'rejected'
    | 'needs_changes'
    | 'duplicate'
    | 'archived';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  due_date?: string;
  is_flagged: boolean;
  flag_reason?: string;
  review_notes?: string;
  image_metadata?: {
    id: string;
    title?: string;
    abstract?: string;
    hazard_type?: string;
    datetime?: string;
    severity?: string;
    filename?: string;
    thumbnail_url?: string;
    resource_locator?: string;  // Video stream URL
    duration?: number;  // Video duration in seconds
    latitude?: number;
    longitude?: number;
    content_type?: string;  // For video metadata
    [key: string]: any;
  };
  // Legacy fields for backwards compatibility
  imageId?: string;
  title?: string;
  description?: string;
  submittedBy?: string;
  submittedAt?: string;
  lastModified?: string;
  dueDate?: string;
  flagged?: boolean;
  flagReason?: string;
  reviewerNotes?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  assignedTo?: string | null;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  duplicateItems?: Array<{
    id: string;
    imageId: string;
    title: string;
    similarity: number;
  }>;
}

interface ReviewWorkflowProps {
  itemId: string;
  onStatusChange?: (newStatus: string) => void;
  onClose?: () => void;
}

const ReviewWorkflow: React.FC<ReviewWorkflowProps> = ({
  itemId,
  onStatusChange,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<
    'review' | 'metadata' | 'comments' | 'duplicates'
  >('review');
  const [reviewNotes, setReviewNotes] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [showImageModal, setShowImageModal] = useState(false);

  const queryClient = useQueryClient();

  // Fetch review item details
  const {
    data: item,
    isLoading,
    error,
  } = useQuery<ReviewItem>({
    queryKey: ['review-item', itemId],
    queryFn: async () => {
      const response = await backendFetch(
        `/api/admin/curation/queue/${itemId}`
      );
      if (!response.ok) throw new Error('Failed to fetch review item');
      return response.json();
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      status,
      notes,
    }: {
      status: string;
      notes?: string;
    }) => {
      const response = await backendFetch(
        `/api/admin/curation/queue/${itemId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            status,
            review_notes: notes,
            action: selectedAction,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['review-item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['curation-queue'] });
      onStatusChange?.(data.status);
    },
  });

  // Assign to self mutation (claim)
  const assignMutation = useMutation({
    mutationFn: async () => {
      const response = await backendFetch(
        `/api/admin/curation/queue/${itemId}/claim`,
        {
          method: 'POST',
        }
      );
      if (!response.ok) throw new Error('Failed to claim item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-item', itemId] });
    },
  });

  // Flag mutation
  const flagMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await backendFetch(
        `/api/admin/curation/queue/${itemId}/flag`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );
      if (!response.ok) throw new Error('Failed to flag item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-item', itemId] });
    },
  });

  // Mark as duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: async (originalItemId: string) => {
      const response = await backendFetch(
        `/api/admin/curation/queue/${itemId}/mark-duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({ original_item_id: originalItemId }),
        }
      );
      if (!response.ok) throw new Error('Failed to mark as duplicate');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-item', itemId] });
    },
  });

  // Use refs for values that change frequently to avoid re-registering keyboard listener
  const reviewNotesRef = useRef(reviewNotes);
  const updateStatusMutationRef = useRef(updateStatusMutation);
  const flagMutationRef = useRef(flagMutation);

  // Keep refs in sync with current values
  useEffect(() => {
    reviewNotesRef.current = reviewNotes;
  }, [reviewNotes]);

  useEffect(() => {
    updateStatusMutationRef.current = updateStatusMutation;
  }, [updateStatusMutation]);

  useEffect(() => {
    flagMutationRef.current = flagMutation;
  }, [flagMutation]);

  const handleStatusUpdate = useCallback((status: string) => {
    setSelectedAction(status);
    updateStatusMutationRef.current.mutate({
      status,
      notes: reviewNotesRef.current,
    });
  }, []);

  const handleAssignToSelf = useCallback(() => {
    assignMutation.mutate({} as any);
  }, [assignMutation]);

  const handleFlag = useCallback(() => {
    const reason = prompt('Please provide a reason for flagging this item:');
    if (reason && reason.trim()) {
      flagMutationRef.current.mutate(reason.trim());
    }
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'under_review':
        return <EyeIcon className="h-5 w-5 text-blue-500" />;
      case 'approved':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'needs_changes':
        return <PencilIcon className="h-5 w-5 text-orange-500" />;
      case 'duplicate':
        return <ArrowsRightLeftIcon className="h-5 w-5 text-purple-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'under_review':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'needs_changes':
        return 'bg-orange-100 text-orange-800';
      case 'duplicate':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Keyboard shortcuts - register once, use refs for dynamic values
  useEffect(() => {
    if (!item) return;
    if (typeof window === 'undefined') return;

    const handler = (event: KeyboardEvent): any => {
      // Ignore shortcuts when typing in input fields
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (event.target as HTMLElement)?.tagName || ''
        )
      ) {
        return;
      }

      // Keyboard shortcuts for review actions
      if (event.key.toLowerCase() === 'a') {
        handleStatusUpdate('approved');
      } else if (event.key.toLowerCase() === 'r') {
        handleStatusUpdate('rejected');
      } else if (event.key.toLowerCase() === 'n') {
        handleStatusUpdate('needs_changes');
      } else if (event.key.toLowerCase() === 'f') {
        handleFlag();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item, handleFlag, handleStatusUpdate]); // Minimal deps - handlers are stable with useCallback

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !item) {
    const message =
      error instanceof Error
        ? error.message
        : 'We could not retrieve the data for this submission. Please try again.';
    return (
      <ErrorBanner
        title="Error loading review item"
        message={message}
        tone="error"
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: ['review-item', itemId] })
        }
        retryLabel="Retry fetch"
      />
    );
  }

  // Normalize display fields and image URLs
  const meta = item.image_metadata || {};
  const filename = (meta as any).filename || item.image_filename;

  const buildAssetUrl = (
    path?: string | null,
    fallbackFilename?: string | null
  ) => {
    if (!path && !fallbackFilename) return undefined;

    // Normalize path to ensure it uses /upload/images/ prefix
    let candidate = path;
    if (path && !path.startsWith('http')) {
      // Remove leading slash if present for easier manipulation
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;

      // If path starts with images/, replace with upload/images/
      if (cleanPath.startsWith('images/')) {
        candidate = `/upload/${cleanPath}`;
      } else if (cleanPath.startsWith('upload/images/')) {
        // Already correct, just ensure leading slash
        candidate = `/${cleanPath}`;
      } else {
        // Assume it's just a filename, prepend /upload/images/
        candidate = `/upload/images/${cleanPath}`;
      }
    }

    // Fallback to filename if no path provided
    if (!candidate && fallbackFilename) {
      candidate = `/upload/images/${encodeURIComponent(fallbackFilename)}`;
    }

    if (!candidate) return undefined;

    // If it's already a full URL, return as-is
    if (candidate.startsWith('http')) return candidate;

    // Always use getApiUrl for relative paths to ensure proper proxying
    return getApiUrl(candidate);
  };

  const buildThumbnailUrl = (
    metaObj: any,
    fallbackFilename?: string | null
  ) => {
    // Prefer explicit thumbnail; otherwise derive a lightweight thumbnail path
    if (metaObj?.thumbnail_url || metaObj?.thumbnailUrl) {
      return buildAssetUrl(
        metaObj.thumbnail_url || metaObj.thumbnailUrl,
        fallbackFilename
      );
    }
    if (fallbackFilename) {
      // Use the upload/images endpoint for serving files from storage
      return buildAssetUrl(
        `/upload/images/${encodeURIComponent(fallbackFilename)}`
      );
    }
    // Last resort: if only a resource locator exists, use it (may be full size)
    if (metaObj?.resource_locator || metaObj?.resourceLocator) {
      return buildAssetUrl(metaObj.resource_locator || metaObj.resourceLocator);
    }
    return undefined;
  };

  const thumbnailUrl = item.thumbnailUrl || buildThumbnailUrl(meta, filename);
  const imageUrl =
    item.imageUrl ||
    buildAssetUrl(
      (meta as any).resource_locator ||
        (meta as any).thumbnail_url ||
        (meta as any).thumbnailUrl,
      filename
    ) ||
    thumbnailUrl;

  const safeTitle = sanitizeText(
    item.title || (meta as any).title || 'Untitled'
  );
  const safeDescription = sanitizeText(
    item.description || (meta as any).abstract || 'No description provided'
  );
  const safeSubmittedBy = sanitizeText(item.submitted_by || '');
  const safeImageId = sanitizeText(item.image_filename);
  const safeHazardType = sanitizeText((meta as any).hazard_type || '');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Review Item</h1>
            <div className="flex items-center space-x-2">
              {getStatusIcon(item.status)}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}
              >
                {item.status.replace('_', ' ').toUpperCase()}
              </span>
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(item.priority)}`}
              >
                {item.priority.toUpperCase()}
              </span>
              {item.is_flagged && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  <FlagIcon className="h-3 w-3 mr-1" />
                  Flagged
                </span>
              )}
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Item Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Image/Video */}
          <div className="lg:col-span-1">
            <div className="relative">
              {item.content_type === 'video' ? (
                // Video Player
                <div className="relative w-full bg-black rounded-lg overflow-hidden">
                  <video
                    src={imageUrl}
                    controls
                    className="w-full h-full"
                    style={{ aspectRatio: '16 / 9', maxHeight: '300px' }}
                  />
                  {item.image_metadata?.duration && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      ⏱️ {Math.floor(item.image_metadata.duration)}s
                    </div>
                  )}
                </div>
              ) : (
                // Image Display
                <>
                  {thumbnailUrl || imageUrl ? (
                    <div className="relative w-full h-48 bg-gray-200 rounded-lg overflow-hidden">
                      <img
                        src={thumbnailUrl || imageUrl || ''}
                        alt={safeTitle}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setShowImageModal(true)}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                      <PhotoIcon className="h-12 w-12 text-gray-400" />
                    </div>
                  )}
                  <button
                    onClick={() => setShowImageModal(true)}
                    className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 text-white rounded"
                  >
                    <EyeIcon className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">{safeTitle}</h3>
              <p className="text-gray-600 mt-1">{safeDescription}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="font-medium text-gray-700">
                  {item.content_type === 'video' ? 'Video' : 'Image'} ID:
                </label>
                <p className="text-gray-900 text-xs break-all">{safeImageId}</p>
              </div>
              <div>
                <label className="font-medium text-gray-700">
                  Hazard Type:
                </label>
                <p className="text-gray-900 capitalize">{safeHazardType}</p>
              </div>
              {item.content_type === 'video' && item.image_metadata?.duration && (
                <div>
                  <label className="font-medium text-gray-700">Duration:</label>
                  <p className="text-gray-900">{Math.floor(item.image_metadata.duration)}s</p>
                </div>
              )}
              <div>
                <label className="font-medium text-gray-700">
                  Submitted By:
                </label>
                <p className="text-gray-900">{safeSubmittedBy}</p>
              </div>
              <div>
                <label className="font-medium text-gray-700">Submitted:</label>
                <p className="text-gray-900">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
              {item.location && (
                <div className="col-span-2">
                  <label className="font-medium text-gray-700 flex items-center">
                    <MapPinIcon className="h-4 w-4 mr-1" />
                    Location:
                  </label>
                  <p className="text-gray-900">{item.location.address}</p>
                  <p className="text-xs text-gray-500">
                    {item.location.latitude}, {item.location.longitude}
                  </p>
                </div>
              )}
              {item.image_metadata?.datetime && (
                <div>
                  <label className="font-medium text-gray-700 flex items-center">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    Capture Date:
                  </label>
                  <p className="text-gray-900">
                    {new Date(
                      item.image_metadata.datetime
                    ).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav
            className="flex space-x-8 px-6"
            role="navigation"
            aria-label="Review workflow tabs"
          >
            {[
              { id: 'review', label: 'Review', icon: CheckCircleIcon },
              { id: 'metadata', label: 'Metadata', icon: DocumentTextIcon },
              { id: 'comments', label: 'Comments', icon: DocumentTextIcon },
              {
                id: 'duplicates',
                label: 'Duplicates',
                icon: ArrowsRightLeftIcon,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.id === 'duplicates' && item.duplicateItems?.length && (
                    <span className="bg-red-100 text-red-800 text-xs rounded-full px-2 py-1">
                      {item.duplicateItems.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'review' && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Assignment */}
                {!item.assigned_to && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-blue-900">
                          Unassigned Item
                        </h4>
                        <p className="text-sm text-blue-700 mt-1">
                          This item is not assigned to anyone.
                        </p>
                      </div>
                      <button
                        onClick={handleAssignToSelf}
                        disabled={assignMutation.isPending}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        Assign to Me
                      </button>
                    </div>
                  </div>
                )}

                {/* Review Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Review Notes
                  </label>
                  <textarea
                    value={reviewNotes}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setReviewNotes(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-3 focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    placeholder="Add notes about your review decision..."
                  />
                  {item.reviewerNotes && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                      <h5 className="text-sm font-medium text-gray-700">
                        Previous Notes:
                      </h5>
                      <p className="text-sm text-gray-600 mt-1">
                        {item.reviewerNotes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button
                    onClick={() => handleStatusUpdate('approved')}
                    disabled={updateStatusMutation.isPending}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircleIcon className="h-4 w-4 mr-2" />
                    Approve
                  </button>

                  <button
                    onClick={() => handleStatusUpdate('rejected')}
                    disabled={updateStatusMutation.isPending}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircleIcon className="h-4 w-4 mr-2" />
                    Reject
                  </button>

                  <button
                    onClick={() => handleStatusUpdate('needs_changes')}
                    disabled={updateStatusMutation.isPending}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                  >
                    <PencilIcon className="h-4 w-4 mr-2" />
                    Needs Changes
                  </button>

                  <button
                    onClick={handleFlag}
                    disabled={flagMutation.isPending}
                    className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    <FlagIcon className="h-4 w-4 mr-2" />
                    Flag
                  </button>
                </div>

                {/* Flag Info */}
                {item.is_flagged && item.flag_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-red-900 flex items-center">
                      <FlagIcon className="h-4 w-4 mr-2" />
                      Flagged Item
                    </h4>
                    <p className="text-sm text-red-700 mt-1">
                      Reason: {item.flag_reason}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'metadata' && (
              <motion.div
                key="metadata"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MetadataEditor
                  imageId={item.image_filename}
                  onSave={() => {
                    queryClient.invalidateQueries({
                      queryKey: ['review-item', itemId],
                    });
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'comments' && (
              <motion.div
                key="comments"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <CommentsSystem
                  itemId={itemId}
                  itemType="curation_item"
                  showInternal={true}
                />
              </motion.div>
            )}

            {activeTab === 'duplicates' && (
              <motion.div
                key="duplicates"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {item.duplicateItems && item.duplicateItems.length > 0 ? (
                  <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-900">
                      Potential Duplicates
                    </h4>
                    {item.duplicateItems.map((duplicate) => (
                      <div
                        key={duplicate.id}
                        className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                      >
                        <div>
                          <h5 className="font-medium text-gray-900">
                            {duplicate.title}
                          </h5>
                          <p className="text-sm text-gray-600">
                            ID: {duplicate.imageId}
                          </p>
                          <p className="text-sm text-gray-500">
                            Similarity: {Math.round(duplicate.similarity * 100)}
                            %
                          </p>
                        </div>
                        <button
                          onClick={() => duplicateMutation.mutate(duplicate.id)}
                          className="px-3 py-1 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700"
                        >
                          Mark as Duplicate
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <ArrowsRightLeftIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>No potential duplicates found.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Image Modal */}
      {showImageModal && (imageUrl || thumbnailUrl) && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setShowImageModal(false)}
        >
          <div
            className="relative max-w-4xl max-h-full p-4 w-full"
            onClick={(e: any) => e.stopPropagation()}
          >
            <img
              src={imageUrl || thumbnailUrl || ''}
              alt={safeTitle}
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              loading="eager"
            />
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewWorkflow;
