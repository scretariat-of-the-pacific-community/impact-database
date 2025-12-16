import type React from 'react';
import {
  BadgeCheck,
  BarChart3,
  Compass,
  Crown,
  Flame,
  Globe2,
  Medal,
  ShieldCheck,
  Upload,
} from 'lucide-react';

export interface Notification {
  id: string;
  title: string;
  timestamp: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface Achievement {
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

export interface LeaderboardEntry {
  id: string;
  name: string;
  uploads: number;
  badges: number;
  rank: number;
}

export const achievements: Achievement[] = [
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

export const leaderboard: LeaderboardEntry[] = [
  { id: '1', name: 'Lena M.', uploads: 182, badges: 9, rank: 1 },
  { id: '2', name: 'You', uploads: 134, badges: 7, rank: 2 },
  { id: '3', name: 'Alex M.', uploads: 118, badges: 6, rank: 3 },
  { id: '4', name: 'Saeed', uploads: 94, badges: 5, rank: 4 },
  { id: '5', name: 'Priya', uploads: 88, badges: 4, rank: 5 },
];

export const notifications: Notification[] = [
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

export const categoryStyles: Record<Achievement['category'], string> = {
  Contributor: 'from-pacific-500/20 to-pacific-500/5 border-pacific-500/30',
  Explorer: 'from-sand-500/20 to-sand-500/5 border-sand-500/30',
  'Quality Champion': 'from-coral-500/20 to-coral-500/5 border-coral-500/30',
  Specialist: 'from-palm-500/20 to-palm-500/5 border-palm-500/30',
};

export const textSeparator = ' • ';

