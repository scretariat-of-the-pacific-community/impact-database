'use client';

import { motion } from 'framer-motion';
import { useRef } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade';
  className?: string;
  once?: boolean;
}

export default function ScrollReveal({
  children,
  delay = 0,
  direction = 'up',
  className = '',
  once = true,
}: ScrollRevealProps) {
  const ref = useRef(null);

  // Check user's motion preferences
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  // If user prefers reduced motion, render without animation
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const variants = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
    fade: { y: 0, x: 0 },
  };

  const initial = {
    opacity: 0,
    ...variants[direction],
  };

  const whileInView = {
    opacity: 1,
    y: 0,
    x: 0,
  };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      whileInView={whileInView}
      viewport={{ once, margin: '-50px' }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.25, 0.1, 0.25, 1], // Custom easing for smooth motion
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
