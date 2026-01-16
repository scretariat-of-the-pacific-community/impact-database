'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface SwipeableTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: Array<{ id: string; label: string }>;
  children: React.ReactNode;
}

export default function SwipeableTabs({
  activeTab,
  onTabChange,
  tabs,
  children,
}: SwipeableTabsProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(10);
    }
  };

  const handleDragEnd = (_: any, info: any) => {
    setIsDragging(false);
    const swipeThreshold = 50;
    const swipeVelocity = 500;

    if (
      info.offset.x > swipeThreshold ||
      (info.velocity.x > swipeVelocity && info.offset.x > 0)
    ) {
      // Swiped right - go to previous tab
      if (currentIndex > 0) {
        onTabChange(tabs[currentIndex - 1].id);
        triggerHaptic();
      }
    } else if (
      info.offset.x < -swipeThreshold ||
      (info.velocity.x < -swipeVelocity && info.offset.x < 0)
    ) {
      // Swiped left - go to next tab
      if (currentIndex < tabs.length - 1) {
        onTabChange(tabs[currentIndex + 1].id);
        triggerHaptic();
      }
    }
    setDragEnabled(true);
  };

  const handleDirectionLock = (axis: 'x' | 'y') => {
    if (axis === 'y') {
      // Release to allow vertical scroll
      setDragEnabled(false);
    }
  };

  return (
    <div className="relative overflow-hidden touch-pan-y" ref={containerRef}>
      <motion.div
        drag={dragEnabled ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        dragDirectionLock
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        onPanEnd={() => setDragEnabled(true)}
        onDirectionLock={handleDirectionLock}
        animate={{ x: 0 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
        className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      >
        {children}
      </motion.div>

      {/* Swipe indicator dots */}
      <div className="flex justify-center gap-2 mt-4 md:hidden">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`min-w-[44px] min-h-[44px] rounded-full transition-all flex items-center justify-center ${
              index === currentIndex
                ? 'bg-white/10'
                : 'bg-white/5 hover:bg-white/10'
            }`}
            aria-label={`Go to ${tab.label} tab`}
          />
        ))}
      </div>
    </div>
  );
}
