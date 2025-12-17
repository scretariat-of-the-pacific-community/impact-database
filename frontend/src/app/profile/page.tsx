'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UploadCloud, Award, Activity, Settings, MapPin, ShieldCheck, Users } from 'lucide-react';
import { imageApi } from '@/lib/api';
import { HAZARD_TYPE_LABELS, UserStats, UserUpload } from '@/lib/types';
import { Card, Button } from '@/components/design-system';
import ActivityTimeline from '@/components/profile/ActivityTimeline';
import Collaboration from '@/components/profile/Collaboration';
import MobileBottomNav, { PROFILE_NAV_ITEMS } from '@/components/profile/MobileBottomNav';
import SwipeableTabs from '@/components/profile/SwipeableTabs';
import InfiniteUploadList from '@/components/profile/InfiniteUploadList';
import ErrorBanner from '@/components/ErrorBanner';

const TABS = [
  { id: 'uploads', label: 'Uploads', icon: UploadCloud },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'collaboration', label: 'Collaboration', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const glassCard = 'rounded-3xl border border-white/10 bg-white/5 backdrop-blur shadow-xl';

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('uploads');
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
  });
  const isRefreshing = statsFetching || uploadsFetching;
  const shouldShowStatsError = !!statsError && !statsLoading && queriesEnabled;

  // Debug logging
  useEffect(() => {
    console.log('Profile Debug:', {
      authLoading,
      isAuthenticated,
      queriesEnabled,
      uploadsLoading,
      uploadsError: uploadsError?.message,
      uploadsCount: uploads?.length,
      activeTab,
    });
  }, [authLoading, isAuthenticated, queriesEnabled, uploadsLoading, uploadsError, uploads, activeTab]);

  // Compute stat summary (must be before early returns due to Rules of Hooks)
  const statSummary = useMemo(() => {
    if (!stats) {
      return [];
    }
    const totalUploads = typeof stats.total_uploads === 'number' ? stats.total_uploads : 0;
    const approvalRate = typeof stats.approval_rate === 'number' ? stats.approval_rate : 0;
    const impactScore =
      typeof stats.impact_score === 'number' && Number.isFinite(stats.impact_score) ? stats.impact_score : null;
    const uploadsThisMonth = stats.analytics?.uploads_this_month ?? 0;

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
  }, [stats]);

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

  // Don't render profile if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  const renderUploads = () => {
    return <InfiniteUploadList />;
  };

  const renderAchievements = () => {
    if (!stats?.achievements?.length) {
      return (
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-white/70">
          Achievements will appear as you contribute more assessments.
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.achievements.map((achievement) => (
          <Card key={achievement.id} className={`${glassCard} border-white/5`}>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-pacific-500/20 p-3 text-3xl">{achievement.icon}</div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-pacific-200">Unlocked</p>
                <h4 className="text-xl font-bold text-white">{achievement.title}</h4>
                <p className="mt-1 text-sm text-white/70">{achievement.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderAnalytics = () => {
    if (!stats?.analytics) {
      return null;
    }

    const { uploads_this_month, average_review_time, top_hazard } = stats.analytics;

    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={`${glassCard} border-white/5`}>
          <p className="text-sm text-white/60">Uploads (30d)</p>
          <p className="mt-2 text-3xl font-bold text-white">{uploads_this_month}</p>
          <p className="text-xs text-white/50">Outperforms 72% of responders</p>
        </Card>
        <Card className={`${glassCard} border-white/5`}>
          <p className="text-sm text-white/60">Avg. Review Time</p>
          <p className="mt-2 text-3xl font-bold text-white">{average_review_time}h</p>
          <p className="text-xs text-white/50">From upload to approval</p>
        </Card>
        <Card className={`${glassCard} border-white/5`}>
          <p className="text-sm text-white/60">Top Hazard</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {HAZARD_TYPE_LABELS[top_hazard as keyof typeof HAZARD_TYPE_LABELS] || top_hazard}
          </p>
          <p className="text-xs text-white/50">Most documented category</p>
        </Card>
      </div>
    );
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
        return renderAnalytics();
      case 'collaboration':
        return <Collaboration uploads={uploads || []} stats={stats} />;
      case 'settings':
        return renderSettings();
      default:
        return null;
    }
  };

  const handleTabSelect = (tabId: string) => {
    setActiveTab(tabId);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleUploadClick = () => {
    router.push('/upload');
  };

  const handleRefresh = () => {
    refetchStats();
    refetchUploads();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 px-4 py-10 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <Card className={`${glassCard} border-white/5 bg-gradient-to-br from-pacific-900/30 to-deep-900/40`}>
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-pacific-400 to-palm-400 p-1">
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-deep-950/70 text-3xl font-bold text-white">
                  {stats?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={stats.avatar_url}
                      alt={stats.name}
                      className="h-full w-full rounded-2xl object-cover"
                    />
                  ) : (
                    (stats?.name || 'U').slice(0, 1).toUpperCase()
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Impact Responder</p>
                <h1 className="text-3xl font-bold text-white">
                  {statsLoading ? 'Loading profile…' : stats?.name || 'Your profile'}
                </h1>
                <p className="text-sm text-white/70">
                  {stats?.organization || 'Independent'} • Active {stats?.last_active ? new Date(stats.last_active).toLocaleDateString() : 'recently'}
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
              <Button
                variant="primary"
                className="bg-pacific-500 text-white hover:bg-pacific-400"
                onClick={handleUploadClick}
              >
                Upload New Image
              </Button>
            </div>
          </div>
        </Card>

        {shouldShowStatsError && (
          <ErrorBanner
            title="Unable to load profile insights"
            message={statsError?.message || 'Please try again in a moment.'}
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
          <div className="flex flex-wrap border-b border-white/10">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabSelect(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="p-6">{renderTabContent()}</div>
        </div>

        {/* Mobile swipeable tabs */}
        <div className="block md:hidden">
          <SwipeableTabs 
            activeTab={activeTab} 
            onTabChange={handleTabSelect} 
            tabs={TABS}
          >
            <div className="p-4 pb-24">{renderTabContent()}</div>
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

        {stats && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className={`${glassCard} border-white/5`}>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-10 w-10 text-pacific-300" />
                <div>
                  <p className="text-sm text-white/60">Review Confidence</p>
                  <p className="text-2xl font-semibold text-white">
                    {Math.round((stats.approval_rate || 0) * 100)}%
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
  );
}
