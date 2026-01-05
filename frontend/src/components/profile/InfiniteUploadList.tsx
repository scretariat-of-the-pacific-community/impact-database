'use client';

import React, { useEffect, useRef, useCallback, ComponentType } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { MapPin, Loader2, CheckCircle, XCircle, Clock3 } from 'lucide-react';
import { Card, Button } from '@/components/design-system';
import { imageApi } from '@/lib/api';
import { HAZARD_TYPE_LABELS } from '@/lib/types';

const glassCard = 'rounded-3xl border border-white/10 bg-white/5 backdrop-blur shadow-xl';
const PAGE_SIZE = 20;

interface Upload {
  id: string;
  filename: string;
  title: string;
  hazard_type: string;
  location: string;
  uploaded_at: string;
  approval_status: string;
  views: number;
  latitude: number;
  longitude: number;
}

interface InfiniteUploadListProps {
  enabled: boolean;
  /** When false, the component is hidden and should pause any polling/fetching */
  isActive?: boolean;
}

export default function InfiniteUploadList({ enabled, isActive = true }: InfiniteUploadListProps) {
  const observerTarget = useRef<HTMLDivElement>(null);
  
  // Only fetch when enabled AND tab is active
  const shouldFetch = enabled && isActive;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['user-uploads-infinite'],
    queryFn: ({ pageParam = 1 }) =>
      imageApi.userUploads({ page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) {
        return undefined;
      }
      return allPages.length + 1;
    },
    enabled: shouldFetch,
    initialPageParam: 1,
  });

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const element = observerTarget.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.5,
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleObserver]);

  const uploads = data?.pages.flatMap((page) => page) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 text-white/70 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-pacific-300" />
        Fetching your uploads...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-coral-500/20 bg-coral-500/5 p-8 text-center">
        <p className="text-coral-200">Failed to load uploads</p>
        <p className="text-sm text-coral-200/70 mt-2">{(error as Error).message}</p>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-white/70">
        No uploads yet. Share your first impact image to unlock insights.
      </div>
    );
  }

  const UploadRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const upload = uploads[index];
    const statusConfig: Record<string, { label: string; className: string; Icon: ComponentType<{ className?: string }> }> = {
      approved: {
        label: 'Approved',
        className: 'bg-emerald-400/20 text-emerald-200',
        Icon: CheckCircle,
      },
      rejected: {
        label: 'Rejected',
        className: 'bg-coral-500/20 text-coral-200',
        Icon: XCircle,
      },
      pending: {
        label: 'Pending',
        className: 'bg-amber-400/20 text-amber-100',
        Icon: Clock3,
      },
    };
    const status = statusConfig[upload.approval_status] || statusConfig.pending;
    
    return (
      <div style={style} className="px-2">
        <Card
          className={`${glassCard} border-white/5 bg-gradient-to-br from-deep-900/40 to-deep-900/20 mb-4`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/60">
                {new Date(upload.uploaded_at).toLocaleString()}
              </p>
              <h4 className="mt-1 text-lg font-semibold text-white truncate">
                {upload.title || upload.filename}
              </h4>
              <p className="text-sm text-white/60 truncate">
                {HAZARD_TYPE_LABELS[upload.hazard_type] || upload.hazard_type}
                {upload.location ? ` • ${upload.location}` : ''}
              </p>
            </div>
            <span
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold inline-flex items-center gap-1 ${status.className}`}
              role="status"
              aria-label={`Status: ${status.label}`}
            >
              <status.Icon className="h-4 w-4" aria-hidden />
              <span>{status.label}</span>
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-white/60">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <MapPin className="h-4 w-4 text-pacific-300 flex-shrink-0" />
              <span className="truncate">{upload.location || 'Location pending'}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/10 text-white hover:bg-white/20 min-w-[44px] min-h-[44px] ml-2 flex-shrink-0"
              onClick={() => window.open(`/images/${upload.id}`, '_blank')}
            >
              View
            </Button>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Mobile: Simple list with infinite scroll */}
      <div className="md:hidden">
        {uploads.map((upload) => (
          <UploadRow key={upload.id} index={uploads.indexOf(upload)} style={{}} />
        ))}
        
        {/* Infinite scroll trigger */}
        <div ref={observerTarget} className="py-4 text-center">
          {isFetchingNextPage && (
            <div className="flex items-center justify-center gap-2 text-white/60">
              <Loader2 className="h-4 w-4 animate-spin text-pacific-300" />
              Loading more...
            </div>
          )}
          {!hasNextPage && uploads.length > 0 && (
            <p className="text-sm text-white/40">No more uploads to show</p>
          )}
        </div>
      </div>

      {/* Desktop: Virtualized grid */}
      <div className="hidden md:block h-[600px]">
        <AutoSizer>
          {({ height, width }) => {
            const itemSize = (index: number) => {
              const upload = uploads[index];
              const titleLength = (upload.title || upload.filename || '').length;
              const locationLength = (upload.location || '').length;
              const base = 140;
              const titleRows = Math.max(1, Math.ceil(titleLength / 32));
              const locationRows = Math.max(1, Math.ceil(locationLength / 40));
              return Math.min(320, base + titleRows * 18 + locationRows * 16);
            };

            return (
              <List
                height={height}
                itemCount={uploads.length}
                itemSize={itemSize}
                width={width}
                overscanCount={5}
              >
                {UploadRow}
              </List>
            );
          }}
        </AutoSizer>
      </div>
    </div>
  );
}
