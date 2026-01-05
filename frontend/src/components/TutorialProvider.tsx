/**
 * Tutorial Provider Component
 * Wraps the application to provide tutorial functionality and auto-start on first visit
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTutorial } from '@/lib/tutorial-enhanced';
import 'driver.js/dist/driver.css';

interface TutorialProviderProps {
  children: React.ReactNode;
  autoStart?: boolean;
}

export default function TutorialProvider({ children, autoStart = true }: TutorialProviderProps) {
  const pathname = usePathname();
  const tutorial = useTutorial();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !autoStart) return;

    // Auto-start main tour on first visit to home page
    if (pathname === '/' && tutorial.isFirstVisit()) {
      // Delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        // Check if required elements exist before starting tour
        const hasRequiredElements = document.querySelector('#search-box') || 
                                    document.querySelector('#upload-button');
        
        if (hasRequiredElements && !tutorial.isTourCompleted('mainTour')) {
          tutorial.startTour('mainTour');
        }
      }, 1500);

      return () => clearTimeout(timer);
    }

    // Auto-start specific tours for first-time visitors to those pages
    if (pathname === '/upload' && !tutorial.isTourCompleted('uploadTour')) {
      const timer = setTimeout(() => {
        // Check if upload form exists
        const hasUploadForm = document.querySelector('#file-upload') ||
                               document.querySelector('#hazard-type');
        
        if (hasUploadForm) {
          tutorial.startTour('uploadTour');
        }
      }, 1000);

      return () => clearTimeout(timer);
    }

    if (pathname === '/analytics' && !tutorial.isTourCompleted('analyticsTour')) {
      const timer = setTimeout(() => {
        tutorial.startTour('analyticsTour');
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [pathname, mounted, autoStart, tutorial]);

  return <>{children}</>;
}
