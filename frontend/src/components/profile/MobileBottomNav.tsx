'use client';

import { motion } from 'framer-motion';
import {
  Upload,
  Activity,
  Award,
  BarChart3,
  Settings,
  LucideIcon,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  items: NavItem[];
}

export default function MobileBottomNav({
  activeTab,
  onTabChange,
  items,
}: MobileBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      role="navigation"
      aria-label="Mobile profile navigation"
    >
      <div className="bg-deep-900/95 backdrop-blur-lg border-t border-white/10 shadow-2xl">
        <div className="flex items-center justify-around px-2 py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`relative flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl transition-all ${
                  isActive
                    ? 'text-pacific-400'
                    : 'text-white/60 active:bg-white/10'
                }`}
                aria-label={`${item.label} tab`}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute inset-0 bg-pacific-500/20 rounded-xl"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon
                  className={`h-5 w-5 mb-0.5 relative z-10 ${isActive ? 'text-pacific-400' : ''}`}
                />
                <span
                  className={`text-[10px] font-medium relative z-10 ${isActive ? 'text-pacific-300' : ''}`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export const PROFILE_NAV_ITEMS: NavItem[] = [
  { id: 'uploads', label: 'Uploads', icon: Upload },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'achievements', label: 'Awards', icon: Award },
  { id: 'analytics', label: 'Stats', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];
