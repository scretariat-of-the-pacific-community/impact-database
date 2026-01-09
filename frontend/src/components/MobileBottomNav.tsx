'use client';

import { Home, Search, Upload, User, MapPin, Shield } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/providers/auth-provider';

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  requiresRole?: string[];
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { isAuthenticated, hasRole } = useAuth();

  const navItems: NavItem[] = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/search', icon: Search, label: 'Search' },
    { href: '/upload', icon: Upload, label: 'Upload' },
    { href: '/map', icon: MapPin, label: 'Map' },
    // Show Admin Portal instead of Profile for admin/reviewer users
    ...(isAuthenticated && (hasRole('admin') || hasRole('reviewer'))
      ? [{ href: '/curation', icon: Shield, label: 'Admin' }]
      : []),
    { href: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-deep-900/95 backdrop-blur-xl md:hidden">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition"
              >
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl bg-pacific-500/20"
                    layoutId="mobile-nav-indicator"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <Icon
                  className={`relative z-10 h-5 w-5 transition ${
                    isActive ? 'text-pacific-400' : 'text-white/60'
                  }`}
                />
                <span
                  className={`relative z-10 text-xs transition ${
                    isActive ? 'font-semibold text-white' : 'text-white/60'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Safe area for iOS devices */}
      <div className="h-safe-area-inset-bottom bg-deep-900/95" />
    </nav>
  );
}
