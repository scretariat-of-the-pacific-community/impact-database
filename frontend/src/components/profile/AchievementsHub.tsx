'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  Compass,
  Crown,
  Flame,
  Globe2,
  Medal,
  Share2,
  ShieldCheck,
  Star,
  Upload,
} from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  timestamp: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Achievement {
  id: string;
  name: string;
  category: 'Contributor' | 'Explorer' | 'Quality Champion' | 'Specialist';
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  progress: number;
  target: number;
  milestoneLabel: string;
  unlocked: boolean;
  nextMilestone: string;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  uploads: number;
  badges: number;
  rank: number;
}

const achievements: Achievement[] = [
  {
    id: 'contributor-10',
    name: 'Active Contributor',
    category: 'Contributor',
    description: 'Reach 10 verified uploads to inspire the community.',
    icon: Upload,
    progress: 8,
    target: 10,
    milestoneLabel: 'Uploads',
    unlocked: false,
    nextMilestone: '2 more uploads to reach Bronze Contributor',
  },
  {
    id: 'contributor-50',
    name: 'Impact Architect',
    category: 'Contributor',
    description: 'Share 50 high-quality uploads with metadata.',
    icon: Medal,
    progress: 26,
    target: 50,
    milestoneLabel: 'Uploads',
    unlocked: false,
    nextMilestone: 'Upload 24 more items for Silver status',
  },
  {
    id: 'explorer-5',
    name: 'Regional Explorer',
    category: 'Explorer',
    description: 'Cover 5 distinct countries with disaster imagery.',
    icon: Globe2,
    progress: 5,
    target: 5,
    milestoneLabel: 'Countries mapped',
    unlocked: true,
    nextMilestone: 'Next: Continental Voyager at 10 countries',
  },
  {
    id: 'explorer-continents',
    name: 'Continental Voyager',
    category: 'Explorer',
    description: 'Contribute imagery across three continents.',
    icon: Compass,
    progress: 2,
    target: 3,
    milestoneLabel: 'Continents reached',
    unlocked: false,
    nextMilestone: 'Visit 1 more continent for unlock',
  },
  {
    id: 'quality-95',
    name: 'Quality Champion',
    category: 'Quality Champion',
    description: 'Maintain a 95% approval rate across reviews.',
    icon: ShieldCheck,
    progress: 93,
    target: 95,
    milestoneLabel: 'Approval rate',
    unlocked: false,
    nextMilestone: 'Improve approval rate by 2% to unlock',
  },
  {
    id: 'quality-100',
    name: 'Perfect Steward',
    category: 'Quality Champion',
    description: 'Sustain 100 approved uploads in a row.',
    icon: BadgeCheck,
    progress: 64,
    target: 100,
    milestoneLabel: 'Approved streak',
    unlocked: false,
    nextMilestone: '36 approvals away from flawless streak',
  },
  {
    id: 'specialist-flood',
    name: 'Flood Specialist',
    category: 'Specialist',
    description: 'Catalog 30 high-signal flood impact scenes.',
    icon: BarChart3,
    progress: 30,
    target: 30,
    milestoneLabel: 'Flood uploads',
    unlocked: true,
    nextMilestone: 'Eligible for community spotlight',
  },
  {
    id: 'specialist-wildfire',
    name: 'Wildfire Analyst',
    category: 'Specialist',
    description: 'Document 25 wildfire hazard assessments.',
    icon: Flame,
    progress: 14,
    target: 25,
    milestoneLabel: 'Wildfire uploads',
    unlocked: false,
    nextMilestone: '11 more wildfire uploads for badge',
  },
];

const leaderboard: LeaderboardEntry[] = [
  { id: '1', name: 'Lena M.', uploads: 182, badges: 9, rank: 1 },
  { id: '2', name: 'You', uploads: 134, badges: 7, rank: 2 },
  { id: '3', name: 'Alex M.', uploads: 118, badges: 6, rank: 3 },
  { id: '4', name: 'Saeed', uploads: 94, badges: 5, rank: 4 },
  { id: '5', name: 'Priya', uploads: 88, badges: 4, rank: 5 },
];

const notifications: Notification[] = [
  {
    id: 'n1',
    title: 'Unlocked: Regional Explorer',
    timestamp: 'Today, 09:45',
    description: 'You mapped your fifth country and unlocked a new Explorer badge.',
    icon: Compass,
  },
  {
    id: 'n2',
    title: 'Leaderboard surge',
    timestamp: 'Yesterday, 16:20',
    description: 'Two new uploads helped you climb to rank #2 among contributors.',
    icon: Crown,
  },
  {
    id: 'n3',
    title: 'Quality streak at 90%',
    timestamp: 'Mon, 14:10',
    description: 'Review feedback shows a 90% approval streak—keep aiming for 95%.',
    icon: ShieldCheck,
  },
];

const categoryStyles: Record<Achievement['category'], string> = {
  Contributor: 'from-pacific-500/20 to-pacific-500/5 border-pacific-500/30',
  Explorer: 'from-sand-500/20 to-sand-500/5 border-sand-500/30',
  'Quality Champion': 'from-coral-500/20 to-coral-500/5 border-coral-500/30',
  Specialist: 'from-palm-500/20 to-palm-500/5 border-palm-500/30',
};

const springTransition = {
  type: 'spring',
  stiffness: 260,
  damping: 20,
};

const badgeSeparator = ' • ';
const shareUrl = process.env.NEXT_PUBLIC_SHARE_URL || 'https://impactdatabase.org';
const unlockedAnimation = { scale: [0.8, 1.1, 1], rotate: [0, 5, 0] };
const lockedAnimation = { scale: 1, rotate: 0 };

/**
 * Optional data inputs for AchievementsHub. Each collection defaults to static example data
 * (`achievements`, `leaderboard`, and `notifications`) but can be replaced with live data when
 * embedding in a profile view.
 */
interface AchievementsHubProps {
  achievementsData?: Achievement[];
  leaderboardData?: LeaderboardEntry[];
  notificationsData?: Notification[];
}

/**
 * AchievementsHub renders the achievements experience including badge progress, leaderboard ranking,
 * notification timeline, and social sharing. Consumers can supply custom data for each section; if no
 * data is provided, the component falls back to static showcase examples.
 */
export default function AchievementsHub({
  achievementsData = achievements,
  leaderboardData = leaderboard,
  notificationsData = notifications,
}: AchievementsHubProps) {
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const unlockedBadges = achievementsData.filter((achievement) => achievement.unlocked);
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setReducedMotion(false);
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);

    mediaQuery.addEventListener('change', handleChange);
    setReducedMotion(mediaQuery.matches);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [prefersReducedMotion]);

  /**
   * Shares an achievement badge using the most appropriate method for the user's platform.
   *
   * Attempts to use the Web Share API when available (supported browsers/devices). If unavailable, opens
   * a Twitter intent in a new tab so users can still share their achievement. Provides user-facing feedback
   * when sharing fails.
   */
  const shareBadge = useCallback((achievement: Achievement) => {
    const shareText = `I unlocked the ${achievement.name} badge on the Impact Database!`;

    if (navigator.share) {
      navigator
        .share({
          title: 'Impact Database Achievement',
          text: shareText,
          url: shareUrl,
        })
        .then(() => setShareStatus(`Shared ${achievement.name}!`))
        .catch((error) => {
          console.error(`Share failed for achievement "${achievement.name}" (ID: ${achievement.id})`, error);
          setShareStatus(`Unable to share ${achievement.name}. Please try again.`);
        });
      return;
    }

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      shareText,
    )}&url=${encodeURIComponent(shareUrl)}`;
    const popup = window.open(twitterUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      setShareStatus(`Unable to open sharing for ${achievement.name}. Please check your popup settings.`);
    } else {
      setShareStatus(`Opened Twitter to share ${achievement.name}.`);
    }
  }, []);

  const cardTransition = reducedMotion ? { duration: 0 } : springTransition;
  const badgeHover = reducedMotion ? undefined : { y: -4, scale: 1.02 };
  const badgeTap = reducedMotion ? undefined : { scale: 0.98 };

  return (
    <section
      className="mx-auto max-w-7xl space-y-10 p-6"
      data-prefers-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-pacific-500/10 via-white/5 to-black/20 p-8 shadow-lg">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-white/60">Achievements & badges</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Progress that celebrates impact</h1>
            <p className="mt-3 max-w-3xl text-white/70">
              Track your contribution milestones, unlock animated badges across categories, and see how you rank among the
              most active contributors.
            </p>
          </div>
          <nav aria-label="Share unlocked achievements" aria-live="polite" aria-atomic="true" className="flex gap-4">
            {unlockedBadges.map((badge) => (
              <motion.button
                key={badge.id}
                whileHover={badgeHover}
                whileTap={badgeTap}
                onClick={() => shareBadge(badge)}
                className="group flex items-center gap-2 rounded-full border border-pacific-500/40 bg-pacific-500/10 px-4 py-2 text-sm text-white shadow-lg backdrop-blur"
                aria-label={`Share ${badge.name}`}
              >
                <Share2 className="h-4 w-4 text-pacific-300 group-hover:rotate-6" />
                Share {badge.name}
              </motion.button>
            ))}
            {shareStatus && (
              <p role="status" className="text-sm text-white/70">
                {shareStatus}
              </p>
            )}
          </nav>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Badge Showcase</p>
              <h2 className="text-2xl font-semibold text-white">Animated unlocks & progress</h2>
            </div>
            <ul className="flex gap-3 text-xs text-white/70" aria-label="Badge categories">
              {[
                { label: 'Contributor', color: 'bg-pacific-400', initial: 'C' },
                { label: 'Explorer', color: 'bg-sand-400', initial: 'E' },
                { label: 'Quality', color: 'bg-coral-400', initial: 'Q' },
                { label: 'Specialist', color: 'bg-palm-400', initial: 'S' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-1">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${item.color} text-[10px] font-semibold text-black/80`}
                    aria-hidden="true"
                  >
                    {item.initial}
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {achievementsData.map((achievement, index) => {
                const progressPct = Math.min(100, Math.round((achievement.progress / achievement.target) * 100));
                const CategoryIcon = achievement.icon;
                const badgeGradient = categoryStyles[achievement.category];
                const iconAnimation = achievement.unlocked && !reducedMotion ? unlockedAnimation : lockedAnimation;
                const cardInitial = reducedMotion ? undefined : { opacity: 0, y: 24, scale: 0.98 };
                const cardAnimate = reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 };
                const cardExit = reducedMotion ? undefined : { opacity: 0, y: 20 };

                return (
                  <motion.div
                    key={achievement.id}
                    layout
                    initial={cardInitial}
                    animate={cardAnimate}
                    exit={cardExit}
                    transition={{ ...cardTransition, delay: reducedMotion ? 0 : index * 0.05 }}
                    role="article"
                    aria-label={`${achievement.name} achievement card`}
                    className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${badgeGradient} p-5 shadow-lg`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-white/5 opacity-0 transition group-hover:opacity-100" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <motion.div
                        initial={achievement.unlocked && !reducedMotion ? { scale: 0.8 } : undefined}
                        animate={iconAnimation}
                          transition={cardTransition}
                          className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/30 text-white"
                          aria-label={`${achievement.category} badge icon`}
                        >
                          <CategoryIcon className="h-6 w-6" />
                        </motion.div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">{achievement.name}</h3>
                            {achievement.unlocked && (
                              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-pacific-100">
                                <Star className="h-3 w-3" /> Unlocked
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-white/70">{achievement.description}</p>
                          <p className="mt-1 text-xs text-white/60">{achievement.category}{badgeSeparator}{achievement.milestoneLabel}</p>
                        </div>
                      </div>
                      <div className="text-right text-sm text-white/70">
                        <p className="text-xl font-semibold text-white">{achievement.progress}/{achievement.target}</p>
                        <p>{progressPct}%</p>
                      </div>
                    </div>

                    <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                      <motion.div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPct}
                        aria-label={`${achievement.name} progress`}
                        className="h-full rounded-full bg-gradient-to-r from-pacific-400 to-palm-400"
                        initial={reducedMotion ? false : { width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={cardTransition}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                      <span>{achievement.nextMilestone}</span>
                      <span>Next: {Math.max(0, achievement.target - achievement.progress)} remaining</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-black/40 p-5 shadow-lg">
            <div className="flex items-center gap-2 text-white">
              <Crown className="h-5 w-5 text-palm-300" aria-hidden="true" />
              <div>
                <p className="text-sm text-white/70">Leaderboard</p>
                <h3 className="text-lg font-semibold">Contributor rank</h3>
              </div>
            </div>
            <ol className="mt-4 space-y-3" aria-label="Contributor leaderboard">
              {leaderboardData.map((entry) => (
                <motion.li
                  key={entry.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={springTransition}
                  className={`flex items-center justify-between rounded-xl border border-white/5 p-3 text-sm text-white ${
                    entry.name === 'You' ? 'bg-pacific-500/10 shadow-md shadow-pacific-500/10' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-base font-semibold">
                      #{entry.rank}
                    </div>
                    <div>
                      <p className="font-semibold">{entry.name}</p>
                      <p className="text-xs text-white/60">{entry.uploads} uploads{badgeSeparator}{entry.badges} badges</p>
                    </div>
                  </div>
                  <Award className="h-4 w-4 text-pacific-200" aria-hidden="true" />
                </motion.li>
              ))}
            </ol>
          </div>

          <div
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-pacific-500/10 to-pacific-900/10 p-5 shadow-lg"
            aria-label="Achievement timeline"
          >
            <div className="flex items-center gap-2 text-white">
              <Bell className="h-5 w-5 text-coral-200" aria-hidden="true" />
              <div>
                <p className="text-sm text-white/70">Notification Center</p>
                <h3 className="text-lg font-semibold">Achievement timeline</h3>
              </div>
            </div>
            <ol className="mt-4 space-y-4">
              {notificationsData.map((notification, idx) => {
                const IconComponent = notification.icon;
                return (
                  <motion.li
                    key={notification.id}
                    initial={reducedMotion ? undefined : { opacity: 0, x: -8 }}
                    animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
                    transition={{ ...cardTransition, delay: reducedMotion ? 0 : idx * 0.05 }}
                    className="flex gap-3 rounded-xl bg-white/5 p-3 text-white"
                  >
                    <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg bg-black/30">
                      <IconComponent className="h-5 w-5 text-pacific-200" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{notification.title}</p>
                        <span className="text-xs text-white/60">{notification.timestamp}</span>
                      </div>
                      <p className="text-sm text-white/70">{notification.description}</p>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

