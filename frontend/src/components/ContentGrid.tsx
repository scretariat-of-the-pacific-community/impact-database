'use client';

import React from 'react';
import { ContentItem } from '@/lib/types';
import { Play, MapPin, Calendar } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ContentGridProps {
  items: ContentItem[];
  loading?: boolean;
  onItemClick?: (item: ContentItem) => void;
}

export default function ContentGrid({ items, loading, onItemClick }: ContentGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-gray-200 dark:bg-gray-700 aspect-video rounded-lg mb-3" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">No content found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <ContentCard key={item.id} item={item} onClick={onItemClick} />
      ))}
    </div>
  );
}

interface ContentCardProps {
  item: ContentItem;
  onClick?: (item: ContentItem) => void;
}

function ContentCard({ item, onClick }: ContentCardProps) {
  const router = useRouter();
  const isVideo = item.content_type === 'video';

  const handleClick = () => {
    if (isVideo && onClick) {
      // Videos open in modal
      onClick(item);
    } else if (!isVideo) {
      // Images navigate to detail page
      router.push(`/images/${item.id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer"
    >
      {/* Thumbnail/Preview */}
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-900 overflow-hidden">
        {isVideo ? (
          <>
            <Image
              src={item.thumbnail_url}
              alt={item.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              unoptimized
            />
            {/* Play Button Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <div 
                className="
                  relative
                  w-16 h-16 
                  rounded-full 
                  bg-gradient-to-br from-white to-white/80
                  backdrop-blur-sm
                  flex items-center justify-center 
                  shadow-[0_8px_32px_rgba(0,0,0,0.12)]
                  ring-2 ring-white/20
                  group-hover:scale-110 
                  group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.16)]
                  transition-all duration-300 ease-out
                "
                aria-label="Play video"
              >
                <Play 
                  className="w-8 h-8 text-pacific-600 ml-0.5 drop-shadow-sm" 
                  fill="currentColor" 
                  aria-hidden="true"
                />
                
                {/* Pulse effect ring */}
                <span 
                  className="
                    absolute inset-0 
                    rounded-full 
                    bg-white/40 
                    animate-ping 
                    group-hover:animate-none
                  " 
                  aria-hidden="true" 
                />
              </div>
            </div>
            {/* Duration Badge */}
            {item.duration && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs font-medium">
                {formatDuration(item.duration)}
              </div>
            )}
            {/* Video Badge */}
            <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
              Video
            </div>
          </>
        ) : (
          <Image
            src={item.thumbnail_url}
            alt={item.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        )}
      </div>

      {/* Content Info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-pacific-600 transition-colors">
          {item.title}
        </h3>

        {item.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Metadata Row */}
        <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
          {/* Hazard Type Badge */}
          <span className="inline-flex items-center px-2 py-1 rounded-full bg-pacific-100 dark:bg-pacific-900 text-pacific-700 dark:text-pacific-300 font-medium">
            {formatHazardType(item.hazard_type)}
          </span>

          {/* Location */}
          {(item.location || item.country) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {item.location || item.country}
            </span>
          )}
        </div>

        {/* Date */}
        {(item.captured_date || item.upload_date) && (
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            {formatDate(item.captured_date || item.upload_date)}
          </div>
        )}

        {/* Video Resolution Badge */}
        {isVideo && item.width && item.height && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {item.width}×{item.height}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Functions
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatHazardType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}
