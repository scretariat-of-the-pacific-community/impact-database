'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, PanInfo, useAnimation } from 'framer-motion';

interface SwipeableTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: Array<{ id: string; label: string }>;
  children: React.ReactNode;
}

export default function SwipeableTabs({ activeTab, onTabChange, tabs, children }: SwipeableTabsProps) {
  const controls = useAnimation();
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);

  const handleDragEnd = (_: any, info: PanInfo) => {
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
      }
    } else if (
      info.offset.x < -swipeThreshold ||
      (info.velocity.x < -swipeVelocity && info.offset.x < 0)
    ) {
      // Swiped left - go to next tab
      if (currentIndex < tabs.length - 1) {
        onTabChange(tabs[currentIndex + 1].id);
      }
    }
  };

  useEffect(() => {
    controls.start({ x: 0 });
  }, [activeTab, controls]);

  return (
    <div className="relative overflow-hidden touch-pan-y" ref={containerRef}>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        animate={controls}
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
            className={`min-w-[44px] min-h-[8px] rounded-full transition-all ${
              index === currentIndex
                ? 'w-8 bg-pacific-400'
                : 'w-2 bg-white/20 hover:bg-white/40'
            }`}
            aria-label={`Go to ${tab.label} tab`}
          />
        ))}
      </div>
    </div>
  );
}
