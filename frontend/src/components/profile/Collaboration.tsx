'use client';

import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Bookmark,
  FolderOpen,
  Globe,
  MapIcon,
  Share2,
  ShieldCheck,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, Button, Select } from '@/components/design-system';
import type { UserStats, UserUpload, UserActivityEvent, HazardType } from '@/lib/types';
import { HAZARD_TYPE_LABELS } from '@/lib/types';
import { USER_ACTIVITY_QUERY_KEY, fetchUserActivity } from './ActivityTimeline';
import { authFetch } from '@/lib/auth-utils';

type Role = 'admin' | 'editor' | 'viewer';

interface Followable {
  id: string;
  label: string;
  type: 'hazard' | 'region';
  context: string;
  severity: 'low' | 'medium' | 'high';
  uploadCount: number; // Actual upload count - honest metric
}

interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
  members?: number; // Optional - only shown if backend provides real data
  channels?: number; // Optional - only shown if backend provides real data
  permissions: string[];
  description: string;
}

interface SharedFolder {
  id: string;
  name: string;
  owner: string;
  updated: string;
  items: number;
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

interface CollabNote {
  id: string;
  body: string;
  createdAt: string;
}

interface CollaborationState {
  followed: Record<string, boolean>;
  workspaces: WorkspaceSummary[];
  invites: Array<{ email: string; workspaceId: string; role: Role; createdAt: string }>;
  notes: CollabNote[];
}

interface WorkspaceApi {
  id: string;
  name: string;
  description?: string;
  members: number;
  shared_spaces: number;
}

interface FollowEntry {
  area_id: string;
  type: string;
  label?: string;
}

interface NotificationEntry {
  id: string;
  type: string;
  message: string;
  created_at: string;
  context?: string;
}

const rolePalette: Record<Role, string> = {
  admin: 'bg-pacific-400/20 text-pacific-100',
  editor: 'bg-coral-400/20 text-coral-100',
  viewer: 'bg-white/10 text-white/70',
};

interface CollaborationProps {
  uploads?: UserUpload[];
  stats?: UserStats | null;
  /** When false, the component is hidden and should pause polling */
  isActive?: boolean;
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

export default function Collaboration({ uploads = [], stats, isActive = true }: CollaborationProps) {
  const queryClient = useQueryClient();
  const { data: activityData } = useQuery({
    // Shared query key - same data used by ActivityTimeline.tsx (avoids duplicate API calls)
    queryKey: USER_ACTIVITY_QUERY_KEY,
    queryFn: fetchUserActivity,
    staleTime: 60_000,
    // Only fetch when tab is active
    enabled: isActive,
  });

  const { data: serverWorkspaces } = useQuery<WorkspaceApi[]>({
    queryKey: ['collaboration', 'workspaces'],
    queryFn: async () => {
      const res = await authFetch('/api/workspaces');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
    enabled: isActive,
  });

  const { data: serverFollows } = useQuery<FollowEntry[]>({
    queryKey: ['collaboration', 'follows'],
    queryFn: async () => {
      const res = await authFetch('/api/follows');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
    enabled: isActive,
  });

  const { data: notifications } = useQuery<NotificationEntry[]>({
    queryKey: ['collaboration', 'notifications'],
    queryFn: async () => {
      const res = await authFetch('/api/notifications');
      if (!res.ok) {
        // In simple/local mode this endpoint may not be available; degrade gracefully.
        return [];
      }
      return res.json();
    },
    staleTime: 30_000,
    enabled: isActive,
  });

  const activityEvents = activityData?.events ?? [];

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/collaboration`);
    ws.onopen = () => ws.send('online');
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'comment_created' || payload?.type === 'workspace_created') {
          queryClient.invalidateQueries({ queryKey: ['collaboration', 'notifications'] });
        }
      } catch {
        // ignore
      }
    };
    return () => {
      ws.close();
    };
  }, [isActive, queryClient]);

  useEffect(() => {
    if (serverWorkspaces && serverWorkspaces.length) {
      const mapped: WorkspaceSummary[] = serverWorkspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        role: 'admin',
        // Only include counts if backend provides real data
        members: ws.members && ws.members > 0 ? ws.members : undefined,
        channels: ws.shared_spaces && ws.shared_spaces > 0 ? ws.shared_spaces : undefined,
        permissions: ['Upload & edit', 'Invite collaborators'],
        description: ws.description || 'Workspace',
      }));
      updateCollaborationState((curr) => ({ ...curr, workspaces: mapped }));
    }
  }, [serverWorkspaces]);

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
    const hazardEntries = hazardAggregates.map(([key, data]) => ({
      id: `haz-${key}`,
      label: mapHazardLabel(key as HazardType),
      type: 'hazard' as const,
      context: data.sample?.location || data.sample?.country || 'No location provided',
      // Severity based on actual upload count - more honest indicator
      severity: (data.count >= 5 ? 'high' : data.count >= 2 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      uploadCount: data.count,
    }));
    const regionEntries = regionAggregates.map(([region, data]) => ({
      id: `reg-${region}`,
      label: region,
      type: 'region' as const,
      context: mapHazardLabel(data.hazard),
      severity: (data.count >= 5 ? 'high' : data.count >= 2 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      uploadCount: data.count,
    }));
    return [...hazardEntries, ...regionEntries].slice(0, 4);
  }, [hazardAggregates, regionAggregates]);

  const workspaceSummaries: WorkspaceSummary[] = useMemo(() => {
    if (serverWorkspaces && serverWorkspaces.length > 0) {
      return serverWorkspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        role: 'admin',
        // Only include member/channel counts if provided by backend
        members: ws.members && ws.members > 0 ? ws.members : undefined,
        channels: ws.shared_spaces && ws.shared_spaces > 0 ? ws.shared_spaces : undefined,
        permissions: ['Upload & edit', 'Invite collaborators'],
        description: ws.description || 'Workspace',
      }));
    }
    const fallback = [];
    if (stats) {
      fallback.push({
        id: 'workspace-primary',
        name: stats.organization || 'Independent Workspace',
        role: 'admin' as Role,
        // No fake member/channel counts for fallback workspaces
        permissions: ['Upload & edit', 'Invite collaborators', 'Manage reviews'],
        description: 'Automatically generated from your organisation profile.',
      });
    }
    return fallback.length > 0
      ? fallback
      : [
          {
            id: 'workspace-fallback',
            name: 'Personal workspace',
            role: 'admin',
            // No fake counts
            permissions: ['Upload & organise'],
            description: 'Create your first workspace to start collaborating.',
          },
        ];
  }, [serverWorkspaces, stats]);

  const sharedFolders: SharedFolder[] = useMemo(() => {
    if (!uploads.length) {
      return [
        {
          id: 'folder-empty',
          name: 'No shared uploads yet',
          owner: stats?.name || 'You',
          updated: '—',
          items: 0,
        },
      ];
    }
    return hazardAggregates.map(([hazard, data]) => ({
      id: `folder-${hazard}`,
      name: `${mapHazardLabel(hazard as HazardType)} evidence`,
      owner: stats?.name || 'You',
      updated: relativeTimeFrom(data.sample?.uploaded_at),
      items: data.count,
    }));
  }, [uploads.length, hazardAggregates, stats?.name]);

  const defaultCollabState: CollaborationState = useMemo(
    () => ({
      followed: {},
      workspaces: workspaceSummaries,
      invites: [],
      notes: [],
    }),
    [workspaceSummaries],
  );

  const loadCollaborationState = () => {
    if (typeof window === 'undefined') return defaultCollabState;
    try {
      const stored = window.localStorage.getItem('collaboration-state');
      if (!stored) return defaultCollabState;
      const parsed = JSON.parse(stored);
      return {
        ...defaultCollabState,
        ...parsed,
        followed: parsed.followed || {},
        workspaces: parsed.workspaces?.length ? parsed.workspaces : defaultCollabState.workspaces,
        invites: parsed.invites || [],
        notes: parsed.notes || [],
      } as CollaborationState;
    } catch {
      return defaultCollabState;
    }
  };

  const { data: collaborationState = defaultCollabState } = useQuery({
    queryKey: ['collaboration-state'],
    queryFn: async () => loadCollaborationState(),
    initialData: defaultCollabState,
  });

  const persistCollaborationState = (next: CollaborationState) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('collaboration-state', JSON.stringify(next));
    }
    queryClient.setQueryData(['collaboration-state'], next);
  };

  const updateCollaborationState = (updater: (curr: CollaborationState) => CollaborationState) => {
    const current = (queryClient.getQueryData(['collaboration-state']) as CollaborationState) || collaborationState;
    const next = updater(current);
    persistCollaborationState(next);
    return next;
  };

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
    const baseFeed =
      activityEvents && activityEvents.length > 0
        ? activityEvents.slice(0, 5).map((event) => ({
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
          }))
        : [
            {
              id: 'empty-feed',
              actor: stats?.name || 'You',
              action: 'started collaborating on',
              target: stats?.organization || 'your workspace',
              timestamp: 'Just now',
              icon: ShieldCheck,
            },
          ];

    const notificationEntries =
      notifications?.slice(0, 5).map<ActivityEntry>((n) => ({
        id: n.id,
        actor: 'System',
        action: n.type,
        target: n.message,
        timestamp: relativeTimeFrom(n.created_at),
        icon: Bell,
      })) || [];

    const localNotes = (collaborationState.notes || []).map<ActivityEntry>((note) => ({
      id: note.id,
      actor: stats?.name || 'You',
      action: 'shared',
      target: note.body,
      timestamp: relativeTimeFrom(note.createdAt),
      icon: Target,
    }));

    return [...notificationEntries, ...localNotes, ...baseFeed].slice(0, 8);
  }, [activityEvents, stats?.name, stats?.organization, collaborationState.notes, notifications]);

  const [activeWorkspace, setActiveWorkspace] = useState<string | undefined>(collaborationState.workspaces[0]?.id);
  const [note, setNote] = useState('');
  const [inviteForm, setInviteForm] = useState<{ email: string; role: Role; workspaceId: string }>({
    email: '',
    role: 'editor',
    workspaceId: collaborationState.workspaces[0]?.id || 'workspace-fallback',
  });
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [noteFeedback, setNoteFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkspace && collaborationState.workspaces[0]?.id) {
      setActiveWorkspace(collaborationState.workspaces[0].id);
    }
    if (!collaborationState.workspaces.find((ws) => ws.id === inviteForm.workspaceId)) {
      setInviteForm((prev) => ({
        ...prev,
        workspaceId: collaborationState.workspaces[0]?.id || 'workspace-fallback',
      }));
    }
  }, [collaborationState.workspaces, activeWorkspace, inviteForm.workspaceId]);

  const followMap = useMemo(() => {
    const serverMap =
      serverFollows?.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.area_id] = true;
        return acc;
      }, {}) || {};
    return Object.keys(serverMap).length ? serverMap : collaborationState.followed;
  }, [serverFollows, collaborationState.followed]);

  const followMutation = useMutation({
    mutationFn: async (area: Followable) => {
      const shouldFollow = !followMap[area.id];
      try {
        await authFetch('/api/follows', {
          method: shouldFollow ? 'POST' : 'DELETE',
          body: shouldFollow ? JSON.stringify({ area_id: area.id, type: area.type, label: area.label }) : undefined,
        });
      } catch {
        // Graceful fallback to local persistence only
      }
      return { areaId: area.id, shouldFollow };
    },
    onSuccess: ({ areaId, shouldFollow }) => {
      updateCollaborationState((curr) => ({
        ...curr,
        followed: { ...curr.followed, [areaId]: shouldFollow },
      }));
    },
  });

  const postNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      setNoteFeedback(null);
      try {
        await authFetch('/api/comments', {
          method: 'POST',
          body: JSON.stringify({ body, workspace_id: activeWorkspace }),
        });
      } catch {
        // Ignore when offline or endpoint missing
      }
      return body;
    },
    onSuccess: (body) => {
      const newNote: CollabNote = {
        id: `note-${Date.now()}`,
        body,
        createdAt: new Date().toISOString(),
      };
      updateCollaborationState((curr) => ({
        ...curr,
        notes: [newNote, ...curr.notes].slice(0, 10),
      }));
      setNote('');
      setNoteFeedback('Update posted.');
    },
    onError: (error: any) => {
      setNoteFeedback(error?.message || 'Unable to post update.');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Role; workspaceId: string }) => {
      // Use the admin invite endpoint (requires admin permissions)
      const response = await authFetch('/api/admin/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email, role, send_invite: true }),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        // Provide more helpful error messages
        if (response.status === 403) {
          throw new Error('You need admin permissions to invite users');
        }
        if (response.status === 400 && details?.detail?.includes('already exists')) {
          throw new Error('A user with this email already exists');
        }
        throw new Error(details?.detail || 'Failed to send invite');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      const inviteEntry = {
        email: variables.email,
        workspaceId: variables.workspaceId,
        role: variables.role,
        createdAt: new Date().toISOString(),
      };
      updateCollaborationState((curr) => ({
        ...curr,
        invites: [inviteEntry, ...curr.invites].slice(0, 20),
      }));
      setInviteFeedback(`Invitation sent to ${variables.email} (${variables.role}).`);
      setInviteForm((prev) => ({ ...prev, email: '' }));
      setTimeout(() => setInviteFeedback(null), 4000);
    },
    onError: (error: any) => {
      setInviteFeedback(error?.message || 'Failed to send invitation.');
      setTimeout(() => setInviteFeedback(null), 5000);
    },
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async (name: string) => {
      try {
        const response = await authFetch('/api/workspaces', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          return payload.id || `workspace-${Date.now()}`;
        }
      } catch {
        // fallback below
      }
      return `workspace-${Date.now()}`;
    },
    onSuccess: (workspaceId, name) => {
      const newWorkspace: WorkspaceSummary = {
        id: workspaceId,
        name,
        role: 'admin',
        // No fake counts for newly created workspaces
        permissions: ['Upload & edit', 'Invite collaborators'],
        description: 'Created from Collaboration tab.',
      };
      updateCollaborationState((curr) => ({
        ...curr,
        workspaces: [newWorkspace, ...curr.workspaces],
      }));
      queryClient.invalidateQueries({ queryKey: ['collaboration', 'workspaces'] });
      setActiveWorkspace(newWorkspace.id);
      setInviteForm((prev) => ({ ...prev, workspaceId: newWorkspace.id }));
    },
  });

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

  const toggleFollow = (area: Followable) => followMutation.mutate(area);

  const applyMention = (handle: string) => {
    if (!mentionTrigger) return;
    const nextNote = note.replace(/@([\w.]*)$/, `@${handle} `);
    setNote(nextNote);
  };

  const handleInviteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteForm.email) return;
    inviteMutation.mutate(inviteForm);
  };

  const handleCreateWorkspace = () => {
    const name = typeof window !== 'undefined' ? window.prompt('Workspace name') : null;
    if (!name || !name.trim()) return;
    createWorkspaceMutation.mutate(name.trim());
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
          </div>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={handleCreateWorkspace} disabled={createWorkspaceMutation.isPending}>
            <UserPlus className="mr-2 h-4 w-4" />
            New workspace
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
                    {/* Show upload count-based activity level, not fake popularity */}
                    {area.uploadCount} {area.uploadCount === 1 ? 'upload' : 'uploads'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-white/70">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    <span>Get notified of updates</span>
                  </div>
                  <Button
                    size="sm"
                    variant={followMap[area.id] ? 'secondary' : 'ghost'}
                    onClick={() => toggleFollow(area)}
                    disabled={followMutation.isPending}
                  >
                    {followMap[area.id] ? 'Following' : 'Follow'}
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
            {collaborationState.workspaces.map((workspace) => {
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
                    {/* Only show real counts when backend provides them */}
                    {workspace.members && workspace.members > 0 ? (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {workspace.members} {workspace.members === 1 ? 'member' : 'members'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Team workspace
                      </span>
                    )}
                    {workspace.channels && workspace.channels > 0 ? (
                      <span className="flex items-center gap-1">
                        <MapIcon className="h-3.5 w-3.5" />
                        {workspace.channels} shared {workspace.channels === 1 ? 'space' : 'spaces'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <MapIcon className="h-3.5 w-3.5" />
                        Shared collaboration
                      </span>
                    )}
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Shared upload folders</p>
              <h3 className="text-lg font-semibold">Collaborative documentation</h3>
            </div>
            <FolderOpen className="h-5 w-5 text-white/60" aria-hidden="true" />
          </div>
          <div className="mt-4 divide-y divide-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {sharedFolders.map((folder) => (
              <div key={folder.id} className="flex flex-wrap items-center gap-4 bg-white/5 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{folder.name}</p>
                  <p className="text-xs text-white/60">
                    Owner: {folder.owner} • {folder.updated}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm text-white/70">
                  {folder.items > 0 && (
                    <span className="flex items-center gap-1">
                      <Share2 className="h-4 w-4" />
                      {folder.items} {folder.items === 1 ? 'item' : 'items'}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Bell className="h-4 w-4" />
                    Access controlled
                  </span>
                </div>
                <Button size="sm" variant="ghost" className="ml-auto">
                  Open folder
                </Button>
              </div>
            ))}
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
            <label htmlFor="collab-mention-note" className="text-sm text-white/70">
              Draft a note to your team
            </label>
            <textarea
              id="collab-mention-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Tag teammates with @name to request reviews or share updates..."
              className="h-28 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/40"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!note.trim() || postNoteMutation.isPending}
                onClick={() => postNoteMutation.mutate(note.trim())}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {postNoteMutation.isPending ? 'Posting…' : 'Post update'}
              </Button>
            </div>
            {noteFeedback && <p className="text-xs text-emerald-200">{noteFeedback}</p>}
            {mentionTrigger && mentionSuggestions.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-deep-900/80 p-3 shadow-lg">
                <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Mention teammates</p>
                <div className="space-y-2">
                  {mentionSuggestions.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => applyMention(member.handle)}
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
            <label className="text-sm text-white/70" htmlFor="collab-invite-email">
              Email address
            </label>
            <input
              id="collab-invite-email"
              type="email"
              required
              value={inviteForm.email}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value.trim() }))}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/40"
              placeholder="analyst@agency.org"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                id="collab-invite-role"
                label="Role"
                value={inviteForm.role}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value as Role }))}
                variant="dark"
                size="md"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </Select>
              <Select
                id="collab-invite-workspace"
                label="Workspace"
                value={inviteForm.workspaceId}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, workspaceId: event.target.value }))}
                variant="dark"
                size="md"
              >
                {collaborationState.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={!inviteForm.email || inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
            {inviteFeedback && (
              <p className="rounded-2xl bg-pacific-400/10 px-3 py-2 text-sm text-pacific-100">{inviteFeedback}</p>
            )}
          </form>
        </Card>
      </div>
    </section>
  );
}
