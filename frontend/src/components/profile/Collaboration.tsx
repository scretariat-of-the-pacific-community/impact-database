'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity,
  Bell,
  Bookmark,
  ChevronDown,
  FolderOpen,
  Globe,
  MapIcon,
  Search,
  Share2,
  ShieldCheck,
  Target,
  Trash,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Card, Button } from '@/components/design-system';
import { imageApi } from '@/lib/api';
import CreateFolderModal from './CreateFolderModal';
import type { 
  UserStats, 
  UserUpload, 
  UserActivityEvent, 
  HazardType, 
  PaginatedResponse,
  SharedFolder,
  CreateSharedFolderRequest,
} from '@/lib/types';
import { HAZARD_TYPE_LABELS } from '@/lib/types';

type Role = 'admin' | 'editor' | 'viewer';

interface Followable {
  id: string;
  label: string;
  type: 'hazard' | 'region';
  context: string;
  severity: 'low' | 'medium' | 'high';
  followers: number;
}

interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
  members: number;
  channels: number;
  permissions: string[];
  description: string;
}

interface Mentionable {
  id: string;
  name: string;
  handle: string;
  role: string;
}

interface ActivityEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  icon: typeof Activity;
}

const rolePalette: Record<Role, string> = {
  admin: 'bg-pacific-400/20 text-pacific-100',
  editor: 'bg-coral-400/20 text-coral-100',
  viewer: 'bg-white/10 text-white/70',
};

interface CollaborationProps {
  uploads?: UserUpload[];
  stats?: UserStats | null;
}

const mapHazardLabel = (hazard: HazardType | string | undefined) =>
  hazard ? HAZARD_TYPE_LABELS[hazard as HazardType] || hazard : 'Unspecified';

const relativeTimeFrom = (isoDate?: string) => {
  if (!isoDate) return 'Recently';
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMinutes = Math.max(1, Math.round((now - then) / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

export default function Collaboration({ uploads = [], stats }: CollaborationProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  
  // CRITICAL: All useState hooks must be declared at the top before any useMemo/useEffect
  // to prevent temporal dead zone issues with Next.js 16 Turbopack
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState<boolean>(false);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [followPending, setFollowPending] = useState<Record<string, boolean>>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sharedFoldersError, setSharedFoldersError] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | undefined>(undefined);
  const [inviteForm, setInviteForm] = useState<{ email: string; role: Role; workspaceId: string }>({
    email: '',
    role: 'editor',
    workspaceId: '',
  });
  
  // Fetch real shared folders data
  const { data: sharedFoldersData = [], isLoading: foldersLoading } = useQuery<SharedFolder[], Error>({
    queryKey: ['shared-folders'],
    queryFn: async () => {
      try {
        setSharedFoldersError(null);
        return await imageApi.sharedFolders.list();
      } catch (err: any) {
        // Graceful fallback: keep UI usable and surface a friendly message
        const message = err?.message || 'Unable to load shared folders';
        setSharedFoldersError(message);
        return [];
      }
    },
    staleTime: 30_000,
    meta: { errorMessage: 'shared-folders-optional' }, // Suppress noisy console logging for optional feature
  });

  // Watch/unwatch folder mutation
  const watchMutation = useMutation({
    mutationFn: ({ folderId, isWatching }: { folderId: string; isWatching: boolean }) => {
      return isWatching 
        ? imageApi.sharedFolders.unwatch(folderId)
        : imageApi.sharedFolders.watch(folderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-folders'] });
    },
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (data: CreateSharedFolderRequest) => imageApi.sharedFolders.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shared-folders'] });
      setIsCreateModalOpen(false);
      setCreateError(null);
      toast.success('Folder created successfully!', {
        description: `"${data.name}" is now available in your shared folders.`,
        duration: 4000,
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to create folder';
      setCreateError(errorMessage);
      toast.error('Failed to create folder', {
        description: errorMessage,
        duration: 5000,
      });
    },
  });

  // Delete folders mutation
  const deleteFoldersMutation = useMutation({
    mutationFn: async (folderIds: string[]) => {
      // Delete folders one by one
      await Promise.all(
        folderIds.map(id => imageApi.sharedFolders.delete(id))
      );
    },
    onSuccess: (_, folderIds) => {
      queryClient.invalidateQueries({ queryKey: ['shared-folders'] });
      setSelectedFolders(new Set());
      toast.success(
        `Successfully deleted ${folderIds.length} folder${folderIds.length > 1 ? 's' : ''}`,
        { duration: 3000 }
      );
    },
    onError: (error: any) => {
      toast.error('Failed to delete folders', {
        description: error?.response?.data?.detail || error?.message || 'An error occurred',
        duration: 5000,
      });
    },
  });

  const { data: activityData } = useQuery<PaginatedResponse<UserActivityEvent>, Error>({
    queryKey: ['collaboration-activity'],
    queryFn: () => imageApi.userActivity(),
    staleTime: 60_000,
  });

  const activityEvents = activityData?.events || [];

  const hazardAggregates = useMemo(() => {
    const counts = new Map<string, { count: number; sample?: UserUpload }>();
    uploads.forEach((upload) => {
      const key = upload.hazard_type || 'other';
      const current = counts.get(key) || { count: 0 };
      counts.set(key, { count: current.count + 1, sample: current.sample ?? upload });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4);
  }, [uploads]);

  const regionAggregates = useMemo(() => {
    const counts = new Map<string, { count: number; hazard?: HazardType }>();
    uploads.forEach((upload) => {
      const key = upload.location || upload.country || 'Unspecified region';
      const current = counts.get(key) || { count: 0 };
      counts.set(key, { count: current.count + 1, hazard: current.hazard ?? upload.hazard_type });
    });
    return Array.from(counts.entries())
      .filter(([, data]) => data.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4);
  }, [uploads]);

  const followableAreas: Followable[] = useMemo(() => {
    const hazardEntries = hazardAggregates.map(([key, data], index) => ({
      id: `haz-${key}`,
      label: mapHazardLabel(key as HazardType),
      type: 'hazard' as const,
      context: data.sample?.location || data.sample?.country || 'No location provided',
      severity: (index === 0 ? 'high' : index === 1 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      followers: data.count,
    }));
    const regionEntries = regionAggregates.map(([region, data], index) => ({
      id: `reg-${region}`,
      label: region,
      type: 'region' as const,
      context: mapHazardLabel(data.hazard),
      severity: (index === 0 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      followers: data.count,
    }));
    return [...hazardEntries, ...regionEntries].slice(0, 4);
  }, [hazardAggregates, regionAggregates]);

  const workspaceSummaries: WorkspaceSummary[] = useMemo(() => {
    const collection = [];
    if (stats) {
      collection.push({
        id: 'workspace-primary',
        name: stats.organization || 'Independent Workspace',
        role: 'admin' as Role,
        members: Math.max(1, stats.analytics?.uploads_this_month || 1),
        channels: Math.max(1, hazardAggregates.length),
        permissions: ['Upload & edit', 'Invite collaborators', 'Manage reviews'],
        description: 'Automatically generated from your organisation profile.',
      });
    }
    hazardAggregates.forEach(([hazardKey, data], index) => {
      collection.push({
        id: `workspace-${hazardKey}`,
        name: `${mapHazardLabel(hazardKey as HazardType)} ops`,
        role: index === 0 ? 'editor' : 'viewer',
        members: Math.max(1, data.count),
        channels: Math.max(1, regionAggregates.length),
        permissions: ['Share uploads', 'Track activity'],
        description: `Workspace focusing on ${mapHazardLabel(hazardKey as HazardType).toLowerCase()}.`,
      });
    });
    return collection.length > 0
      ? collection
      : [
          {
            id: 'workspace-fallback',
            name: 'Personal workspace',
            role: 'admin',
            members: 1,
            channels: 1,
            permissions: ['Upload & organise'],
            description: 'Start uploading to unlock collaboration metrics.',
          },
        ];
  }, [stats, hazardAggregates, regionAggregates.length]);

  // Get shared folders with loading/empty states, then apply filters
  const sharedFolders = useMemo(() => {
    if (foldersLoading) {
      return [{
        id: 'loading',
        name: 'Loading folders...',
        description: '',
        owner_id: stats?.name || 'You',
        is_public: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        item_count: 0,
        watch_count: 0,
      }];
    }
    
    if (!sharedFoldersData || sharedFoldersData.length === 0) {
      return [{
        id: 'folder-empty',
        name: 'No shared folders yet',
        description: 'Create a folder to organize and share your uploads',
        owner_id: stats?.name || 'You',
        is_public: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        item_count: 0,
        watch_count: 0,
      }];
    }
    
    return sharedFoldersData;
  }, [sharedFoldersData, foldersLoading, stats?.name]);

  // Apply search and visibility filters
  // IMPORTANT: Explicitly type-check searchQuery to avoid TDZ issues
  const filteredFolders = useMemo(() => {
    // Early return if sharedFolders is not ready
    if (!sharedFolders || sharedFolders.length === 0) {
      return sharedFolders || [];
    }
    
    let filtered = sharedFolders;

    // Apply search filter - defensive check for searchQuery initialization
    const normalizedQuery = typeof searchQuery === 'string' ? searchQuery.trim().toLowerCase() : '';
    if (normalizedQuery) {
      filtered = filtered.filter((folder) =>
        folder.name.toLowerCase().includes(normalizedQuery) ||
        folder.description?.toLowerCase().includes(normalizedQuery) ||
        folder.hazard_filter?.toLowerCase().includes(normalizedQuery) ||
        folder.region_filter?.toLowerCase().includes(normalizedQuery)
      );
    }

    // Apply visibility filter
    if (visibilityFilter && visibilityFilter !== 'all') {
      filtered = filtered.filter((folder) => {
        if (visibilityFilter === 'public') return folder.is_public;
        if (visibilityFilter === 'private') return !folder.is_public;
        return true;
      });
    }

    return filtered;
  }, [sharedFolders, searchQuery, visibilityFilter]);

  const mentionableTeammates: Mentionable[] = useMemo(() => {
    const reviewers = new Map<string, Mentionable>();
    activityEvents.forEach((event, index) => {
      if (event.reviewer) {
        const handle = event.reviewer.trim().toLowerCase().replace(/\s+/g, '.');
        reviewers.set(handle, {
          id: `${event.id}-${index}`,
          name: event.reviewer,
          handle,
          role: 'Reviewer',
        });
      }
    });
    if (!reviewers.size && stats?.organization) {
      reviewers.set('team', {
        id: 'team-default',
        name: `${stats.organization} team`,
        handle: stats.organization.toLowerCase().replace(/\s+/g, '.'),
        role: 'Organisation',
      });
    }
    return Array.from(reviewers.values()).slice(0, 6);
  }, [activityEvents, stats?.organization]);

  const collaborationFeed: ActivityEntry[] = useMemo(() => {
    if (!activityEvents || activityEvents.length === 0) {
      return [
        {
          id: 'empty-feed',
          actor: stats?.name || 'You',
          action: 'started collaborating on',
          target: stats?.organization || 'your workspace',
          timestamp: 'Just now',
          icon: ShieldCheck,
        },
      ];
    }
    return activityEvents.slice(0, 5).map((event) => ({
      id: event.id,
      actor: event.reviewer || event.title,
      action:
        event.type === 'upload'
          ? 'uploaded'
          : event.type === 'review'
          ? 'reviewed'
          : event.type === 'achievement'
          ? 'earned'
          : 'updated',
      target: event.description,
      timestamp: relativeTimeFrom(event.timestamp),
      icon: event.type === 'review' ? ShieldCheck : event.type === 'upload' ? Share2 : Bell,
    }));
  }, [activityEvents, stats?.name, stats?.organization]);

  const mentionTrigger = note.match(/@([\w.]*)$/);
  const mentionSuggestions = useMemo(() => {
    if (!mentionTrigger) return [];
    const query = mentionTrigger[1].toLowerCase();
    if (!query) {
      return mentionableTeammates.slice(0, 3);
    }
    return mentionableTeammates.filter(
      (member) =>
        member.handle.toLowerCase().includes(query) || member.name.toLowerCase().includes(query),
    );
  }, [mentionTrigger, mentionableTeammates]);

  const toggleFollow = (id: string) => {
    setFollowPending((prev) => ({ ...prev, [id]: true }));
    setFollowed((prev) => ({ ...prev, [id]: !prev[id] }));
    setTimeout(() => {
      setFollowPending((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 400);
  };

  const applyMention = (handle: string) => {
    if (!mentionTrigger) return;
    const nextNote = note.replace(/@([\w.]*)$/, `@${handle} `);
    setNote(nextNote);
  };

  const activeWorkspaceRole = useMemo(() => {
    const workspace = workspaceSummaries.find((ws) => ws.id === activeWorkspace);
    return workspace?.role || 'viewer';
  }, [activeWorkspace, workspaceSummaries]);

  const canInvite = activeWorkspaceRole === 'admin' || activeWorkspaceRole === 'editor';
  const canPost = activeWorkspaceRole !== 'viewer';
  const isEmailValid = inviteForm.email ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email) : false;

  const handleInviteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteForm.email) return;
    if (!canInvite) {
      setInviteError('You do not have permission to invite members');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteForm.email)) {
      setInviteError('Enter a valid email address');
      return;
    }
    setInviteError(null);
    const workspaceName = workspaceSummaries.find((ws) => ws.id === inviteForm.workspaceId)?.name;
    setInviteFeedback(`Invitation queued for ${inviteForm.email} (${inviteForm.role}) · ${workspaceName}`);
    setInviteForm((prev) => ({ ...prev, email: '' }));
    setTimeout(() => setInviteFeedback(null), 4000);
  };

  const handleCreateFolder = (data: CreateSharedFolderRequest) => {
    setCreateError(null);
    createFolderMutation.mutate(data, {
      onSuccess: () => {
        setIsCreateModalOpen(false);
      },
      onError: (error: any) => {
        setCreateError(error.message || 'Failed to create folder');
      },
    });
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const selectAllFolders = () => {
    if (selectedFolders.size === filteredFolders.length) {
      setSelectedFolders(new Set());
    } else {
      setSelectedFolders(new Set(filteredFolders.map(f => f.id)));
    }
  };

  const clearSelection = () => {
    setSelectedFolders(new Set());
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedFolders.size} folder(s)? This action cannot be undone.`)) {
      deleteFoldersMutation.mutate(Array.from(selectedFolders));
      setShowBulkMenu(false);
    }
  };

  const handleOpenFolder = (folderId: string) => {
    router.push(`/profile/folders/${folderId}`);
  };

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-3 text-white">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Collaboration</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Team workspaces & shared intelligence</h2>
            <p className="text-white/70">
              Follow emerging hazards, coordinate uploads, and keep your organisation in sync.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
              <span className="rounded-full bg-white/10 px-2.5 py-1">Role: {activeWorkspaceRole}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">
                {canInvite ? 'Can invite members' : 'Cannot invite'}
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">
                {canPost ? 'Can post updates' : 'Read-only posts'}
              </span>
            </div>
          </div>
          <Button 
            variant="secondary" 
            className="w-full sm:w-auto"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            New folder
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white/5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Followed focus areas</p>
              <h3 className="text-lg font-semibold">Hazards & geographic watches</h3>
            </div>
            <Bookmark className="h-5 w-5 text-white/60" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-3">
            {followableAreas.map((area) => (
              <div
                key={area.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-pacific-400/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{area.label}</p>
                    <p className="text-xs text-white/60">{area.context}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      area.severity === 'high'
                        ? 'bg-rose-500/20 text-rose-100'
                        : area.severity === 'medium'
                        ? 'bg-amber-400/20 text-amber-100'
                        : 'bg-emerald-400/20 text-emerald-100'
                    }`}
                  >
                    {area.severity} risk
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-white/70">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    <span>{area.followers} analysts watching</span>
                  </div>
                  <Button
                    size="sm"
                    variant={followed[area.id] ? 'secondary' : 'ghost'}
                    onClick={() => toggleFollow(area.id)}
                    disabled={!!followPending[area.id]}
                    aria-busy={!!followPending[area.id]}
                  >
                    {followPending[area.id] ? 'Updating…' : followed[area.id] ? 'Following' : 'Follow'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-white/5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Workspaces</p>
              <h3 className="text-lg font-semibold">Organisation hubs & roles</h3>
            </div>
            <Users className="h-5 w-5 text-white/60" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-4">
            {workspaceSummaries.map((workspace) => {
              const isActive = workspace.id === activeWorkspace;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setActiveWorkspace(workspace.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    isActive ? 'border-pacific-400/60 bg-pacific-400/10' : 'border-white/10 bg-white/5 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{workspace.name}</p>
                      <p className="text-sm text-white/70">{workspace.description}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rolePalette[workspace.role]}`}>
                      {workspace.role}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/70">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {workspace.members} members
                    </span>
                    <span className="flex items-center gap-1">
                      <MapIcon className="h-3.5 w-3.5" />
                      {workspace.channels} shared spaces
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {workspace.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/70"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white/5 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-white/60">Shared upload folders</p>
                <h3 className="text-lg font-semibold">Collaborative documentation</h3>
              </div>
              <FolderOpen className="h-5 w-5 text-white/60" aria-hidden="true" />
            </div>

            {sharedFoldersError && (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {sharedFoldersError}. Showing local data only.
              </div>
            )}

          {/* Search and Filter Controls */}
          <div className="space-y-3 mb-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type="text"
                placeholder="Search folders by name, description, or filters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-white/5 border border-white/15 rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-pacific-400/40 focus:border-pacific-300"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Visibility Filter & Bulk Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-white/5 rounded-xl border border-white/10 p-1">
                <button
                  onClick={() => setVisibilityFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    visibilityFilter === 'all'
                      ? 'bg-pacific-400/20 text-pacific-100'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setVisibilityFilter('public')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    visibilityFilter === 'public'
                      ? 'bg-emerald-400/20 text-emerald-100'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  Public
                </button>
                <button
                  onClick={() => setVisibilityFilter('private')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    visibilityFilter === 'private'
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  Private
                </button>
              </div>

              {selectedFolders.size > 0 && (
                <div className="flex items-center gap-2 ml-auto relative">
                  <span className="text-xs text-white/60">
                    {selectedFolders.size} selected
                  </span>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Clear
                  </Button>
                  <div className="relative">
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={() => setShowBulkMenu(!showBulkMenu)}
                      className="flex items-center gap-1"
                    >
                      Bulk Actions
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    {showBulkMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowBulkMenu(false)}
                        />
                        <div className="absolute right-0 mt-1 w-48 bg-deep-800 border border-white/10 rounded-lg shadow-xl z-20 overflow-hidden">
                          <button
                            onClick={handleBulkDelete}
                            disabled={deleteFoldersMutation.isPending}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-400/10 flex items-center gap-2 disabled:opacity-50"
                          >
                            <Trash className="h-4 w-4" />
                            {deleteFoldersMutation.isPending ? 'Deleting...' : 'Delete Selected'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {filteredFolders.length > 0 && (
                <button
                  onClick={selectAllFolders}
                  className="text-xs text-pacific-300 hover:text-pacific-200 ml-auto"
                >
                  {selectedFolders.size === filteredFolders.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {/* Results Summary */}
            {(searchQuery || visibilityFilter !== 'all') && (
              <div className="text-xs text-white/60">
                Showing {filteredFolders.length} of {sharedFolders.length} folders
              </div>
            )}
          </div>

          {/* Folders List */}
          <div className="divide-y divide-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {filteredFolders.length === 0 ? (
              <div className="bg-white/5 px-4 py-8 text-center">
                <p className="text-white/60 text-sm">
                  {searchQuery || visibilityFilter !== 'all'
                    ? 'No folders match your filters'
                    : 'No shared folders yet'}
                </p>
                {(searchQuery || visibilityFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setVisibilityFilter('all');
                    }}
                    className="text-xs text-pacific-300 hover:text-pacific-200 mt-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              filteredFolders.map((folder) => (
                <div key={folder.id} className="flex flex-wrap items-center gap-4 bg-white/5 px-4 py-3">
                  {/* Checkbox for selection */}
                  {folder.id !== 'folder-empty' && folder.id !== 'loading' && (
                    <input
                      type="checkbox"
                      checked={selectedFolders.has(folder.id)}
                      onChange={() => toggleFolderSelection(folder.id)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-pacific-400 focus:ring-pacific-400/40 cursor-pointer"
                      aria-label={`Select ${folder.name}`}
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{folder.name}</p>
                    <p className="text-xs text-white/60">
                      Owner: {folder.owner_username || folder.owner_id} • {relativeTimeFrom(folder.updated_at)}
                    </p>
                    {folder.description && (
                      <p className="text-xs text-white/50 mt-1">{folder.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-white/70">
                    <span className="flex items-center gap-1">
                      <Share2 className="h-4 w-4" />
                      {folder.item_count} items
                    </span>
                    <span className="flex items-center gap-1">
                      <Bell className="h-4 w-4" />
                      {folder.watcher_count || folder.watch_count || 0} watchers
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        folder.is_public
                          ? 'bg-emerald-400/20 text-emerald-100'
                          : 'bg-white/10 text-white/70'
                      }`}
                    >
                      {folder.is_public ? 'Public' : 'Private'}
                    </span>
                  </div>
                  {folder.id !== 'folder-empty' && folder.id !== 'loading' && (
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant={folder.is_watching ? 'secondary' : 'ghost'}
                        onClick={() => watchMutation.mutate({ folderId: folder.id, isWatching: folder.is_watching || false })}
                        disabled={watchMutation.isPending}
                      >
                        {folder.is_watching ? 'Watching' : 'Watch'}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="ml-auto"
                        onClick={() => handleOpenFolder(folder.id)}
                      >
                        Open folder
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="bg-white/5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">@mention comments</p>
              <h3 className="text-lg font-semibold">Notify teammates with context</h3>
            </div>
            <Target className="h-5 w-5 text-white/60" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-3">
            <label htmlFor="collab-mention-note-main" className="text-sm text-white/70">
              Draft a note to your team
            </label>
            <textarea
              id="collab-mention-note-main"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Tag teammates with @name to request reviews or share updates..."
              className="h-28 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/40"
            />
            <div className="flex justify-end">
              <Button size="sm" disabled={!note.trim() || !canPost} title={!canPost ? 'You need editor or admin access to post' : undefined}>
                <Share2 className="mr-2 h-4 w-4" />
                Post update
              </Button>
            </div>
            {mentionTrigger && mentionSuggestions.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-deep-900/80 p-3 shadow-lg">
                <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Mention teammates</p>
                <div className="space-y-2">
                  {mentionSuggestions.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => applyMention(member.handle)}
                      aria-label={`Mention ${member.name} (${member.handle})`}
                      className="flex w-full items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
                    >
                      <div>
                        <p className="font-semibold">{member.name}</p>
                        <p className="text-white/60">@{member.handle} • {member.role}</p>
                      </div>
                      <ShieldCheck className="h-4 w-4 text-pacific-300" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white/5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Team activity feed</p>
              <h3 className="text-lg font-semibold">Recent contributions</h3>
            </div>
            <Activity className="h-5 w-5 text-white/60" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-3">
            {collaborationFeed.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
              >
                <span className="rounded-xl bg-white/10 p-2">
                  <entry.icon className="h-4 w-4 text-pacific-300" aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <p className="text-sm text-white">
                    <span className="font-semibold">{entry.actor}</span> {entry.action}{' '}
                    <span className="font-semibold">{entry.target}</span>
                  </p>
                  <p className="text-xs text-white/60">{entry.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-white/5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Invite teammates</p>
              <h3 className="text-lg font-semibold">Role-based access</h3>
            </div>
            <UserPlus className="h-5 w-5 text-white/60" aria-hidden="true" />
          </div>
          <form className="mt-4 space-y-3" onSubmit={handleInviteSubmit}>
            <label className="text-sm text-white/70" htmlFor="collab-invite-email-main">
              Email address
            </label>
            <input
              id="collab-invite-email-main"
              type="email"
              required
              value={inviteForm.email}
              onChange={(event) => {
                const value = event.target.value.trim();
                setInviteForm((prev) => ({ ...prev, email: value }));
                if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                  setInviteError('Enter a valid email address');
                } else {
                  setInviteError(null);
                }
              }}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/40"
              placeholder="analyst@agency.org"
            />
            {inviteError && <p className="text-xs text-coral-200">{inviteError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-white/70" htmlFor="collab-invite-role-main">
                  Role
                </label>
                <select
                  id="collab-invite-role-main"
                  value={inviteForm.role}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value as Role }))}
                  className="mt-1 w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/40"
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-white/70" htmlFor="collab-invite-workspace-main">
                  Workspace
                </label>
                <select
                  id="collab-invite-workspace-main"
                  value={inviteForm.workspaceId}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, workspaceId: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/40"
                >
                  {workspaceSummaries.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!inviteForm.email || !isEmailValid || !canInvite}
              title={!canInvite ? 'You need admin or editor access to invite' : undefined}
            >
              Send invitation
            </Button>
            {inviteFeedback && (
              <p className="rounded-2xl bg-pacific-400/10 px-3 py-2 text-sm text-pacific-100">{inviteFeedback}</p>
            )}
          </form>
        </Card>
      </div>

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateError(null);
        }}
        onSubmit={handleCreateFolder}
        isLoading={createFolderMutation.isPending}
        error={createError}
      />
    </section>
  );
}
