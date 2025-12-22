'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UploadCloud, Award, Activity, Settings, MapPin, ShieldCheck, Users } from 'lucide-react';
import { PermissionGate } from '@/components/PermissionGate';
import clsx from 'clsx';
import { imageApi } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { HAZARD_TYPE_LABELS, UserStats, UserUpload } from '@/lib/types';
import { Card, Button } from '@/components/design-system';
import ActivityTimeline from '@/components/profile/ActivityTimeline';
import Collaboration from '@/components/profile/Collaboration';
import MobileBottomNav, { PROFILE_NAV_ITEMS } from '@/components/profile/MobileBottomNav';
import SwipeableTabs from '@/components/profile/SwipeableTabs';
import InfiniteUploadList from '@/components/profile/InfiniteUploadList';
import ErrorBanner from '@/components/ErrorBanner';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';

// Dynamically import UserAnalyticsReal to prevent SSR (Leaflet requires window object)
const UserAnalyticsReal = dynamic(() => import('@/components/profile/UserAnalyticsReal'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-pacific-400 animate-spin" />
    </div>
  ),
});

const TABS = [
  { id: 'uploads', label: 'Uploads', icon: UploadCloud },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'collaboration', label: 'Collaboration', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const glassCard = 'rounded-3xl border border-white/10 bg-white/5 backdrop-blur shadow-xl';

const defaultStats: UserStats = {
  name: 'Your profile',
  email: '',
  organization: 'Independent',
  avatar_url: undefined,
  total_uploads: 0,
  approval_rate: 0,
  impact_score: 0,
  last_active: new Date().toISOString(),
  achievements: [],
  analytics: {
    uploads_this_month: 0,
    average_review_time: 0,
    top_hazard: 'unknown',
  },
};

export default function ProfileClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('uploads');
  const [isLoading, setIsLoading] = useState(false);
  const [contentVisible, setContentVisible] = useState(true);
  const tablistRef = useRef<HTMLDivElement>(null);
  const transitionTimers = useRef<number[]>([]);
  
  // Enable queries only when authenticated
  const queriesEnabled = !authLoading && isAuthenticated;

  // Auth guard - redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const returnUrl = encodeURIComponent(pathname);
      router.push(`/auth/login?returnUrl=${returnUrl}`);
    }
  }, [isAuthenticated, authLoading, router, pathname]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && TABS.some((tab) => tab.id === tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  /**
   * Keyboard navigation for tabs (WAI-ARIA compliant)
   * - Arrow Left/Right: Navigate between tabs
   * - Home: Jump to first tab
   * - End: Jump to last tab
   */
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      const newIndex = (currentIndex + direction + TABS.length) % TABS.length;
      const newTabId = TABS[newIndex].id;
      handleTabSelect(newTabId);
      
      // Focus the new tab
      setTimeout(() => {
        const newTabButton = document.getElementById(`tab-${newTabId}`);
        newTabButton?.focus();
      }, 0);
    } else if (e.key === 'Home') {
      e.preventDefault();
      handleTabSelect(TABS[0].id);
      setTimeout(() => document.getElementById(`tab-${TABS[0].id}`)?.focus(), 0);
    } else if (e.key === 'End') {
      e.preventDefault();
      const lastTab = TABS[TABS.length - 1];
      handleTabSelect(lastTab.id);
      setTimeout(() => document.getElementById(`tab-${lastTab.id}`)?.focus(), 0);
    }
  }, []);

  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
    refetch: refetchStats,
    error: statsError,
  } = useQuery<UserStats, Error>({
    queryKey: ['user-profile-stats'],
    queryFn: () => imageApi.userStats(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: queriesEnabled,
    retry: 1,
    staleTime: 5000,
  });

  const {
    data: uploads,
    isLoading: uploadsLoading,
    isFetching: uploadsFetching,
    refetch: refetchUploads,
    error: uploadsError,
  } = useQuery<UserUpload[], Error>({
    queryKey: ['user-profile-uploads'],
    queryFn: () => imageApi.userUploads(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: queriesEnabled,
    retry: 1,
    staleTime: 5000,
  });
  const isRefreshing = statsFetching || uploadsFetching;
  const safeStats = stats ?? defaultStats;
  // Only show error banner if authenticated and it's not a 401 (auth errors are handled by AuthProvider)
  const shouldShowStatsError = isAuthenticated && !!statsError && !statsLoading && queriesEnabled &&
    !statsError.message.includes('401') && !statsError.message.includes('Unauthorized');
  const shouldShowUploadsError = isAuthenticated && !!uploadsError && !uploadsLoading && queriesEnabled &&
    !uploadsError.message.includes('401') && !uploadsError.message.includes('Unauthorized');

  // Analytics query (must be before early returns due to Rules of Hooks)
  const {
    data: analyticsData,
    isLoading: analyticsLoading,
  } = useQuery({
    queryKey: ['user-analytics', 30],
    queryFn: async () => {
      const response = await fetch(getApiUrl('/api/user/analytics?days=30'), {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    enabled: queriesEnabled && activeTab === 'analytics',
    staleTime: 60000,
  });

  // Compute stat summary (must be before early returns due to Rules of Hooks)
  const statSummary = useMemo(() => {
    if (!safeStats) {
      return [];
    }
    const totalUploads = typeof safeStats.total_uploads === 'number' ? safeStats.total_uploads : 0;
    const approvalRate = typeof safeStats.approval_rate === 'number' ? safeStats.approval_rate : 0;
    const impactScore =
      typeof safeStats.impact_score === 'number' && Number.isFinite(safeStats.impact_score) ? safeStats.impact_score : null;
    const uploadsThisMonth = safeStats.analytics?.uploads_this_month ?? 0;

    return [
      {
        label: 'Total Uploads',
        value: totalUploads.toLocaleString(),
        change: `${uploadsThisMonth.toLocaleString()} in the last 30 days`,
      },
      {
        label: 'Approval Rate',
        value: `${Math.round(approvalRate * 100)}%`,
        change: approvalRate > 0.8 ? 'Consistent quality' : 'Aim for 80%',
      },
      {
        label: 'Impact Score',
        value: impactScore !== null ? impactScore.toFixed(1) : '—',
        change: 'Based on approvals and recency',
      },
    ];
  }, [safeStats]);

  useEffect(() => {
    return () => {
      transitionTimers.current.forEach((timerId) => clearTimeout(timerId));
      transitionTimers.current = [];
    };
  }, []);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-deep-900 via-deep-800 to-deep-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-pacific-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-surface-soft/70">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render profile if not authenticated (will redirect via useEffect)
  if (!isAuthenticated) {
    return null;
  }

  const renderUploads = () => {
    return <InfiniteUploadList enabled={activeTab === 'uploads'} />;
  };

  const renderAchievements = () => {
    if (!safeStats?.achievements?.length) {
      return (
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-white/70">
          {statsLoading ? 'Loading achievements...' : 'Achievements will appear as you contribute more assessments.'}
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {safeStats.achievements.map((achievement, index) => {
          const total = achievement.total ?? 0;
          const progressValue = achievement.progress ?? 0;
          const progressPct = total > 0 ? Math.min(100, Math.round((progressValue / total) * 100)) : achievement.unlocked ? 100 : 0;
          const unlocked = Boolean(achievement.unlocked);

          return (
            <Card key={achievement.id} className={`${glassCard} border-white/5`}>
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-pacific-500/20 p-3 text-3xl">{achievement.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-pacific-200">
                      {unlocked ? 'Unlocked' : 'In Progress'}
                    </p>
                    {!unlocked && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
                        {progressPct}% complete
                      </span>
                    )}
                  </div>
                  <h4 className="text-xl font-bold text-white">{achievement.title}</h4>
                  <p className="mt-1 text-sm text-white/70">{achievement.description}</p>
                  <div className="mt-3">
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(2, Math.min(100, progressPct))}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-white/60">
                      <span>
                        {progressValue.toLocaleString()} / {total ? total.toLocaleString() : '—'}
                      </span>
                      {!unlocked && <span>{Math.max(0, (total || 0) - progressValue).toLocaleString()} to go</span>}
                      {unlocked && <span className="text-emerald-400 font-semibold">✓ Unlocked</span>}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderAnalytics = () => {
    // Avoid rendering analytics when the tab is inactive to prevent Recharts from sizing against hidden containers
    if (activeTab !== 'analytics') return null;
    return <UserAnalyticsReal />;
  };

  const handleManagePreferences = () => {
    router.push('/profile/settings');
  };

  const handleGenerateToken = () => {
    router.push('/profile/settings?section=api');
  };

  const renderSettings = () => (
    <div className="space-y-4">
      <Card className={`${glassCard} border-white/5`}>
        <h4 className="text-lg font-semibold text-white">Notification Preferences</h4>
        <p className="mt-1 text-sm text-white/60">Configure upload status updates and weekly summaries.</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4 bg-white/10 text-white hover:bg-white/20"
          onClick={handleManagePreferences}
        >
          Manage Preferences
        </Button>
      </Card>
      <Card className={`${glassCard} border-white/5`}>
        <h4 className="text-lg font-semibold text-white">API Access</h4>
        <p className="mt-1 text-sm text-white/60">
          Generate scoped tokens for integrating automation or bulk upload tooling.
        </p>
        <Button 
          variant='secondary' 
          size='sm' 
          className="mt-4 bg-white/10 text-white hover:bg-white/20"
          onClick={handleGenerateToken}
        >
          Generate Token
        </Button>
      </Card>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'uploads':
        return renderUploads();
      case 'activity':
        return <ActivityTimeline />;
      case 'achievements':
        return renderAchievements();
      case 'analytics':
        return (
          <PermissionGate
            permission="analytics:read"
            fallback={
              <ErrorBanner
                title="Analytics not available"
                message="You need reviewer or admin permissions to view analytics."
              />
            }
          >
            {renderAnalytics()}
          </PermissionGate>
        );
      case 'collaboration':
        return (
          <PermissionGate
            permission="collaboration:access"
            fallback={
              <ErrorBanner
                title="Collaboration not available"
                message="You need reviewer or admin permissions to access collaboration tools."
              />
            }
          >
            <Collaboration uploads={uploads || []} stats={safeStats} />
          </PermissionGate>
        );
      case 'settings':
        return renderSettings();
      default:
        return null;
    }
  };

  const handleTabSelect = (tabId: string) => {
    if (isLoading || tabId === activeTab) return;
    
    setIsLoading(true);
    setContentVisible(false);

    // Wait for fade out before changing content
    const fadeOutId = window.setTimeout(() => {
      setActiveTab(tabId);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tabId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });

      // Fade in new content
      const fadeInId = window.setTimeout(() => {
        setContentVisible(true);
        setIsLoading(false);
      }, 50);

      transitionTimers.current.push(fadeInId);
    }, 150);

    transitionTimers.current.push(fadeOutId);
  };

  const handleUploadClick = () => {
    router.push('/upload');
  };

  const handleRefresh = () => {
    refetchStats();
    refetchUploads();
  };

  return (
    <ErrorBoundary boundaryName="profile">
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 px-4 py-10 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl space-y-8">
        <Card className={`${glassCard} border-white/5 bg-gradient-to-br from-pacific-900/30 to-deep-900/40`}>
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-pacific-400 to-palm-400 p-1">
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-deep-950/70 text-3xl font-bold text-white">
                  {safeStats?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeStats.avatar_url}
                      alt={safeStats.name}
                      className="h-full w-full rounded-2xl object-cover"
                    />
                  ) : (
                    (safeStats?.name || 'U').slice(0, 1).toUpperCase()
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Impact Responder</p>
                <h1 className="text-3xl font-bold text-white">
                  {statsLoading ? 'Loading profile…' : safeStats?.name || 'Your profile'}
                </h1>
                <p className="text-sm text-white/70">
                  {safeStats?.organization || 'Independent'} • Active {safeStats?.last_active ? new Date(safeStats.last_active).toLocaleDateString() : 'recently'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                className="bg-white/10 text-white hover:bg-white/20"
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-busy={isRefreshing}
              >
                Refresh Data
              </Button>
              <PermissionGate
                permission="upload:create"
                fallback={null}
              >
                <Button
                  variant="primary"
                  className="bg-pacific-500 text-white hover:bg-pacific-400"
                  onClick={handleUploadClick}
                >
                  Upload New Image
                </Button>
              </PermissionGate>
            </div>
          </div>
        </Card>

        {(shouldShowStatsError || shouldShowUploadsError) && (
          <ErrorBanner
            title="We hit a snag loading your profile"
            message={statsError?.message || uploadsError?.message || 'Please try again in a moment.'}
            onRetry={handleRefresh}
          />
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {statSummary.map((stat) => (
            <Card key={stat.label} className={`${glassCard} border-white/5`}>
              <p className="text-sm text-white/60">{stat.label}</p>
              <p className="mt-2 text-4xl font-bold text-white">{statsLoading ? '—' : stat.value}</p>
              <p className="text-xs text-emerald-200">{stat.change}</p>
            </Card>
          ))}
        </div>

        {/* Desktop tabs */}
        <div className={`hidden md:block ${glassCard} border-white/5`}>
          <div 
            ref={tablistRef}
            className="flex flex-wrap border-b border-white/10" 
            role="tablist" 
            aria-label="Profile sections"
          >
            {TABS.map((tab, index) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabSelect(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                  id={`tab-${tab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.id}`}
                  disabled={isLoading}
                  data-testid={`profile-tab-${tab.id}`}
                  className={clsx(
                    'relative flex flex-1 items-center justify-center gap-2 px-4 py-3',
                    'text-sm font-semibold transition-all duration-200 min-h-[44px]',
                    'outline-none focus-visible:ring-2 focus-visible:ring-pacific-400',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-deep-900',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isActive 
                      ? 'bg-white/15 text-white' 
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  )}
                  aria-label={`${tab.label} section${isActive ? ', currently active' : ''}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                  {isActive && (
                    <span 
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-pacific-400 to-palm-400 animate-in slide-in-from-bottom-2 duration-300"
                      aria-hidden="true"
                      data-testid="active-tab-indicator"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div
            className={clsx(
              'p-6 transition-opacity duration-200',
              contentVisible ? 'opacity-100' : 'opacity-0'
            )}
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            tabIndex={0}
            data-testid={`profile-panel-${activeTab}`}
          >
            {renderTabContent()}
          </div>
        </div>

        {/* Mobile swipeable tabs */}
        <div className="block md:hidden">
          <SwipeableTabs 
            activeTab={activeTab} 
            onTabChange={handleTabSelect} 
            tabs={TABS}
          >
            <div
              className="p-4 pb-24"
              role="tabpanel"
              id={`panel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              tabIndex={0}
            >
              {renderTabContent()}
            </div>
          </SwipeableTabs>
        </div>

        {/* Mobile bottom navigation */}
        <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
          <MobileBottomNav 
            activeTab={activeTab} 
            onTabChange={handleTabSelect} 
            items={PROFILE_NAV_ITEMS} 
          />
        </div>

        {safeStats && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className={`${glassCard} border-white/5`}>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-10 w-10 text-pacific-300" />
                <div>
                  <p className="text-sm text-white/60">Review Confidence</p>
                  <p className="text-2xl font-semibold text-white">
                    {Math.round((safeStats.approval_rate || 0) * 100)}%
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-white/70">
                Consistent metadata quality keeps your approval rate high. Maintain detailed descriptions and accurate locations to stay above 90%.
              </p>
            </Card>

            <Card className={`${glassCard} border-white/5`}>
              <h3 className="text-lg font-semibold text-white">Tips to Increase Impact</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/70">
                <li>Batch your field uploads to keep reviewers efficient.</li>
                <li>Attach location context notes for complex incidents.</li>
                <li>Use the analytics tab to spot under-documented hazards.</li>
              </ul>
            </Card>
          </div>
        )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
