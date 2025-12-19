'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Card, Button } from '@/components/design-system';
import { imageApi } from '@/lib/api';
import type { UserStats, UserUpload, UserActivityEvent, HazardType, PaginatedResponse } from '@/lib/types';
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

interface SharedFolder {
  id: string;
  name: string;
  owner: string;
  updated: string;
  items: number;
  watchers: number;
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

  const sharedFolders: SharedFolder[] = useMemo(() => {
    if (!uploads.length) {
      return [
        {
          id: 'folder-empty',
          name: 'No shared uploads yet',
          owner: stats?.name || 'You',
          updated: '—',
          items: 0,
          watchers: 0,
        },
      ];
    }
    return hazardAggregates.map(([hazard, data]) => ({
      id: `folder-${hazard}`,
      name: `${mapHazardLabel(hazard as HazardType)} evidence`,
      owner: stats?.name || 'You',
      updated: relativeTimeFrom(data.sample?.uploaded_at),
      items: data.count,
      watchers: Math.max(1, regionAggregates.length),
    }));
  }, [uploads.length, hazardAggregates, stats?.name, regionAggregates.length]);

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

  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [activeWorkspace, setActiveWorkspace] = useState(workspaceSummaries[0]?.id);
  const [note, setNote] = useState('');
  const [inviteForm, setInviteForm] = useState<{ email: string; role: Role; workspaceId: string }>({
    email: '',
    role: 'editor',
    workspaceId: workspaceSummaries[0]?.id || 'workspace-fallback',
  });
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

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
  }, [mentionTrigger]);

  const toggleFollow = (id: string) => {
    setFollowed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const applyMention = (handle: string) => {
    if (!mentionTrigger) return;
    const nextNote = note.replace(/@([\w.]*)$/, `@${handle} `);
    setNote(nextNote);
  };

  const handleInviteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteForm.email) return;
    const workspaceName = workspaceSummaries.find((ws) => ws.id === inviteForm.workspaceId)?.name;
    setInviteFeedback(`Invitation queued for ${inviteForm.email} (${inviteForm.role}) · ${workspaceName}`);
    setInviteForm((prev) => ({ ...prev, email: '' }));
    setTimeout(() => setInviteFeedback(null), 4000);
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
          <Button variant="secondary" className="w-full sm:w-auto">
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
                  >
                    {followed[area.id] ? 'Following' : 'Follow'}
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
                  <span className="flex items-center gap-1">
                    <Share2 className="h-4 w-4" />
                    {folder.items} items
                  </span>
                  <span className="flex items-center gap-1">
                    <Bell className="h-4 w-4" />
                    {folder.watchers} watchers
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
              <Button size="sm" disabled={!note.trim()}>
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
              <div>
                <label className="text-sm text-white/70" htmlFor="collab-invite-role">
                  Role
                </label>
                <select
                  id="collab-invite-role"
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
                <label className="text-sm text-white/70" htmlFor="collab-invite-workspace">
                  Workspace
                </label>
                <select
                  id="collab-invite-workspace"
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
            <Button type="submit" className="w-full" disabled={!inviteForm.email}>
              Send invitation
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
