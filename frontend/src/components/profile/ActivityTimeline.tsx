'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  MessageSquareText,
  Trophy,
  Upload,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export type ActivityType = 'upload' | 'edit' | 'review' | 'achievement' | 'system';

interface BaseActivity {
  id: string;
  title: string;
  description: string;
  timestamp: string;
}

export interface UploadActivity extends BaseActivity {
  type: 'upload';
}

export interface EditActivity extends BaseActivity {
  type: 'edit';
}

export interface ReviewActivity extends BaseActivity {
  type: 'review';
  reviewer?: string;
  reviewComments: string;
  suggestedImprovements?: string[];
}

export interface AchievementActivity extends BaseActivity {
  type: 'achievement';
  achievementBadge: string;
}

export interface SystemActivity extends BaseActivity {
  type: 'system';
  systemMessage: string;
}

export type ActivityItem =
  | UploadActivity
  | EditActivity
  | ReviewActivity
  | AchievementActivity
  | SystemActivity;

const POLL_INTERVAL = 30_000;

const mockActivities: ActivityItem[] = [
  {
    id: 'upload-1',
    type: 'upload',
    title: 'Uploaded “Mangrove Restoration Survey.jpg”',
    description: 'High-resolution imagery for coastal resilience program',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: 'edit-1',
    type: 'edit',
    title: 'Edited project metadata',
    description: 'Updated hazard classification and geolocation accuracy',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'review-1',
    type: 'review',
    title: 'Review received for “Floodplain Assessment.pdf”',
    description: 'Peer review complete — see recommendations below',
    reviewer: 'Dr. Amina Clarke',
    reviewComments: 'Great documentation of field notes. Consider clarifying sensor calibration steps.',
    suggestedImprovements: [
      'Add calibration photos for sensors used on March 3rd.',
      'Include a short summary of QA/QC checks in the metadata.',
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 'achievement-1',
    type: 'achievement',
    title: 'Unlocked “Consistency Champion” badge',
    description: '10 consecutive weeks of verified submissions',
    achievementBadge: 'Consistency Champion',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: 'system-1',
    type: 'system',
    title: 'Scheduled maintenance',
    description: 'Brief downtime on Saturday for database upgrades',
    systemMessage: 'We will be offline for approximately 20 minutes at 02:00 UTC. Uploads will resume automatically.',
    timestamp: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
  },
];

export async function fetchActivityTimeline(): Promise<ActivityItem[]> {
  // Placeholder for future API integration. Keeps the API consistent with React Query expectations.
  return Promise.resolve(mockActivities);
}

const filterLabels: Record<ActivityType | 'all', string> = {
  all: 'All activity',
  upload: 'Uploads',
  edit: 'Edits',
  review: 'Reviews',
  achievement: 'Achievements',
  system: 'System',
};

const iconMap: Record<ActivityType, () => JSX.Element> = {
  upload: () => <Upload className="h-4 w-4" />,
  edit: () => <FileText className="h-4 w-4" />,
  review: () => <MessageSquareText className="h-4 w-4" />,
  achievement: () => <Trophy className="h-4 w-4" />,
  system: () => <AlertTriangle className="h-4 w-4" />,
};

const filterIcons: Record<ActivityType | 'all', () => JSX.Element> = {
  all: () => <Filter className="h-4 w-4" />,
  upload: iconMap.upload,
  edit: iconMap.edit,
  review: iconMap.review,
  achievement: iconMap.achievement,
  system: iconMap.system,
};

const typeStyles: Record<ActivityType, string> = {
  upload: 'border-pacific-500/40 bg-pacific-500/10',
  edit: 'border-coral-500/40 bg-coral-500/10',
  review: 'border-palm-500/40 bg-palm-500/10',
  achievement: 'border-indigo-400/40 bg-indigo-500/10',
  system: 'border-white/20 bg-white/5',
};

export default function ActivityTimeline() {
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const { data: activities = [], isLoading, error } = useQuery({
    queryKey: ['profile-activity-timeline'],
    queryFn: fetchActivityTimeline,
    refetchInterval: POLL_INTERVAL,
  });

  const sortedActivities = useMemo(
    () =>
      // Client-side sort keeps the feed chronological even if the API does not return ordered data.
      [...activities].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [activities],
  );

  const filteredActivities = useMemo(
    () => (filter === 'all' ? sortedActivities : sortedActivities.filter((item) => item.type === filter)),
    [filter, sortedActivities],
  );

  const unreadCount = useMemo(
    () =>
      // Count is intentionally global (not filtered) to reflect overall unread activity in the badge indicator.
      activities.filter((item) => !readIds.has(item.id)).length,
    [activities, readIds],
  );

  const markAsRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
  };

  const markAllAsRead = () => {
    setReadIds(new Set(activities.map((item) => item.id)));
  };

  const renderReviewDetails = (item: ActivityItem) => {
    if (item.type !== 'review') return null;
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-palm-500/30 bg-palm-500/5 p-3">
        <div className="flex items-center gap-2 text-sm text-palm-200">
          <CheckCircle2 className="h-4 w-4" />
          <span>Feedback from {item.reviewer ?? 'reviewer'}</span>
        </div>
        {item.reviewComments && <p className="text-sm text-white/80">{item.reviewComments}</p>}
        {item.suggestedImprovements?.length ? (
          <ul className="space-y-1 text-sm text-white/70">
            {item.suggestedImprovements.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-[3px] block h-1.5 w-1.5 rounded-full bg-palm-300" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  const renderSystemMessage = (item: ActivityItem) => {
    if (item.type !== 'system' || !item.systemMessage) return null;
    return (
      <div className="mt-2 rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-white/80">
        {item.systemMessage}
      </div>
    );
  };

  if (error) {
    return (
      <div className="rounded-xl border border-coral-500/30 bg-coral-500/10 p-4 text-sm text-white">
        Failed to load activity timeline. Please try again later.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-deep-900/60 p-6 shadow-lg backdrop-blur" aria-label="Profile activity timeline">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="h-6 w-6 text-white" />
            {unreadCount > 0 && (
              <span
                className="absolute -right-2 -top-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-coral-500 px-2 text-xs font-semibold text-white"
                aria-label={`unread activity count: ${unreadCount > 99 ? '99+' : unreadCount}`}
                aria-live="polite"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Activity timeline</h2>
            <p className="text-sm text-white/70">Chronological feed of your uploads, reviews, achievements, and system updates.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(filterLabels) as Array<ActivityType | 'all'>).map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-label={`Filter by ${filterLabels[key].toLowerCase()}`}
                aria-pressed={filter === key}
                className={clsx(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition hover:scale-[1.01]',
                  filter === key
                    ? 'border-white bg-white/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:text-white',
                )}
              >
                {filterIcons[key]()}
                {filterLabels[key]}
              </button>
            ))}
          </div>
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            aria-disabled={unreadCount === 0}
            aria-label={unreadCount === 0 ? 'Mark all as read (no unread items)' : 'Mark all as read'}
            className={clsx(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition',
              unreadCount === 0
                ? 'border-white/10 bg-white/5 text-white/40'
                : 'border-white/10 bg-white/5 text-white/80 hover:border-white/30 hover:text-white',
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="flex items-center gap-1">
              Mark all as read
              {unreadCount === 0 && <span className="sr-only">(no unread items)</span>}
            </span>
          </button>
        </div>
      </header>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-white/60">Loading timeline…</p>
        ) : filteredActivities.length === 0 ? (
          <p className="text-sm text-white/60">
            {filter === 'all' ? 'No activity to show yet.' : 'No activity to show for this filter yet.'}
          </p>
        ) : (
          <ol className="space-y-3" role="feed" aria-label="Activity feed">
            {filteredActivities.map((item) => {
              const isUnread = !readIds.has(item.id);
              return (
                <li key={item.id} role="listitem">
                  <article
                    className={clsx(
                      'relative overflow-hidden rounded-xl border p-4 transition hover:border-white/30',
                      typeStyles[item.type],
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-white/10 p-2 text-white">{iconMap[item.type]()}</div>
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-white">{item.title}</h3>
                          {item.type === 'achievement' && item.achievementBadge && (
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-100">
                              {item.achievementBadge}
                            </span>
                          )}
                          {isUnread && (
                            <span className="rounded-full bg-coral-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Unread
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-white/80">{item.description}</p>
                        {renderReviewDetails(item)}
                        {renderSystemMessage(item)}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-4 w-4" />
                            {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                          </span>
                          {item.type === 'review' && item.reviewer && (
                            <span className="inline-flex items-center gap-1 text-palm-200">
                              <MessageSquareText className="h-4 w-4" /> Reviewed by {item.reviewer}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isUnread ? (
                          <button
                            onClick={() => markAsRead(item.id)}
                            aria-label={`Mark "${item.title}" as read`}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:border-white/30 hover:text-white"
                          >
                            Mark as read
                          </button>
                        ) : (
                          <span className="text-xs text-white/50">Marked as read</span>
                        )}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
