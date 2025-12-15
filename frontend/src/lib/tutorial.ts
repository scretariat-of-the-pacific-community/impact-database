/**
 * Application Tutorial System using Driver.js
 * Provides guided tours for Pacific Impact Atlas features
 */

import { driver, DriveStep, Config } from 'driver.js';

// Tutorial step definitions for different sections
export const tutorialSteps = {
  // Main application tour
  mainTour: [
    {
      element: '#search-box',
      popover: {
        title: 'Search Disaster Imagery',
        description: 'Search through Pacific Impact Atlas to find specific hazard events, locations, or time periods.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '#upload-button',
      popover: {
        title: 'Contribute Imagery',
        description: 'Upload disaster impact photos to help document hazards across the Pacific region. Your contributions support disaster preparedness.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '#analytics-link',
      popover: {
        title: 'Analytics Dashboard',
        description: 'View insights and trends about disaster patterns, geographic distribution, and hazard frequencies.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '#map-view',
      popover: {
        title: 'Geographic Explorer',
        description: 'Explore hazards on an interactive map. Click markers to view details and images of disaster events.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#filter-panel',
      popover: {
        title: 'Filter Options',
        description: 'Narrow your search by hazard type, country, date range, or other criteria to find exactly what you need.',
        side: 'left',
        align: 'start',
      },
    },
  ] as DriveStep[],

  // Upload page tour
  uploadTour: [
    {
      popover: {
        title: 'Welcome to Upload',
        description: 'Follow these steps to contribute disaster impact imagery to Pacific Impact Atlas.',
      },
    },
    {
      element: '#file-upload',
      popover: {
        title: 'Select Image File',
        description: 'Choose a disaster impact photo (JPG, PNG). The system will extract metadata automatically if available.',
        side: 'bottom',
      },
    },
    {
      element: '#hazard-type',
      popover: {
        title: 'Specify Hazard Type',
        description: 'Select the type of disaster: flood, cyclone, earthquake, tsunami, drought, etc.',
        side: 'right',
      },
    },
    {
      element: '#location-fields',
      popover: {
        title: 'Location Details',
        description: 'Provide the country and specific location. Coordinates will be extracted from EXIF data when available.',
        side: 'top',
      },
    },
    {
      element: '#datetime-picker',
      popover: {
        title: 'Event Date & Time',
        description: 'When was the photo taken? This helps track disaster timelines and seasonal patterns.',
        side: 'left',
      },
    },
    {
      element: '#metadata-section',
      popover: {
        title: 'Additional Metadata',
        description: 'Add optional details: event ID, source agency, data license, and descriptive tags.',
        side: 'top',
      },
    },
    {
      element: '#submit-button',
      popover: {
        title: 'Submit for Review',
        description: 'Your upload will be reviewed before appearing in the database. You\'ll receive a confirmation email.',
        side: 'top',
      },
    },
  ] as DriveStep[],

  // Analytics page tour
  analyticsTour: [
    {
      popover: {
        title: 'Analytics Dashboard',
        description: 'Explore disaster patterns and trends across the Pacific region.',
      },
    },
    {
      element: '#insights-panel',
      popover: {
        title: 'Data Insights',
        description: 'Automatically detected patterns, anomalies, and trends in hazard documentation.',
        side: 'bottom',
      },
    },
    {
      element: '#time-series-chart',
      popover: {
        title: 'Upload Timeline',
        description: 'Track how disaster documentation has changed over time. Switch between daily, monthly, or yearly views.',
        side: 'top',
      },
    },
    {
      element: '#hazard-distribution',
      popover: {
        title: 'Hazard Types',
        description: 'See which disasters are most common in the database: floods, cyclones, earthquakes, etc.',
        side: 'left',
      },
    },
    {
      element: '#country-distribution',
      popover: {
        title: 'Geographic Coverage',
        description: 'View which Pacific Island nations have the most documented hazard events.',
        side: 'right',
      },
    },
    {
      element: '#export-dropdown',
      popover: {
        title: 'Export Data',
        description: 'Download analytics data in CSV or JSON format for further analysis or reporting.',
        side: 'bottom',
      },
    },
    {
      element: '#map-toggle',
      popover: {
        title: 'Map View',
        description: 'Switch to map view to see the geographic distribution of hazard events.',
        side: 'left',
      },
    },
  ] as DriveStep[],

  // Search/Gallery tour
  galleryTour: [
    {
      element: '#search-filters',
      popover: {
        title: 'Search Filters',
        description: 'Filter by hazard type, country, date range, or keywords to find specific disaster images.',
        side: 'bottom',
      },
    },
    {
      element: '#results-grid',
      popover: {
        title: 'Search Results',
        description: 'Browse disaster impact imagery. Click any image to view full details and metadata.',
        side: 'top',
      },
    },
    {
      element: '#image-preview',
      popover: {
        title: 'Image Details',
        description: 'View full metadata: location, date, hazard type, coordinates, and download options.',
        side: 'left',
      },
    },
    {
      element: '#download-button',
      popover: {
        title: 'Download',
        description: 'Download high-resolution images and their ISO 19115 compliant metadata.',
        side: 'top',
      },
    },
  ] as DriveStep[],
};

// Default configuration
const defaultConfig: Partial<Config> = {
  showProgress: true,
  showButtons: ['next', 'previous', 'close'],
  progressText: '{{current}} of {{total}}',
  nextBtnText: 'Next',
  prevBtnText: 'Previous',
  doneBtnText: 'Finish',
  stagePadding: 4,
  stageRadius: 8,
  popoverClass: 'tutorial-popover',
  animate: true,
  smoothScroll: true,
};

/**
 * Tutorial Manager
 */
export class TutorialManager {
  private driverObj: ReturnType<typeof driver> | null = null;
  private currentTour: string | null = null;

  /**
   * Start a specific tour
   */
  startTour(tourName: keyof typeof tutorialSteps, config?: Partial<Config>) {
    const steps = tutorialSteps[tourName];
    if (!steps || steps.length === 0) {
      console.warn(`Tour "${tourName}" not found or has no steps`);
      return;
    }

    // Create driver instance
    this.driverObj = driver({
      ...defaultConfig,
      ...config,
      steps,
      onDestroyed: () => {
        this.markTourCompleted(tourName);
        this.driverObj = null;
        this.currentTour = null;
      },
    });

    this.currentTour = tourName;
    this.driverObj.drive();
  }

  /**
   * Stop current tour
   */
  stopTour() {
    if (this.driverObj) {
      this.driverObj.destroy();
      this.driverObj = null;
      this.currentTour = null;
    }
  }

  /**
   * Check if tour has been completed
   */
  isTourCompleted(tourName: string): boolean {
    if (typeof window === 'undefined') return false;
    const completed = localStorage.getItem('tutorial_completed') || '{}';
    try {
      const tours = JSON.parse(completed);
      return tours[tourName] === true;
    } catch {
      return false;
    }
  }

  /**
   * Mark tour as completed
   */
  markTourCompleted(tourName: string) {
    if (typeof window === 'undefined') return;
    const completed = localStorage.getItem('tutorial_completed') || '{}';
    try {
      const tours = JSON.parse(completed);
      tours[tourName] = true;
      localStorage.setItem('tutorial_completed', JSON.stringify(tours));
    } catch {
      localStorage.setItem('tutorial_completed', JSON.stringify({ [tourName]: true }));
    }
  }

  /**
   * Reset all tour completions
   */
  resetTours() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('tutorial_completed');
  }

  /**
   * Check if this is user's first visit
   */
  isFirstVisit(): boolean {
    if (typeof window === 'undefined') return false;
    const visited = localStorage.getItem('app_visited');
    if (!visited) {
      localStorage.setItem('app_visited', 'true');
      return true;
    }
    return false;
  }

  /**
   * Highlight a specific element
   */
  highlight(element: string, popoverConfig?: DriveStep['popover']) {
    if (this.driverObj) {
      this.stopTour();
    }

    this.driverObj = driver({
      ...defaultConfig,
      showButtons: ['close'],
      steps: [
        {
          element,
          popover: popoverConfig || {
            description: 'This is an important feature!',
          },
        },
      ],
    });

    this.driverObj.drive();
  }
}

// Export singleton instance
export const tutorialManager = new TutorialManager();

/**
 * React hook for tutorial management
 */
export function useTutorial() {
  return {
    startTour: (tourName: keyof typeof tutorialSteps, config?: Partial<Config>) => 
      tutorialManager.startTour(tourName, config),
    stopTour: () => tutorialManager.stopTour(),
    isTourCompleted: (tourName: string) => tutorialManager.isTourCompleted(tourName),
    markTourCompleted: (tourName: string) => tutorialManager.markTourCompleted(tourName),
    resetTours: () => tutorialManager.resetTours(),
    isFirstVisit: () => tutorialManager.isFirstVisit(),
    highlight: (element: string, popover?: DriveStep['popover']) => 
      tutorialManager.highlight(element, popover),
  };
}
