'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Eye, 
  EyeOff, 
  Share2, 
  Settings, 
  Trash2, 
  Plus,
  X,
  Calendar,
  User,
  Globe,
  Lock
} from 'lucide-react';
import { Card, Button } from '@/components/design-system';
import { imageApi } from '@/lib/api';
import type { SharedFolder } from '@/lib/types';

interface FolderDetailProps {
  folderId: string;
}

export default function FolderDetail({ folderId }: FolderDetailProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch folder details
  const { data: folder, isLoading, error } = useQuery<SharedFolder, Error>({
    queryKey: ['shared-folder', folderId],
    queryFn: () => imageApi.sharedFolders.get(folderId),
    enabled: !!folderId,
  });

  // Watch mutation
  const watchMutation = useMutation({
    mutationFn: () => {
      return folder?.is_watching 
        ? imageApi.sharedFolders.unwatch(folderId)
        : imageApi.sharedFolders.watch(folderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-folder', folderId] });
      queryClient.invalidateQueries({ queryKey: ['shared-folders'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await imageApi.sharedFolders.delete(folderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-folders'] });
      router.push('/profile?tab=collaboration');
    },
  });

  const handleDelete = () => {
    if (showDeleteConfirm) {
      deleteMutation.mutate();
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 5000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-deep-900 via-pacific-900 to-deep-900 p-6">
        <div className="max-w-5xl mx-auto">
          <Card className="bg-white/5 text-white">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-white/10 rounded w-1/3"></div>
              <div className="h-4 bg-white/10 rounded w-2/3"></div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !folder) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-deep-900 via-pacific-900 to-deep-900 p-6">
        <div className="max-w-5xl mx-auto">
          <Card className="bg-white/5 text-white">
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">Failed to load folder</p>
              <Button onClick={() => router.back()}>Go Back</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-deep-900 via-pacific-900 to-deep-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-4 text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Collaboration
            </Button>
            <h1 className="text-3xl font-bold text-white mb-2">{folder.name}</h1>
            {folder.description && (
              <p className="text-white/70 text-lg">{folder.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant={folder.is_watching ? 'secondary' : 'ghost'}
              onClick={() => watchMutation.mutate()}
              disabled={watchMutation.isPending}
            >
              {folder.is_watching ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Watching
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Watch
                </>
              )}
            </Button>
            <Button variant="ghost">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Metadata */}
        <Card className="bg-white/5 text-white">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <User className="h-5 w-5 text-pacific-300" />
              </div>
              <div>
                <p className="text-xs text-white/60">Owner</p>
                <p className="text-sm font-semibold">{folder.owner_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                {folder.is_public ? (
                  <Globe className="h-5 w-5 text-emerald-300" />
                ) : (
                  <Lock className="h-5 w-5 text-white/60" />
                )}
              </div>
              <div>
                <p className="text-xs text-white/60">Visibility</p>
                <p className="text-sm font-semibold">{folder.is_public ? 'Public' : 'Private'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <Share2 className="h-5 w-5 text-pacific-300" />
              </div>
              <div>
                <p className="text-xs text-white/60">Items</p>
                <p className="text-sm font-semibold">{folder.item_count}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <Calendar className="h-5 w-5 text-pacific-300" />
              </div>
              <div>
                <p className="text-xs text-white/60">Created</p>
                <p className="text-sm font-semibold">{formatDate(folder.created_at)}</p>
              </div>
            </div>
          </div>

          {(folder.hazard_filter || folder.region_filter) && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-white/60 mb-2">Filters</p>
              <div className="flex flex-wrap gap-2">
                {folder.hazard_filter && (
                  <span className="px-3 py-1 bg-coral-400/20 text-coral-100 rounded-full text-xs font-medium">
                    Hazard: {folder.hazard_filter}
                  </span>
                )}
                {folder.region_filter && (
                  <span className="px-3 py-1 bg-pacific-400/20 text-pacific-100 rounded-full text-xs font-medium">
                    Region: {folder.region_filter}
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Items Section */}
        <Card className="bg-white/5 text-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Folder Items</h2>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Items
            </Button>
          </div>

          {folder.item_count === 0 ? (
            <div className="text-center py-12">
              <Share2 className="h-12 w-12 mx-auto text-white/20 mb-4" />
              <p className="text-white/60 mb-2">No items in this folder yet</p>
              <p className="text-sm text-white/40 mb-4">
                Add images from your uploads to organize them
              </p>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add First Item
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 text-white/60">
              <p className="text-sm">
                {folder.item_count} {folder.item_count === 1 ? 'item' : 'items'} in this folder
              </p>
              <p className="text-xs text-white/40 mt-2">
                Item management UI will be available once folder_items table is created
              </p>
            </div>
          )}
        </Card>

        {/* Watchers */}
        {(folder.watcher_count && folder.watcher_count > 0) && (
          <Card className="bg-white/5 text-white">
            <h2 className="text-xl font-semibold mb-4">
              Watchers ({folder.watcher_count})
            </h2>
            <p className="text-sm text-white/60">
              {folder.watcher_count} {folder.watcher_count === 1 ? 'person is' : 'people are'} watching this folder
            </p>
          </Card>
        )}

        {/* Danger Zone */}
        <Card className="bg-rose-900/10 border-rose-500/20 text-white">
          <h3 className="text-lg font-semibold text-rose-300 mb-2">Danger Zone</h3>
          <p className="text-sm text-white/70 mb-4">
            Deleting this folder will remove all items and cannot be undone.
          </p>
          <Button
            variant="ghost"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className={showDeleteConfirm ? 'bg-rose-500/20 border-rose-500' : ''}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {showDeleteConfirm ? 'Click again to confirm' : 'Delete Folder'}
          </Button>
        </Card>
      </div>
    </div>
  );
}
