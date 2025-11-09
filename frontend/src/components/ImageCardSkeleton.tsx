
import { Skeleton } from '@/components/design-system';

export function ImageGridCardSkeleton() {
  return (
    <div className="group">
      <div className="border border-gray-200 rounded-lg">
        <div className="aspect-video bg-gray-200 rounded-t-lg" />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/4" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImageListCardSkeleton() {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start space-x-4">
        <Skeleton className="w-20 h-20 rounded-lg" />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-6 w-1/5" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex items-center space-x-6 pt-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
