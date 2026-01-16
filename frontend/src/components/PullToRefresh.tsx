'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
}

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      setTouchStart(e.touches[0].clientY);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (touchStart === 0 || window.scrollY > 0 || isRefreshing) return;

      const touchCurrent = e.touches[0].clientY;
      const distance = Math.max(0, touchCurrent - touchStart);

      if (distance > 0) {
        e.preventDefault();
        setPullDistance(Math.min(distance, threshold * 1.5));
      }
    },
    [touchStart, threshold, isRefreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
    setTouchStart(0);
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    document.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const pullProgress = Math.min(pullDistance / threshold, 1);
  const opacity = pullProgress;
  const scale = 0.5 + pullProgress * 0.5;

  return (
    <>
      {/* Pull indicator */}
      <motion.div
        className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center pt-4"
        style={{
          opacity,
          translateY: pullDistance > 0 ? pullDistance - 40 : -40,
        }}
      >
        <div className="rounded-full border border-white/20 bg-deep-900/90 p-3 backdrop-blur-xl">
          <motion.div
            animate={{ rotate: isRefreshing ? 360 : 0 }}
            transition={{
              duration: 1,
              ease: 'linear',
              repeat: isRefreshing ? Infinity : 0,
            }}
            style={{ scale }}
          >
            <RefreshCw
              className={`h-5 w-5 ${
                pullDistance >= threshold ? 'text-pacific-400' : 'text-white/60'
              }`}
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Content */}
      <div>{children}</div>
    </>
  );
}
