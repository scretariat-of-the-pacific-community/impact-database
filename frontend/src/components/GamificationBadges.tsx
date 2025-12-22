'use client';

import { motion } from 'framer-motion';
import { Award, Star, Upload, CheckCircle, TrendingUp, Zap, Target, Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { imageApi } from '@/lib/api';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  requirement: string;
  unlocked: boolean;
  progress?: number;
  maxProgress?: number;
}

interface ContributorStats {
  totalUploads: number;
  reviewedImages: number;
  qualityScore: number;
  streak: number;
}

export default function GamificationBadges() {
  // Fetch real user stats from API
  const { data: stats = {
    totalUploads: 0,
    reviewedImages: 0,
    qualityScore: 0,
    streak: 0,
  }, isLoading } = useQuery<ContributorStats>({
    queryKey: ['contributor-stats'],
    queryFn: async () => {
      try {
        const stats = await imageApi.userStats();
        const totalUploads =
          (stats as any)?.uploads ??
          (stats as any)?.total_uploads ??
          (stats as any)?.totalUploads ?? 0;
        return {
          totalUploads: typeof totalUploads === 'number' ? totalUploads : Number(totalUploads) || 0,
          reviewedImages: 0,
          qualityScore: 0,
          streak: 0,
        };
      } catch (error) {
        // Silently return default stats if not authenticated or fetch fails
        return {
          totalUploads: 0,
          reviewedImages: 0,
          qualityScore: 0,
          streak: 0,
        };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry if not authenticated
    meta: {
      // Suppress error logging for this query since endpoint may not exist
      errorMessage: 'User stats endpoint not yet implemented',
    },
  });

  const badges: Badge[] = [
    {
      id: 'first-upload',
      name: 'First Steps',
      description: 'Upload your first disaster image',
      icon: Upload,
      color: 'from-pacific-500/20 to-pacific-500/5 text-pacific-400',
      requirement: '1 upload',
      unlocked: stats.totalUploads >= 1,
      progress: Math.min(stats.totalUploads, 1),
      maxProgress: 1,
    },
    {
      id: 'contributor',
      name: 'Active Contributor',
      description: 'Share 10 verified images',
      icon: Star,
      color: 'from-palm-500/20 to-palm-500/5 text-palm-400',
      requirement: '10 uploads',
      unlocked: stats.totalUploads >= 10,
      progress: Math.min(stats.totalUploads, 10),
      maxProgress: 10,
    },
    {
      id: 'quality-champion',
      name: 'Quality Champion',
      description: 'Maintain 95% approval rate',
      icon: Award,
      color: 'from-coral-500/20 to-coral-500/5 text-coral-400',
      requirement: '95% quality',
      unlocked: stats.qualityScore >= 95,
      progress: stats.qualityScore,
      maxProgress: 100,
    },
    {
      id: 'reviewer',
      name: 'Trusted Reviewer',
      description: 'Review 50 community submissions',
      icon: CheckCircle,
      color: 'from-sand-500/20 to-sand-500/5 text-sand-400',
      requirement: '50 reviews',
      unlocked: stats.reviewedImages >= 50,
      progress: Math.min(stats.reviewedImages, 50),
      maxProgress: 50,
    },
    {
      id: 'streak-master',
      name: 'Consistency Master',
      description: '7-day contribution streak',
      icon: TrendingUp,
      color: 'from-pacific-500/20 to-pacific-500/5 text-pacific-400',
      requirement: '7 day streak',
      unlocked: stats.streak >= 7,
      progress: Math.min(stats.streak, 7),
      maxProgress: 7,
    },
    {
      id: 'impact-hero',
      name: 'Impact Hero',
      description: 'Upload 100 georeferenced images',
      icon: Zap,
      color: 'from-palm-500/20 to-palm-500/5 text-palm-400',
      requirement: '100 uploads',
      unlocked: stats.totalUploads >= 100,
      progress: Math.min(stats.totalUploads, 100),
      maxProgress: 100,
    },
    {
      id: 'metadata-expert',
      name: 'Metadata Expert',
      description: 'Complete ISO 19115 compliance on 20 images',
      icon: Target,
      color: 'from-coral-500/20 to-coral-500/5 text-coral-400',
      requirement: '20 complete',
      unlocked: false,
      progress: 0,
      maxProgress: 20,
    },
    {
      id: 'guardian',
      name: 'Data Guardian',
      description: 'Help validate 200 community uploads',
      icon: Shield,
      color: 'from-sand-500/20 to-sand-500/5 text-sand-400',
      requirement: '200 reviews',
      unlocked: false,
      progress: Math.min(stats.reviewedImages, 200),
      maxProgress: 200,
    },
  ];

  return (
    <section className="mx-auto max-w-7xl py-16">
      <div className="mb-8 text-center">
        <Award className="mx-auto mb-4 h-12 w-12 text-pacific-400" />
        <p className="text-sm uppercase tracking-wide text-white/70">Recognition</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Contributor Achievements</h2>
        <p className="mx-auto mt-4 max-w-2xl text-white/70">
          Earn badges by contributing quality disaster imagery and helping validate community uploads
        </p>
      </div>

      {/* Progress Overview */}
      <div className="mb-12 grid gap-6 md:grid-cols-4">
        <motion.div
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-pacific-500/10 to-pacific-500/5 p-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Upload className="mb-2 h-6 w-6 text-pacific-400" />
          <p className="text-3xl font-bold text-white">{stats.totalUploads}</p>
          <p className="text-sm text-white/70">Total Uploads</p>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-palm-500/10 to-palm-500/5 p-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          <CheckCircle className="mb-2 h-6 w-6 text-palm-400" />
          <p className="text-3xl font-bold text-white">{stats.reviewedImages}</p>
          <p className="text-sm text-white/70">Reviews Completed</p>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-coral-500/10 to-coral-500/5 p-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <Star className="mb-2 h-6 w-6 text-coral-400" />
          <p className="text-3xl font-bold text-white">{stats.qualityScore}%</p>
          <p className="text-sm text-white/70">Quality Score</p>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-sand-500/10 to-sand-500/5 p-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <TrendingUp className="mb-2 h-6 w-6 text-sand-400" />
          <p className="text-3xl font-bold text-white">{stats.streak}</p>
          <p className="text-sm text-white/70">Day Streak</p>
        </motion.div>
      </div>

      {/* Badge Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {badges.map((badge, index) => (
          <motion.div
            key={badge.id}
            className={`rounded-2xl border border-white/10 bg-gradient-to-br ${badge.color} p-6 ${
              !badge.unlocked && 'opacity-60'
            }`}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: badge.unlocked ? 1 : 0.6, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
          >
            <div className="mb-4 flex items-start justify-between">
              <div className={`rounded-full bg-white/10 p-3 ${badge.unlocked && 'ring-2 ring-white/20'}`}>
                <badge.icon className="h-6 w-6" />
              </div>
              {badge.unlocked && (
                <CheckCircle className="h-5 w-5 text-palm-400" />
              )}
            </div>

            <h3 className="font-semibold text-white">{badge.name}</h3>
            <p className="mt-2 text-sm text-white/70">{badge.description}</p>
            <p className="mt-3 text-xs text-white/50">{badge.requirement}</p>

            {/* Progress Bar */}
            {!badge.unlocked && badge.progress !== undefined && badge.maxProgress && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-pacific-400 to-palm-400"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(badge.progress / badge.maxProgress) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 + 0.2, duration: 0.5 }}
                  />
                </div>
                <p className="mt-1 text-xs text-white/50">
                  {badge.progress} / {badge.maxProgress}
                </p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Call to Action */}
      <motion.div
        className="mt-12 rounded-3xl border border-white/10 bg-gradient-to-br from-pacific-500/20 to-coral-500/10 p-8 text-center backdrop-blur"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <Zap className="mx-auto mb-4 h-12 w-12 text-pacific-400" />
        <h3 className="text-2xl font-semibold text-white">Start Your Impact Journey</h3>
        <p className="mx-auto mt-4 max-w-2xl text-white/70">
          Upload your first disaster image to unlock achievements and join a community of 150+ contributors
          building climate resilience across the Pacific
        </p>
        <Link href="/upload" className="mt-6 inline-flex items-center gap-2 rounded-full bg-palm-600 px-8 py-3 font-semibold text-white shadow-lg shadow-palm-600/30 transition hover:bg-palm-500 hover:shadow-xl hover:shadow-palm-500/40">
          <Upload className="h-5 w-5" />
          Upload Image
        </Link>
      </motion.div>
    </section>
  );
}
