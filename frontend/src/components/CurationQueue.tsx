'use client';

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  memo,
  useRef,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { backendFetch } from '@/lib/auth-utils';
import { getApiUrl } from '@/lib/config';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  PencilIcon,
  FlagIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  ArrowsRightLeftIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';
import ErrorBanner from './ErrorBanner';
import { sanitizeText } from '@/lib/sanitize';

export interface CurationItem {
  id: string;
  content_type?: string; // 'image' or 'video'
  content_id?: string;
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
  is_flagged: boolean;
  flag_reason?: string;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string;
  comments_count: number;
  actions_count: number;
  image_metadata?: {
    id: string;
    hazard_type?: string;
    datetime?: string;
    latitude?: number;
    longitude?: number;
    content_type?: string; // For video metadata
    duration?: number;
    poster_url?: string;
    title?: string;
    [key: string]: any;
  };
  metadata?: {
    hazardType?: string;
    [key: string]: any;
  };
  // Legacy fields for backwards compatibility
  imageId?: string;
  title?: string;
  description?: string;
  submittedAt?: string;
  lastModified?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
}

interface CurationQueueProps {
  onItemSelect?: (item: CurationItem) => void;
  selectedItemId?: string;
}

// ============ PERFORMANCE: Move URL builders outside component ============
// These pure functions don't depend on component state, avoiding recreation on every render

const buildAssetUrl = (
  path?: string | null,
  fallbackFilename?: string | null
): string | undefined => {
  if (!path && !fallbackFilename) return undefined;

  let candidate = path;
  if (path && !path.startsWith('http')) {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    if (!cleanPath || !cleanPath.trim()) {
      if (!fallbackFilename) return undefined;
      candidate = `/upload/images/${encodeURIComponent(fallbackFilename)}`;
    } else if (cleanPath.startsWith('images/')) {
      candidate = `/upload/${cleanPath}`;
    } else if (cleanPath.startsWith('upload/images/')) {
      candidate = `/${cleanPath}`;
    } else {
      candidate = `/upload/images/${cleanPath}`;
    }
  }

  if (!candidate && fallbackFilename) {
    candidate = `/upload/images/${encodeURIComponent(fallbackFilename)}`;
  }

  if (!candidate || !candidate.trim()) return undefined;
  if (candidate.startsWith('http')) return candidate;

  return getApiUrl(candidate);
};

const buildThumbnailUrl = (
  meta: any,
  fallbackFilename?: string | null
): string | undefined => {
  if (!meta && !fallbackFilename) return undefined;

  const thumbnailPath = meta?.thumbnail_url || meta?.thumbnailUrl;
  if (thumbnailPath?.trim()) {
    return buildAssetUrl(thumbnailPath, fallbackFilename);
  }

  if (fallbackFilename?.trim()) {
    return buildAssetUrl(
      `/upload/images/${encodeURIComponent(fallbackFilename)}/thumbnail`
    );
  }

  const resourcePath = meta?.resource_locator || meta?.resourceLocator;
  if (resourcePath?.trim()) {
    return buildAssetUrl(resourcePath);
  }

  return undefined;
};

// Normalize a single item - extracted for clarity
const normalizeItem = (item: any): CurationItem => {
  const meta = item.image_metadata || item.imageMetadata || {};
  const filename = (meta as any).filename || item.image_filename;
  const existingMetadata =
    item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};

  // Handle both images and videos
  const contentType = item.content_type || 'image';
  const isVideo = contentType === 'video';

  const thumbnailCandidate =
    (meta as any).thumbnail_url ||
    (meta as any).thumbnailUrl ||
    (meta as any).resource_locator ||
    meta.resourceLocator ||
    item.thumbnailUrl ||
    item.thumbnail_url;

  // For videos, use the video thumbnail path directly (already includes /api/video/thumbnail/)
  let thumbnailUrl: string | undefined;
  if (isVideo) {
    if (thumbnailCandidate) {
      // If it already starts with /api or http, use as-is
      if (
        thumbnailCandidate.startsWith('/api') ||
        thumbnailCandidate.startsWith('http')
      ) {
        thumbnailUrl = thumbnailCandidate.startsWith('http')
          ? thumbnailCandidate
          : getApiUrl(thumbnailCandidate);
      } else {
        // Otherwise assume it's a video ID and construct the thumbnail URL
        const videoId = item.content_id || item.imageId || meta.id;
        thumbnailUrl = videoId
          ? getApiUrl(`/api/video/thumbnail/${videoId}`)
          : undefined;
      }
    } else {
      // No thumbnail candidate, try to construct from video ID
      const videoId = item.content_id || item.imageId || meta.id;
      thumbnailUrl = videoId
        ? getApiUrl(`/api/video/thumbnail/${videoId}`)
        : undefined;
    }
  } else {
    // Images use the existing logic
    thumbnailUrl =
      thumbnailCandidate || filename
        ? buildThumbnailUrl({ thumbnail_url: thumbnailCandidate }, filename)
        : undefined;
  }

  const imageCandidate =
    (meta as any).resource_locator ||
    meta.resourceLocator ||
    meta.image_url ||
    meta.imageUrl ||
    item.image_url ||
    item.imageUrl ||
    (meta as any).thumbnail_url ||
    (meta as any).thumbnailUrl;

  // For videos, use the video resource locator directly
  let imageUrl: string | undefined;
  if (isVideo) {
    if (imageCandidate) {
      // If it already starts with /api or http, use as-is
      if (
        imageCandidate.startsWith('/api') ||
        imageCandidate.startsWith('http')
      ) {
        imageUrl = imageCandidate.startsWith('http')
          ? imageCandidate
          : getApiUrl(imageCandidate);
      } else {
        // Otherwise construct video stream URL
        const videoId = item.content_id || item.imageId || meta.id;
        imageUrl = videoId
          ? getApiUrl(`/api/video/stream/${videoId}`)
          : undefined;
      }
    } else {
      const videoId = item.content_id || item.imageId || meta.id;
      imageUrl = videoId
        ? getApiUrl(`/api/video/stream/${videoId}`)
        : undefined;
    }
  } else {
    // Images use the existing logic
    // Always try to build URL if we have either imageCandidate or filename
    if (imageCandidate || filename) {
      imageUrl = buildAssetUrl(imageCandidate, filename);
    }
    // Debug logging for missing images
    if (!imageUrl && filename) {
      console.warn('[CurationQueue] Image URL not built:', {
        id: item.id,
        filename,
        imageCandidate,
        meta: Object.keys(meta),
      });
    }
  }

  return {
    ...item,
    content_type: contentType,
    thumbnailUrl,
    imageUrl,
    imageId:
      item.imageId || item.image_id || item.content_id || meta.id || filename,
    title:
      item.title ||
      (meta as any).title ||
      (meta as any).filename ||
      item.image_filename ||
      'Untitled',
    description:
      item.description ||
      (meta as any).abstract ||
      meta.description ||
      meta.purpose ||
      'No description',
    metadata: {
      ...existingMetadata,
      hazardType:
        existingMetadata.hazardType ||
        (meta as any).hazard_type ||
        meta.hazardType ||
        'Unspecified',
    },
  };
};

// Status icon helper - moved outside component
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return <ClockIcon className="h-4 w-4 text-yellow-500" />;
    case 'under_review':
      return <EyeIcon className="h-4 w-4 text-blue-500" />;
    case 'approved':
      return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
    case 'rejected':
      return <XCircleIcon className="h-4 w-4 text-red-500" />;
    case 'needs_changes':
      return <PencilIcon className="h-4 w-4 text-orange-500" />;
    case 'duplicate':
      return <ArrowsRightLeftIcon className="h-4 w-4 text-purple-500" />;
    default:
      return <ClockIcon className="h-4 w-4 text-gray-500" />;
  }
};

// Priority color helper - moved outside component
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

// ============ PERFORMANCE: Memoized Queue Item Component ============
interface QueueItemProps {
  item: CurationItem;
  isSelected: boolean;
  onSelect?: (item: CurationItem) => void;
  onQuickAction: (itemId: string, action: string) => void;
}

const CurationQueueItem = memo(function CurationQueueItem({
  item,
  isSelected,
  onSelect,
  onQuickAction,
}: QueueItemProps) {
  const handleClick = useCallback(() => onSelect?.(item), [onSelect, item]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): any => {
      if ((event.key === 'Enter' || event.key === ' ') && onSelect) {
        event.preventDefault();
        onSelect(item);
      }
    },
    [onSelect, item]
  );

  const handleApprove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickAction(item.id, 'approve');
    },
    [onQuickAction, item.id]
  );

  const handleReject = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickAction(item.id, 'reject');
    },
    [onQuickAction, item.id]
  );

  const handleFlag = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickAction(item.id, 'flag');
    },
    [onQuickAction, item.id]
  );

  return (
    <div
      className={`border-b border-gray-200 p-6 hover:bg-gray-50 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 border-blue-200' : ''
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Open submission ${sanitizeText(item.image_metadata?.title || item.image_filename)}`}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start space-x-4">
        {/* Thumbnail with fast native lazy loading - with play button for videos */}
        <div className="flex-shrink-0 h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden relative">
          {item.thumbnailUrl || item.imageUrl ? (
            <>
              <img
                src={item.thumbnailUrl || item.imageUrl || ''}
                alt={
                  item.title ||
                  item.image_metadata?.title ||
                  'Submission thumbnail'
                }
                className="h-full w-full object-cover"
                width={64}
                height={64}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const img = e.currentTarget;
                  console.error('[CurationQueue] Image load failed:', {
                    src: img.src,
                    itemId: item.id,
                    filename: item.image_filename,
                    thumbnailUrl: item.thumbnailUrl,
                    imageUrl: item.imageUrl,
                  });
                }}
              />
              {/* Play button for videos */}
              {item.content_type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white/90">
                    <svg
                      className="h-5 w-5 text-black ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                </div>
              )}
            </>
          ) : (
            <span className="text-gray-400 text-xs text-center px-2">
              {item.content_type === 'video' ? '🎬' : 'No image'}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-gray-900 truncate">
                  {sanitizeText(
                    item.title || item.image_metadata?.title || 'Untitled'
                  )}
                </h3>
                {item.content_type === 'video' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Video
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                {sanitizeText(
                  item.description ||
                    item.image_metadata?.abstract ||
                    'No description'
                )}
              </p>
              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 flex-wrap">
                <span>File: {sanitizeText(item.image_filename)}</span>
                {item.image_metadata?.duration && (
                  <span>⏱️ {Math.round(item.image_metadata.duration)}s</span>
                )}
                {(item.metadata?.hazardType ||
                  item.image_metadata?.hazard_type) && (
                  <span>
                    Hazard:{' '}
                    {sanitizeText(
                      item.metadata?.hazardType ||
                        item.image_metadata?.hazard_type ||
                        'Unknown'
                    )}
                  </span>
                )}
                {item.location && (
                  <span>📍 {sanitizeText(item.location.address)}</span>
                )}
                {item.submitted_by && (
                  <span>👤 {sanitizeText(item.submitted_by)}</span>
                )}
              </div>
            </div>

            {/* Status and Actions */}
            <div className="flex flex-col items-end space-y-2">
              <div className="flex items-center space-x-2">
                {item.is_flagged && (
                  <FlagIcon
                    className="h-4 w-4 text-red-500"
                    aria-label={sanitizeText(item.flag_reason || 'Flagged')}
                  />
                )}
                {item.comments_count > 0 && (
                  <div className="flex items-center text-gray-500">
                    <ChatBubbleLeftIcon className="h-4 w-4 mr-1" />
                    <span className="text-xs">{item.comments_count}</span>
                  </div>
                )}
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(item.priority)}`}
                >
                  {item.priority}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {getStatusIcon(item.status)}
                <span className="text-sm text-gray-600 capitalize">
                  {item.status.replace('_', ' ')}
                </span>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={handleApprove}
                  className="p-1 text-green-600 hover:bg-green-100 rounded"
                  title="Approve"
                  aria-label="Approve submission"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={handleReject}
                  className="p-1 text-red-600 hover:bg-red-100 rounded"
                  title="Reject"
                  aria-label="Reject submission"
                >
                  <XCircleIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={handleFlag}
                  className="p-1 text-orange-600 hover:bg-orange-100 rounded"
                  title="Flag"
                  aria-label="Flag submission for review"
                >
                  <FlagIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="text-xs text-gray-500 text-right">
                <div>
                  Submitted: {new Date(item.created_at).toLocaleDateString()}
                </div>
                {item.assigned_to && <div>Assigned: {item.assigned_to}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const CurationQueue: React.FC<CurationQueueProps> = ({
  onItemSelect,
  selectedItemId,
}) => {
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assignedTo: '',
    flagged: false,
    search: '',
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('submittedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  const queryClient = useQueryClient();

  // PERFORMANCE: Ref for virtualization container
  const parentRef = useRef<HTMLDivElement>(null);

  // Debounce search to reduce API calls while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Memoized normalize function to avoid recreation on every render
  const normalizeItems = useMemo(
    () =>
      (payload: any): CurationItem[] => {
        const rawItems = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        return rawItems.map(normalizeItem);
      },
    []
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'curation-queue',
      { ...filters, search: debouncedSearch },
      sortBy,
      sortOrder,
      currentPage,
      pageSize,
    ],
    staleTime: 30000, // Cache for 30 seconds to reduce unnecessary refetches
    gcTime: 60000, // Keep in cache for 1 minute (formerly cacheTime)
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries({
        ...filters,
        search: debouncedSearch, // Use debounced search
        sort_by: sortBy,
        sort_order: sortOrder,
        page: currentPage.toString(),
        page_size: pageSize.toString(),
      }).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      const response = await backendFetch(
        `/api/admin/curation/queue?${params}`
      );
      if (!response.ok) throw new Error('Failed to fetch curation queue');
      const payload = await response.json();

      // Normalize items so thumbnails/images render correctly
      const items = normalizeItems(payload);

      return Array.isArray(payload)
        ? {
            items,
            total: items.length,
            page: currentPage,
            page_size: pageSize,
            total_pages: 1,
          }
        : { ...payload, items };
    },
  });

  // Prefetch next page for instant navigation
  useEffect(() => {
    if (data && currentPage < Math.ceil((data as any).total / pageSize)) {
      (queryClient as any).prefetchQuery({
        queryKey: [
          'curation-queue',
          { ...filters, search: debouncedSearch },
          sortBy,
          sortOrder,
          currentPage + 1,
          pageSize,
        ],
        queryFn: async () => {
          const params = new URLSearchParams();
          Object.entries({
            ...filters,
            search: debouncedSearch,
            sort_by: sortBy,
            sort_order: sortOrder,
            page: (currentPage + 1).toString(),
            page_size: pageSize.toString(),
          }).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              params.append(key, value.toString());
            }
          });
          const response = await backendFetch(
            `/api/admin/curation/queue?${params}`
          );
          if (!response.ok) throw new Error('Failed to fetch curation queue');
          const payload = await response.json();
          // Apply same normalization to prefetched data
          const items = normalizeItems(payload);
          return Array.isArray(payload)
            ? {
                items,
                total: items.length,
                page: currentPage + 1,
                page_size: pageSize,
                total_pages: 1,
              }
            : { ...payload, items };
        },
        staleTime: 30000,
      });
    }
  }, [
    data,
    currentPage,
    pageSize,
    filters,
    debouncedSearch,
    sortBy,
    sortOrder,
    queryClient,
  ]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      itemId,
      status,
      notes,
    }: {
      itemId: string;
      status: string;
      notes?: string;
    }) => {
      const response = await backendFetch(
        `/api/admin/curation/queue/${itemId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ status, review_notes: notes }),
        }
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        console.error('Status update failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(
          errorData.detail ||
            errorData.message ||
            `Failed to update status (${response.status})`
        );
      }
      return response.json();
    },
    // Optimistic update: UI updates immediately
    onMutate: async ({ itemId, status }: { itemId: any; status: any }) => {
      await (queryClient as any).cancelQueries({
        queryKey: ['curation-queue'],
      });
      const previousData = (queryClient as any).getQueryData([
        'curation-queue',
        { ...filters, search: debouncedSearch },
        sortBy,
        sortOrder,
        currentPage,
        pageSize,
      ]);

      (queryClient as any).setQueryData(
        [
          'curation-queue',
          { ...filters, search: debouncedSearch },
          sortBy,
          sortOrder,
          currentPage,
          pageSize,
        ],
        (old: any) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((item: CurationItem) =>
              item.id === itemId ? { ...item, status: status as any } : item
            ),
          };
        }
      );
      return { previousData };
    },
    onError: (_: any, __: any, context: any) => {
      if (context?.previousData) {
        (queryClient as any).setQueryData(
          [
            'curation-queue',
            { ...filters, search: debouncedSearch },
            sortBy,
            sortOrder,
            currentPage,
            pageSize,
          ],
          context.previousData
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['curation-dashboard'] });
    },
  });

  const flagMutation = useMutation({
    mutationFn: async ({
      itemId,
      reason,
    }: {
      itemId: string;
      reason: string;
    }) => {
      const response = await backendFetch(
        `/api/admin/curation/queue/${itemId}/flag`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        console.error('Flag mutation failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(
          errorData.detail ||
            errorData.message ||
            `Failed to flag item (${response.status})`
        );
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curation-queue'] });
    },
  });

  const handleQuickAction = useCallback(
    (itemId: string, action: string) => {
      switch (action) {
        case 'approve':
          updateStatusMutation.mutate({ itemId, status: 'approved' });
          break;
        case 'reject':
          updateStatusMutation.mutate({ itemId, status: 'rejected' });
          break;
        case 'flag':
          flagMutation.mutate({ itemId, reason: 'Requires attention' });
          break;
      }
    },
    [updateStatusMutation, flagMutation]
  );

  // PERFORMANCE: Virtualizer for efficient rendering of long lists
  const items = (data as any)?.items || [];

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, // Estimated row height in pixels
    overscan: 5, // Render 5 extra items above/below viewport
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'We were unable to contact the admin API. This might be a temporary issue.';
    return (
      <ErrorBanner
        title="Error loading curation queue"
        message={message}
        tone="error"
        onRetry={() => refetch()}
        retryLabel="Retry"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <h2 className="text-xl font-semibold text-gray-900">
            Curation Queue
          </h2>

          {/* Search */}
          <div className="relative">
            <label htmlFor="curation-search" className="sr-only">
              Search curation items
            </label>
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              id="curation-search"
              name="search"
              type="text"
              autoComplete="off"
              placeholder="Search items..."
              value={filters.search}
              onChange={(
                e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
              ) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="filter-status" className="sr-only">
              Filter by status
            </label>
            <select
              id="filter-status"
              name="status"
              autoComplete="off"
              value={filters.status}
              onChange={(
                e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
              ) => setFilters({ ...filters, status: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="needs_changes">Needs Changes</option>
              <option value="duplicate">Duplicate</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-priority" className="sr-only">
              Filter by priority
            </label>
            <select
              id="filter-priority"
              name="priority"
              autoComplete="off"
              value={filters.priority}
              onChange={(
                e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
              ) => setFilters({ ...filters, priority: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-assigned" className="sr-only">
              Filter by assigned curator
            </label>
            <select
              id="filter-assigned"
              name="assignedTo"
              autoComplete="off"
              value={filters.assignedTo}
              onChange={(
                e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
              ) => setFilters({ ...filters, assignedTo: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Curators</option>
              <option value="me">Assigned to Me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>

          <label
            htmlFor="filter-flagged"
            className="flex items-center space-x-2"
          >
            <input
              id="filter-flagged"
              name="flagged"
              type="checkbox"
              checked={filters.flagged}
              onChange={(
                e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
              ) =>
                setFilters({
                  ...filters,
                  flagged: (e.target as HTMLInputElement).checked,
                })
              }
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Flagged only</span>
          </label>
        </div>
      </div>

      {/* Queue Items */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">
              {(data as any)?.total || 0} items total
            </span>
            <div className="flex items-center space-x-2">
              <label htmlFor="sort-by" className="sr-only">
                Sort by
              </label>
              <select
                id="sort-by"
                name="sortBy"
                autoComplete="off"
                value={sortBy}
                onChange={(
                  e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                ) => setSortBy(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 text-gray-900"
              >
                <option value="submittedAt">Submitted Date</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                }
                className="text-sm text-blue-600 hover:text-blue-800"
                aria-label={
                  sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'
                }
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {/* PERFORMANCE: Virtualized list for efficient rendering */}

        {items.length === 0 && (
          <div className="text-center py-12">
            <QueueListIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              The queue is empty
            </h3>
            <p className="text-gray-500">
              There are no submissions to review at this time.
            </p>
          </div>
        )}
        {items.length > 0 && (
          <div
            ref={parentRef}
            className="h-[600px] overflow-auto"
            style={{ contain: 'strict' }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = items[virtualRow.index];
                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <CurationQueueItem
                      item={item}
                      isSelected={selectedItemId === item.id}
                      onSelect={onItemSelect}
                      onQuickAction={handleQuickAction}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {(data as any)?.total > pageSize && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, (data as any).total)} of{' '}
                {(data as any).total} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of{' '}
                  {Math.ceil((data as any).total / pageSize)}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage(
                      Math.min(
                        Math.ceil((data as any).total / pageSize),
                        currentPage + 1
                      )
                    )
                  }
                  disabled={
                    currentPage === Math.ceil((data as any).total / pageSize)
                  }
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CurationQueue;
