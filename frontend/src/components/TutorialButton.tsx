/**
 * Tutorial Button Component
 * Provides help/tutorial access throughout the application
 */

'use client';

import { useState } from 'react';
import {
  HelpCircle,
  Play,
  RotateCcw,
  TrendingUp,
  BarChart3,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { useTutorial, tutorialSteps } from '@/lib/tutorial-enhanced';
import { toast } from 'sonner';

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
  showMenu = false,
}: TutorialButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tutorial = useTutorial();
  const stats = tutorial.getStats() || {
    completed: 0,
    started: 0,
    interactions: 0,
    completedTours: [] as string[],
  };

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
    toast.success('Tutorials reset', {
      description: 'They will show again on your next visit.',
    });
  };

  if (variant === 'fab') {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() =>
            showMenu ? setMenuOpen(!menuOpen) : handleStartTour()
          }
          className={`p-4 bg-pacific-600 hover:bg-pacific-700 text-white rounded-full shadow-2xl transition-all hover:scale-110 ${className}`}
          title="Help & Tutorials"
        >
          <HelpCircle className="w-6 h-6" />
        </button>

        {showMenu && menuOpen && (
          <div className="absolute bottom-16 right-0 w-72 bg-deep-900/95 backdrop-blur border border-white/20 rounded-xl shadow-xl overflow-hidden">
            {/* Stats Header */}
            <div className="bg-gradient-to-r from-pacific-600 to-pacific-700 p-4 border-b border-white/10">
              <div className="text-white font-semibold mb-2 flex items-center gap-2">
                <Award className="w-5 h-5" />
                Your Progress
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="text-2xl font-bold text-white">
                    {stats.completed}
                  </div>
                  <div className="text-xs text-white/70">Completed</div>
                </div>
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="text-2xl font-bold text-white">
                    {stats.started}
                  </div>
                  <div className="text-xs text-white/70">Started</div>
                </div>
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="text-2xl font-bold text-white">
                    {stats.interactions}
                  </div>
                  <div className="text-xs text-white/70">Interactions</div>
                </div>
              </div>
            </div>

            {/* Tutorial Menu */}
            <div className="p-4 space-y-2">
              <div className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-3">
                Available Tutorials
              </div>

              <button
                onClick={() => handleStartTour('mainTour')}
                className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors group"
              >
                <Play className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="flex-1">Main Application Tour</span>
                {stats.completedTours.includes('mainTour') && (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
              </button>

              <button
                onClick={() => handleStartTour('uploadTour')}
                className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors group"
              >
                <Play className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="flex-1">Upload Guide</span>
                {stats.completedTours.includes('uploadTour') && (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
              </button>

              <button
                onClick={() => handleStartTour('analyticsTour')}
                className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors group"
              >
                <BarChart3 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="flex-1">Analytics Dashboard</span>
                {stats.completedTours.includes('analyticsTour') && (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
              </button>

              <button
                onClick={() => handleStartTour('galleryTour')}
                className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors group"
              >
                <TrendingUp className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="flex-1">Search & Browse</span>
                {stats.completedTours.includes('galleryTour') && (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
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
