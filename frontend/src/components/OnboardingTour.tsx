'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface OnboardingTourProps {
  run?: boolean;
  onComplete?: () => void;
  tourType?: 'upload' | 'dashboard' | 'analytics';
}

interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const TOUR_STORAGE_KEY = 'oceanportal_tour_completed';

export default function OnboardingTour({
  run = false,
  onComplete,
  tourType = 'upload',
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  const uploadSteps: TourStep[] = [
    {
      target: 'body',
      title: 'Welcome to Pacific Impact Atlas! 🌊',
      content:
        'Thank you for joining our community of citizen scientists documenting disaster impacts across the Pacific Islands. This quick tour will show you how to contribute your first image.',
      placement: 'center',
    },
    {
      target: '[data-tour="upload-button"]',
      title: '📸 Upload Your Images',
      content:
        'Click here to start uploading disaster or hazard images. You can upload photos from cyclones, floods, tsunamis, king tides, and other Pacific hazards.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="file-input"]',
      title: '🖼️ Select Your Image',
      content:
        'Choose a photo from your device. We accept JPG, PNG, TIFF, and WebP formats up to 10MB in size. Tip: Use high-quality images that clearly show the disaster impact.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="hazard-select"]',
      title: '🌪️ Select Hazard Type',
      content:
        'Choose the type of disaster or hazard shown in your photo. This helps organize and categorize the data for researchers and emergency responders.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="location-field"]',
      title: '📍 Add Location',
      content:
        'Enter where the photo was taken. This is crucial for mapping disaster impacts. Tip: Be as specific as possible (e.g., "Suva Foreshore, Fiji" rather than just "Fiji").',
      placement: 'bottom',
    },
    {
      target: '[data-tour="coordinates-fields"]',
      title: '🗺️ GPS Coordinates (Optional)',
      content:
        "If you know the exact coordinates, add them here. If your photo has GPS metadata, we'll extract it automatically! Don't worry if you don't have coordinates - the location name is enough.",
      placement: 'bottom',
    },
    {
      target: '[data-tour="description-field"]',
      title: '✍️ Describe What You Saw',
      content:
        'Add details about the disaster impact. What happened? When? How severe was it? Example: "Coastal flooding from king tide on Jan 15, 2025. Water reached 2 meters above normal high tide, flooding 5 homes."',
      placement: 'bottom',
    },
    {
      target: '[data-tour="submit-button"]',
      title: '🚀 Submit Your Contribution',
      content:
        'Click here to submit! Your image will be reviewed by our experts to ensure quality, then added to the public database. You\'ll earn your first badge: "First Steps"!',
      placement: 'top',
    },
    {
      target: 'body',
      title: "🎉 You're Ready!",
      content:
        "That's all there is to it! Every image you upload helps scientists, emergency responders, and communities better understand and prepare for disasters. Visit the Training Hub for photography tips, field guides, and best practices. Questions? Contact support@oceanportal.org",
      placement: 'center',
    },
  ];

  const steps = tourType === 'upload' ? uploadSteps : uploadSteps;

  useEffect(() => {
    setIsVisible(run);
    if (run) {
      setCurrentStep(0);
    }
  }, [run]);

  useEffect(() => {
    if (!isVisible || currentStep >= steps.length) return;

    const step = steps[currentStep];
    if (step.target === 'body') {
      setTargetElement(null);
      return;
    }

    const element = document.querySelector(step.target) as HTMLElement;
    setTargetElement(element);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentStep, isVisible, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setIsVisible(false);
    const completedTours = JSON.parse(
      localStorage.getItem(TOUR_STORAGE_KEY) || '[]'
    );
    if (!completedTours.includes(tourType)) {
      completedTours.push(tourType);
      localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(completedTours));
    }
    if (onComplete) {
      onComplete();
    }
  };

  if (!isVisible) return null;

  const currentStepData = steps[currentStep];
  const isCenter =
    currentStepData.placement === 'center' || currentStepData.target === 'body';

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={handleSkip}
      />

      {/* Spotlight effect for targeted elements */}
      {targetElement && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: targetElement.getBoundingClientRect().top - 4,
            left: targetElement.getBoundingClientRect().left - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            borderRadius: '8px',
          }}
        />
      )}

      {/* Tour Tooltip */}
      <div
        className={`fixed z-[10000] bg-white rounded-xl shadow-2xl p-6 max-w-md ${
          isCenter ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : ''
        }`}
        style={
          !isCenter && targetElement
            ? {
                top: targetElement.getBoundingClientRect().bottom + 16,
                left: Math.min(
                  targetElement.getBoundingClientRect().left,
                  window.innerWidth - 400
                ),
              }
            : undefined
        }
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close tour"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-3 pr-8">
            {currentStepData.title}
          </h3>
          <p className="text-gray-700 text-sm leading-relaxed">
            {currentStepData.content}
          </p>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>
              Step {currentStep + 1} of {steps.length}
            </span>
            <button
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-700 font-medium"
            >
              Skip tour
            </button>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentStep === 0
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            {currentStep === steps.length - 1 ? (
              <>
                <Check className="w-4 h-4" />
                Finish
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// Helper function to check if user has completed a tour
export function hasCompletedTour(tourType: string): boolean {
  if (typeof window === 'undefined') return true;
  const completedTours = JSON.parse(
    localStorage.getItem(TOUR_STORAGE_KEY) || '[]'
  );
  return completedTours.includes(tourType);
}

// Helper function to reset all tours (for testing or re-onboarding)
export function resetAllTours(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  }
}
