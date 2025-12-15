/**
 * Tutorial Button Component
 * Provides help/tutorial access throughout the application
 */

'use client';

import { useState } from 'react';
import { HelpCircle, Play, RotateCcw } from 'lucide-react';
import { useTutorial, tutorialSteps } from '@/lib/tutorial';

interface TutorialButtonProps {
  tourName?: keyof typeof tutorialSteps;
  variant?: 'icon' | 'button' | 'fab';
  className?: string;
  showMenu?: boolean;
}

export default function TutorialButton({ 
  tourName, 
  variant = 'icon',
  className = '',
  showMenu = false 
}: TutorialButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tutorial = useTutorial();

  const handleStartTour = (tour?: keyof typeof tutorialSteps) => {
    const tourToStart = tour || tourName;
    if (tourToStart) {
      tutorial.startTour(tourToStart);
      setMenuOpen(false);
    }
  };

  const handleResetTours = () => {
    tutorial.resetTours();
    setMenuOpen(false);
    alert('All tutorials have been reset. They will show again on next visit.');
  };

  if (variant === 'fab') {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => showMenu ? setMenuOpen(!menuOpen) : handleStartTour()}
          className={`p-4 bg-pacific-600 hover:bg-pacific-700 text-white rounded-full shadow-2xl transition-all hover:scale-110 ${className}`}
          title="Help & Tutorials"
        >
          <HelpCircle className="w-6 h-6" />
        </button>
        
        {showMenu && menuOpen && (
          <div className="absolute bottom-16 right-0 w-64 bg-deep-900/95 backdrop-blur border border-white/20 rounded-xl shadow-xl p-4 space-y-2">
            <div className="text-white font-semibold mb-3 pb-2 border-b border-white/10">
              Available Tutorials
            </div>
            
            <button
              onClick={() => handleStartTour('mainTour')}
              className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Main Application Tour
            </button>
            
            <button
              onClick={() => handleStartTour('uploadTour')}
              className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Upload Guide
            </button>
            
            <button
              onClick={() => handleStartTour('analyticsTour')}
              className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Analytics Dashboard
            </button>
            
            <button
              onClick={() => handleStartTour('galleryTour')}
              className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Search & Browse
            </button>
            
            <div className="pt-2 mt-2 border-t border-white/10">
              <button
                onClick={handleResetTours}
                className="w-full text-left px-3 py-2 text-sm text-white/60 hover:text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset All Tutorials
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'button') {
    return (
      <button
        onClick={() => handleStartTour()}
        className={`inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 transition-all ${className}`}
      >
        <HelpCircle className="w-4 h-4" />
        Tutorial
      </button>
    );
  }

  // Default icon variant
  return (
    <button
      onClick={() => handleStartTour()}
      className={`p-2 text-white/60 hover:text-white/90 transition-colors ${className}`}
      title="Start tutorial"
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  );
}
