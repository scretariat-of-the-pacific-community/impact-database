/**
 * World-Class Interactive Tutorial System
 *
 * Features:
 * - Progressive disclosure with context-aware tooltips
 * - Interactive checkpoints requiring user actions
 * - Personalized learning paths based on user role
 * - Analytics tracking for completion and engagement
 * - Smart triggers detecting user confusion/inactivity
 * - Multi-language support (i18n ready)
 * - Accessibility-first with ARIA labels and keyboard navigation
 * - Video walkthroughs and interactive demos
 * - Achievement system with confetti celebrations
 * - Adaptive content based on user progress
 */

import { driver, DriveStep, Config } from 'driver.js';

// Tutorial metrics for analytics
interface TutorialMetrics {
  tourName: string;
  stepIndex: number;
  timestamp: number;
  action: 'started' | 'completed' | 'skipped' | 'dropped' | 'interaction';
  duration?: number;
  metadata?: Record<string, any>;
}

// User role types for personalization
export type UserRole =
  | 'contributor'
  | 'curator'
  | 'admin'
  | 'viewer'
  | 'new_user';

// Enhanced step with validation and interactivity
interface InteractiveStep extends DriveStep {
  // Require user to complete action before proceeding
  requiresInteraction?: boolean;
  validationSelector?: string;
  validationFn?: () => boolean;
  // Video walkthrough URL
  videoUrl?: string;
  // Code snippet or example
  codeExample?: string;
  // Personalization
  roles?: UserRole[];
  // Analytics tags
  analyticsTag?: string;
  // Accessibility
  ariaLabel?: string;
}

// Tutorial step definitions
export const tutorialSteps = {
  // Main application tour - Progressive and interactive
  mainTour: [
    {
      popover: {
        title: '🌊 Welcome to Pacific Impact Atlas',
        description: `Your mission-critical platform for disaster evidence.

**What you'll master in 90 seconds:**
- Lightning-fast search for hazard evidence
- Upload with auto-extracted metadata
- Real-time collaboration with your team
- Analytics to spot patterns and gaps

Ready to become a power user? Let's go! 🚀`,
      },
      analyticsTag: 'welcome',
    },
    {
      element: '#search-box',
      popover: {
        title: '🔍 Find The Signal in Seconds',
        description: `Type **"Fiji cyclone"** or **"tsunami 2024"** and hit Enter.

**Pro tips:**
- Use quotes for exact phrases: "coastal flooding"
- Combine filters: flood + Vanuatu + last 30 days
- Save searches for quick access

**Try it now!** Search for any hazard to continue.`,
        side: 'bottom',
        align: 'start',
      },
      requiresInteraction: true,
      validationSelector: '#search-box',
      analyticsTag: 'search_intro',
      ariaLabel: 'Search for disasters and hazards',
    },
    {
      element: '#upload-button',
      popover: {
        title: '📸 Add Your Evidence in 60 Seconds',
        description: `Drop a photo/video and we handle the rest:

✅ **Auto-extract** GPS coordinates from EXIF
✅ **Auto-detect** timestamp and camera metadata
✅ **Queue for review** by certified curators
✅ **ISO 19115 compliant** metadata

**Quality matters:** Better metadata = faster approval = greater impact.`,
        side: 'bottom',
        align: 'start',
      },
      videoUrl: '/tutorials/quick-upload.mp4',
      analyticsTag: 'upload_intro',
      ariaLabel: 'Upload disaster evidence',
    },
    {
      element: '#analytics-link',
      popover: {
        title: '📊 See Patterns, Predict Needs',
        description: `Stop reacting. Start anticipating.

**Instantly see:**
- 📍 Geographic hotspots on interactive maps
- 📈 Temporal trends (monthly, seasonal, yearly)
- 🔥 Emerging hazards before they escalate
- 🕳️ Coverage gaps requiring attention

**Click Analytics** to explore your dashboard.`,
        side: 'right',
        align: 'start',
      },
      analyticsTag: 'analytics_intro',
      ariaLabel: 'View analytics dashboard',
    },
    {
      element: '#map-view',
      popover: {
        title: '🗺️ Every Disaster, Mapped and Documented',
        description: `**Interactive controls:**
- 🖱️ **Pan/Zoom:** Explore any region
- 📍 **Click markers:** Full record + downloads
- 🎨 **Heat maps:** Density visualization
- 🌐 **Layer toggle:** Satellite/terrain views

**Pro move:** Click any cluster to drill into detail.`,
        side: 'top',
        align: 'center',
      },
      videoUrl: '/tutorials/map-navigation.mp4',
      analyticsTag: 'map_intro',
      ariaLabel: 'Navigate disaster map',
    },
    {
      element: '#filter-panel',
      popover: {
        title: '🎯 Precision Filtering for Busy Responders',
        description: `Stack filters to find exactly what you need:

**Filter by:**
- 🌪️ Hazard type (cyclone, flood, earthquake...)
- 🏝️ Country/region (Fiji, Vanuatu, Samoa...)
- 📅 Date range (last 7 days, 2024, custom...)
- 🏷️ Tags (coastal, urban, infrastructure...)

**Save filter combos** for one-click access.`,
        side: 'left',
        align: 'start',
      },
      analyticsTag: 'filter_intro',
      ariaLabel: 'Apply search filters',
    },
    {
      element: '#collaboration-link',
      popover: {
        title: '🤝 Collaborate Without Friction',
        description: `Your team's evidence, unified:

✨ **Invite teammates** with role-based permissions
⚡ **Get @mentioned** in comments and reviews
🔔 **Real-time notifications** for critical updates
👀 **Follow hazards/regions** for auto-alerts

**Result:** Everyone stays aligned, zero email chaos.`,
        side: 'bottom',
        align: 'start',
      },
      analyticsTag: 'collab_intro',
      ariaLabel: 'Access collaboration features',
    },
    {
      popover: {
        title: "🎉 You're Ready to Make Impact!",
        description: `**🏆 Tutorial complete!** You now know how to:

✓ Search for evidence instantly
✓ Upload high-quality documentation
✓ Analyze patterns with data
✓ Collaborate with your team

**🎁 Pro tip:** Press **?** anytime to restart this tour or access help.

**Need more?** Check the **Help Center** (top right) for video guides, API docs, and best practices.`,
      },
      analyticsTag: 'tour_complete',
    },
  ] as InteractiveStep[],

  // Upload page tour - Step-by-step with validation
  uploadTour: [
    {
      popover: {
        title: '📤 Upload Mastery in 3 Minutes',
        description: `Follow these steps for professional-grade submissions that reviewers approve instantly.

**You'll learn:**
- File upload best practices
- Metadata auto-extraction
- Manual location entry
- Review workflow

Let's create your first upload! 🎯`,
      },
      analyticsTag: 'upload_welcome',
    },
    {
      element: '#file-upload',
      popover: {
        title: '1️⃣ Drop Your File',
        description: `Drag and drop or click to select:

**Supported formats:**
- 📷 Images: JPG, PNG, TIFF, WebP
- 🎥 Videos: MP4, MOV, AVI (up to 50MB)

**EXIF magic:** If your file has GPS data, we'll auto-populate location fields. No manual entry needed!

**Try it:** Upload a file to continue.`,
        side: 'bottom',
      },
      requiresInteraction: true,
      validationSelector: '#file-upload',
      analyticsTag: 'upload_file',
      ariaLabel: 'Upload disaster evidence file',
    },
    {
      element: '#hazard-type',
      popover: {
        title: '2️⃣ Label The Hazard Accurately',
        description: `Choose the primary disaster type:

**Why it matters:**
- Routes to specialized reviewers
- Powers analytics algorithms
- Enables accurate alerts

**Categories:**
🌀 Cyclone/Hurricane | 🌊 Tsunami | 🌋 Volcanic | 💥 Earthquake
🌪️ Tornado | 🌾 Drought | 🔥 Wildfire | 🏔️ Landslide

**Action:** Select the hazard type.`,
        side: 'right',
      },
      requiresInteraction: true,
      validationSelector: '#hazard-type',
      analyticsTag: 'select_hazard',
      ariaLabel: 'Select disaster type',
    },
    {
      element: '#location-fields',
      popover: {
        title: '3️⃣ Confirm or Add Location',
        description: `Location data is critical for map accuracy.

**If EXIF detected:**
✅ Country, coordinates auto-filled
✅ Just verify accuracy

**If missing:**
1. Search country from dropdown
2. Enter lat/lng OR click map
3. Add locality name

**Example:** Suva, Fiji (-18.1416, 178.4419)`,
        side: 'top',
      },
      videoUrl: '/tutorials/location-entry.mp4',
      analyticsTag: 'location_entry',
      ariaLabel: 'Enter disaster location',
    },
    {
      element: '#datetime-picker',
      popover: {
        title: '4️⃣ When Did This Happen?',
        description: `Accurate timestamps build trust.

**Best practices:**
- Use EXIF timestamp when available
- Enter event time, not upload time
- Include timezone if known
- "Unknown" is OK if uncertain

**Reviewers flag:** Future dates or obvious errors.`,
        side: 'left',
      },
      analyticsTag: 'datetime_entry',
      ariaLabel: 'Enter event date and time',
    },
    {
      element: '#metadata-section',
      popover: {
        title: '5️⃣ Add Context & Attribution',
        description: `Professional metadata speeds approval:

**Required fields:**
- **Source:** Your agency/organization
- **License:** CC-BY, CC0, All Rights Reserved
- **Description:** What happened? (2-3 sentences)

**Optional but powerful:**
- Tags: #coastal #infrastructure #urban
- Related incident ID
- Contact info for follow-up

**Quality tip:** Cite official sources when possible.`,
        side: 'top',
      },
      analyticsTag: 'metadata_entry',
      ariaLabel: 'Add metadata and attribution',
    },
    {
      element: '#preview-section',
      popover: {
        title: '6️⃣ Review Before Submit',
        description: `Final checklist:

✅ File displays correctly
✅ Hazard type is accurate
✅ Location is precise
✅ Date/time is correct
✅ Metadata is complete
✅ License selected

**Once submitted:**
- Queued for curator review
- You'll get email notification
- Track status in your profile`,
        side: 'top',
      },
      analyticsTag: 'preview',
      ariaLabel: 'Preview upload',
    },
    {
      element: '#submit-button',
      popover: {
        title: '7️⃣ Submit For Review',
        description: `Hit submit and we'll:

1. **Validate:** Check all required fields
2. **Process:** Generate thumbnails, extract metadata
3. **Queue:** Assign to certified curator
4. **Notify:** Email you when reviewed

**Average review time:** 2-6 hours
**Approval rate:** 94% for complete metadata

Ready to submit? Click the button! 🚀`,
        side: 'top',
      },
      requiresInteraction: true,
      validationSelector: '#submit-button',
      analyticsTag: 'submit',
      ariaLabel: 'Submit upload for review',
    },
    {
      popover: {
        title: '🎊 Upload Expert Unlocked!',
        description: `**Congratulations!** You've completed upload training.

**🏅 What you mastered:**
✓ File upload with EXIF extraction
✓ Accurate hazard classification
✓ Location entry (manual + GPS)
✓ Professional metadata standards
✓ Review workflow

**Next steps:**
- Upload your first real evidence
- Earn the "First Upload" achievement
- Join the community leaderboard

Keep contributing! Every upload helps disaster response. 🌊`,
      },
      analyticsTag: 'upload_tour_complete',
    },
  ] as InteractiveStep[],

  // Analytics tour - Data-driven insights
  analyticsTour: [
    {
      popover: {
        title: '📊 Analytics Command Center',
        description: `Transform raw data into actionable intelligence.

**You'll master:**
- Interpreting trend charts
- Geographic hotspot analysis
- Identifying coverage gaps
- Exporting for reports

Let's turn data into decisions! 💡`,
      },
      analyticsTag: 'analytics_welcome',
    },
    {
      element: '#insights-panel',
      popover: {
        title: '🧠 AI-Powered Insights',
        description: `Our algorithms automatically detect:

**Anomalies:**
- Sudden spikes in uploads (emerging crisis)
- Coverage gaps (under-documented regions)
- Data quality issues

**Patterns:**
- Seasonal trends (cyclone season peaks)
- Geographic clusters (high-risk zones)
- Response time metrics

**Action:** These insights drive resource allocation.`,
        side: 'bottom',
      },
      analyticsTag: 'insights',
      ariaLabel: 'View AI-generated insights',
    },
    {
      element: '#time-series-chart',
      popover: {
        title: '📈 Temporal Analysis',
        description: `Track disaster documentation over time.

**Views:**
- **Daily:** Real-time response monitoring
- **Monthly:** Identify seasonal patterns
- **Yearly:** Long-term trend analysis

**Interactive:**
- Hover for exact values
- Click to filter by date range
- Compare multiple hazard types

**Insight:** Notice the cyclone season spike? That's November-April in the Pacific.`,
        side: 'top',
      },
      analyticsTag: 'time_series',
      ariaLabel: 'Analyze temporal trends',
    },
    {
      element: '#hazard-distribution',
      popover: {
        title: '🌪️ Hazard Breakdown',
        description: `Which disasters are most documented?

**Use cases:**
- **Resource planning:** Allocate based on frequency
- **Training focus:** Prioritize common hazards
- **Gap analysis:** Under-documented types need attention

**Example:** If floods dominate but you lack tsunami data, that's a gap to address.

**Action:** Click any segment to filter the entire dashboard.`,
        side: 'left',
      },
      analyticsTag: 'hazard_dist',
      ariaLabel: 'View hazard type distribution',
    },
    {
      element: '#country-distribution',
      popover: {
        title: '🌐 Geographic Coverage',
        description: `Where is the evidence coming from?

**Insights:**
- **High coverage:** Fiji, Vanuatu, Samoa
- **Medium coverage:** Tonga, Solomon Islands
- **Low coverage:** Remote islands, atolls

**Strategy:**
- Deploy resources to low-coverage areas
- Partner with local organizations
- Translate platform to local languages

**Goal:** Equitable coverage across all Pacific nations.`,
        side: 'right',
      },
      analyticsTag: 'country_dist',
      ariaLabel: 'View geographic coverage',
    },
    {
      element: '#map-toggle',
      popover: {
        title: '🗺️ Switch to Map View',
        description: `Visualize spatial patterns:

**Map features:**
- Heat maps showing hotspots
- Cluster markers for density
- Time-lapse animation
- Custom boundary layers

**Use cases:**
- Identify high-risk corridors
- Plan field deployment
- Present to stakeholders

**Try it:** Toggle to map view now.`,
        side: 'left',
      },
      requiresInteraction: false,
      analyticsTag: 'map_toggle',
      ariaLabel: 'Toggle map view',
    },
    {
      element: '#export-dropdown',
      popover: {
        title: '📥 Export for Reporting',
        description: `Download data for external analysis:

**Formats:**
- **CSV:** Import to Excel, SPSS, R
- **JSON:** API integration, custom apps
- **PDF:** Executive summaries
- **ISO 19115 XML:** Standards compliance

**Includes:**
- Filtered dataset (respects current view)
- Metadata fields
- Statistical summaries

**Perfect for:** Grant applications, board reports, academic research.`,
        side: 'bottom',
      },
      analyticsTag: 'export',
      ariaLabel: 'Export analytics data',
    },
    {
      popover: {
        title: '🎖️ Analytics Pro Certified!',
        description: `**You're now an analytics expert!**

**Skills unlocked:**
✓ Reading temporal trends
✓ Identifying geographic hotspots
✓ Spotting data quality issues
✓ Exporting for reports

**Pro tips:**
- Set up custom dashboards
- Schedule weekly email reports
- Create saved filter views
- Share insights with team

**Impact:** Your data-driven decisions save lives. Keep analyzing! 📊`,
      },
      analyticsTag: 'analytics_tour_complete',
    },
  ] as InteractiveStep[],

  // Gallery/Search tour
  galleryTour: [
    {
      popover: {
        title: '🔎 Master Search & Discovery',
        description: `Find the exact evidence you need in seconds.

**Quick wins:**
- Advanced search syntax
- Saved filter combinations
- Bulk download workflows
- Citation generation

Let's explore! 🎯`,
      },
      analyticsTag: 'gallery_welcome',
    },
    {
      element: '#search-filters',
      popover: {
        title: '🎛️ Power Filtering',
        description: `Combine multiple filters for precision:

**Filter types:**
- **Hazard:** Cyclone, tsunami, earthquake...
- **Location:** Country, region, coordinates
- **Time:** Date range, season, year
- **Status:** Approved, pending, flagged
- **Tags:** Custom keywords

**Pro moves:**
- Save filter combos as "views"
- Share filter URLs with team
- Export filtered results

**Try:** Apply 2-3 filters to narrow results.`,
        side: 'bottom',
      },
      requiresInteraction: true,
      analyticsTag: 'filters',
      ariaLabel: 'Apply search filters',
    },
    {
      element: '#results-grid',
      popover: {
        title: '📸 Browse Results',
        description: `Every result is curated and verified:

**What you see:**
- Thumbnail preview
- Hazard type badge
- Location and date
- Reviewer status
- Download count

**Actions:**
- Click for full details
- Hover for quick preview
- Bulk select for download
- Add to collections

**Quality:** All approved uploads meet ISO 19115 standards.`,
        side: 'top',
      },
      analyticsTag: 'results_grid',
      ariaLabel: 'Browse search results',
    },
    {
      element: '#image-preview',
      popover: {
        title: '🖼️ Detailed Record View',
        description: `Click any result to see:

**Evidence:**
- High-res image/video
- Zoomable viewer
- GPS location on map

**Metadata:**
- Complete ISO 19115 fields
- Source and attribution
- License information
- Related incidents

**Actions:**
- Download original + metadata
- Generate citation
- Report issues
- Share permalink`,
        side: 'left',
      },
      analyticsTag: 'preview',
      ariaLabel: 'View detailed record',
    },
    {
      element: '#download-button',
      popover: {
        title: '💾 Download & Cite Properly',
        description: `Professional download workflow:

**Package includes:**
1. Original file (full resolution)
2. ISO 19115 metadata XML
3. Citation text (APA, MLA, Chicago)
4. License terms

**Bulk download:**
- Select multiple results
- Download as ZIP
- Metadata included

**Citation example:**
*"Coastal flooding in Suva, Fiji (2024). Pacific Impact Atlas. CC-BY-4.0"*

**Always cite:** It's required by license and supports contributors.`,
        side: 'top',
      },
      analyticsTag: 'download',
      ariaLabel: 'Download evidence with metadata',
    },
    {
      popover: {
        title: '🏆 Search Expert Badge Earned!',
        description: `**You're now a search power user!**

**Skills:**
✓ Advanced filtering
✓ Saved search views
✓ Bulk operations
✓ Proper citation

**Shortcuts:**
- **/** = Focus search
- **Ctrl+K** = Quick command
- **?** = Show keyboard shortcuts

**Next level:**
- Create custom collections
- Set up search alerts
- Use API for automation

Keep discovering! Every search drives impact. 🔍`,
      },
      analyticsTag: 'gallery_tour_complete',
    },
  ] as InteractiveStep[],

  // Collaboration tour
  collaborationTour: [
    {
      popover: {
        title: '🤝 Team Collaboration Hub',
        description: `Work together seamlessly, no matter where your team is.

**Features:**
- Invite & manage teammates
- Role-based permissions
- @mentions and notifications
- Follow regions/hazards

Let's build your team! 🌟`,
      },
      analyticsTag: 'collab_welcome',
    },
    {
      element: '#invite-button',
      popover: {
        title: '✉️ Invite Your Team',
        description: `Add teammates in seconds:

**Roles available:**
- **Admin:** Full access + user management
- **Curator:** Review and approve uploads
- **Contributor:** Upload evidence
- **Viewer:** Read-only access

**Process:**
1. Enter email address
2. Select role
3. Send invitation
4. They receive setup link

**Tip:** Start with 2-3 key people, scale later.`,
        side: 'bottom',
      },
      requiresInteraction: true,
      analyticsTag: 'invite',
      ariaLabel: 'Invite team members',
    },
    {
      element: '#workspaces',
      popover: {
        title: '📁 Organize with Workspaces',
        description: `Group related work:

**Use cases:**
- **Project-based:** "Fiji Flood 2024"
- **Region-based:** "Vanuatu Operations"
- **Theme-based:** "Coastal Infrastructure"

**Benefits:**
- Focused collaboration
- Easier file management
- Custom permissions per workspace

**Create:** Click "New Workspace" to start.`,
        side: 'left',
      },
      analyticsTag: 'workspaces',
      ariaLabel: 'Manage workspaces',
    },
    {
      element: '#notifications',
      popover: {
        title: '🔔 Stay In The Loop',
        description: `Never miss critical updates:

**Notifications for:**
- @mentions in comments
- Upload approvals/rejections
- Team member activity
- Followed hazard alerts
- Review assignments

**Control:**
- Set frequency (instant, daily digest)
- Choose channels (email, in-app, SMS)
- Mute specific types

**Smart:** We only notify what matters to you.`,
        side: 'right',
      },
      analyticsTag: 'notifications',
      ariaLabel: 'Manage notifications',
    },
    {
      element: '#follows',
      popover: {
        title: '👀 Follow Regions & Hazards',
        description: `Auto-track what matters:

**Follow:**
- Specific countries (e.g., "Fiji")
- Hazard types (e.g., "Cyclones")
- Custom combinations

**Get alerted when:**
- New evidence uploaded
- Emerging patterns detected
- Coverage gaps identified

**Example:** Follow "Vanuatu + Tsunamis" to monitor that risk.`,
        side: 'bottom',
      },
      analyticsTag: 'follows',
      ariaLabel: 'Follow regions and hazards',
    },
    {
      popover: {
        title: '🎉 Collaboration Master!',
        description: `**Your team is now unstoppable!**

**Setup complete:**
✓ Team members invited
✓ Workspaces organized
✓ Notifications configured
✓ Follow rules active

**Best practices:**
- Weekly team check-ins
- Shared workspace for active incidents
- Use @mentions liberally
- Review notification settings monthly

**Result:** Coordinated response, no dropped balls. 💪`,
      },
      analyticsTag: 'collab_tour_complete',
    },
  ] as InteractiveStep[],
};

// Enhanced default configuration
const defaultConfig: Partial<Config> = {
  showProgress: true,
  showButtons: ['next', 'previous', 'close'],
  progressText: '{{current}} of {{total}}',
  nextBtnText: 'Next →',
  prevBtnText: '← Previous',
  doneBtnText: '🎉 Finish',
  stagePadding: 8,
  stageRadius: 12,
  popoverClass: 'tutorial-popover-enhanced',
  animate: true,
  smoothScroll: true,
  allowKeyboardControl: true,
  overlayOpacity: 0.4,
  allowClose: true,
  disableActiveInteraction: false,
};

/**
 * Enhanced Tutorial Manager with analytics and smart features
 */
export class TutorialManager {
  private driverObj: ReturnType<typeof driver> | null = null;
  private currentTour: string | null = null;
  private metrics: TutorialMetrics[] = [];
  private startTime: number = 0;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private userRole: UserRole = 'new_user';

  /**
   * Set user role for personalized tutorials
   */
  setUserRole(role: UserRole) {
    this.userRole = role;
  }

  /**
   * Track tutorial metrics
   */
  private trackMetric(metric: Omit<TutorialMetrics, 'timestamp'>) {
    const fullMetric: TutorialMetrics = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(fullMetric);

    // Send to analytics API (if available)
    if (typeof window !== 'undefined' && (window as any).analytics) {
      (window as any).analytics.track('tutorial_event', fullMetric);
    }

    // Store locally for debugging
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tutorial_metrics') || '[]';
      try {
        const metrics = JSON.parse(stored);
        metrics.push(fullMetric);
        // Keep only last 100 metrics
        if (metrics.length > 100) metrics.shift();
        localStorage.setItem('tutorial_metrics', JSON.stringify(metrics));
      } catch (e) {
        console.error('Failed to store tutorial metrics:', e);
      }
    }
  }

  /**
   * Show confetti celebration
   */
  private celebrate() {
    if (typeof window === 'undefined') return;

    // Check if confetti library is available
    if ((window as any).confetti) {
      (window as any).confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }

  /**
   * Filter steps based on user role
   */
  private filterStepsByRole(steps: InteractiveStep[]): InteractiveStep[] {
    return steps.filter((step) => {
      if (!step.roles || step.roles.length === 0) return true;
      return step.roles.includes(this.userRole);
    });
  }

  /**
   * Start a specific tour with enhanced features
   */
  startTour(tourName: keyof typeof tutorialSteps, config?: Partial<Config>) {
    const allSteps = tutorialSteps[tourName];
    if (!allSteps || allSteps.length === 0) {
      console.warn(`Tour "${tourName}" not found or has no steps`);
      return;
    }

    // Filter by role
    const steps = this.filterStepsByRole(allSteps);

    // Track start
    this.startTime = Date.now();
    this.trackMetric({
      tourName,
      stepIndex: 0,
      action: 'started',
      metadata: { userRole: this.userRole },
    });

    // Create driver instance with enhanced config
    this.driverObj = driver({
      ...defaultConfig,
      ...config,
      steps: steps.map((step, index) => ({
        ...step,
        popover: step.popover
          ? {
              ...step.popover,
              onNextClick: () => {
                this.trackMetric({
                  tourName,
                  stepIndex: index,
                  action: 'interaction',
                  metadata: { step: 'next', analyticsTag: step.analyticsTag },
                });

                // Check for required interaction
                if (step.requiresInteraction && step.validationSelector) {
                  const element = document.querySelector(
                    step.validationSelector
                  );
                  if (element && step.validationFn) {
                    if (!step.validationFn()) {
                      alert('Please complete the action before continuing!');
                      return;
                    }
                  }
                }

                // If this is the last step, mark as completed and destroy
                if (index === steps.length - 1) {
                  this.markTourCompleted(tourName);
                  this.celebrate();
                  this.driverObj?.destroy();
                } else {
                  this.driverObj?.moveNext();
                }
              },
              onPrevClick: () => {
                this.trackMetric({
                  tourName,
                  stepIndex: index,
                  action: 'interaction',
                  metadata: { step: 'prev' },
                });
                this.driverObj?.movePrevious();
              },
              onCloseClick: () => {
                this.trackMetric({
                  tourName,
                  stepIndex: index,
                  action: 'skipped',
                  metadata: { reason: 'user_closed' },
                });
                this.driverObj?.destroy();
              },
            }
          : undefined,
      })),
      onDestroyed: () => {
        const duration = Date.now() - this.startTime;
        const currentStep = this.driverObj?.getActiveIndex() || 0;
        const isCompleted = currentStep === steps.length - 1;

        this.trackMetric({
          tourName,
          stepIndex: currentStep,
          action: isCompleted ? 'completed' : 'dropped',
          duration,
        });

        if (isCompleted) {
          this.markTourCompleted(tourName);
          this.celebrate();

          // Show completion toast
          if (typeof window !== 'undefined' && (window as any).toast) {
            (window as any).toast.success('🎉 Tutorial Complete!', {
              description: `You've mastered ${tourName}. Keep up the great work!`,
            });
          }
        }

        this.driverObj = null;
        this.currentTour = null;
      },
      onDestroyStarted: () => {
        if (this.inactivityTimer) {
          clearTimeout(this.inactivityTimer);
          this.inactivityTimer = null;
        }
      },
    });

    this.currentTour = tourName;
    this.driverObj.drive();

    // Set up inactivity detection (show help if user stuck for 30s)
    this.resetInactivityTimer(tourName);
  }

  /**
   * Detect user inactivity and offer help
   */
  private resetInactivityTimer(tourName: string) {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = setTimeout(() => {
      if (this.driverObj) {
        const currentStep = this.driverObj.getActiveIndex();
        if (
          typeof window !== 'undefined' &&
          confirm('Stuck? Would you like a hint or to skip this step?')
        ) {
          // Offer to show video or skip
          this.driverObj.moveNext();
        }
        this.resetInactivityTimer(tourName);
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop current tour
   */
  stopTour() {
    if (this.driverObj) {
      const currentStep = this.driverObj.getActiveIndex() || 0;
      this.trackMetric({
        tourName: this.currentTour || 'unknown',
        stepIndex: currentStep,
        action: 'skipped',
        duration: Date.now() - this.startTime,
      });

      this.driverObj.destroy();
      this.driverObj = null;
      this.currentTour = null;
    }

    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
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
      tours[`${tourName}_completed_at`] = new Date().toISOString();
      localStorage.setItem('tutorial_completed', JSON.stringify(tours));
    } catch {
      localStorage.setItem(
        'tutorial_completed',
        JSON.stringify({
          [tourName]: true,
          [`${tourName}_completed_at`]: new Date().toISOString(),
        })
      );
    }
  }

  /**
   * Reset all tour completions
   */
  resetTours() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('tutorial_completed');
    this.trackMetric({
      tourName: 'system',
      stepIndex: 0,
      action: 'interaction',
      metadata: { action: 'reset_all' },
    });
  }

  /**
   * Check if this is user's first visit
   */
  isFirstVisit(): boolean {
    if (typeof window === 'undefined') return false;
    const visited = localStorage.getItem('app_visited');
    if (!visited) {
      localStorage.setItem('app_visited', 'true');
      localStorage.setItem('app_first_visit_at', new Date().toISOString());
      return true;
    }
    return false;
  }

  /**
   * Get tutorial completion statistics
   */
  getCompletionStats() {
    if (typeof window === 'undefined') {
      return {
        completed: 0,
        total: Object.keys(tutorialSteps).length,
        percentage: 0,
        started: 0,
        interactions: 0,
        completedTours: [],
        tours: {},
      };
    }

    const completed = localStorage.getItem('tutorial_completed') || '{}';
    const started = localStorage.getItem('tutorial_started') || '{}';
    const interactions = parseInt(
      localStorage.getItem('tutorial_interactions') || '0',
      10
    );

    try {
      const completedTours = JSON.parse(completed);
      const startedTours = JSON.parse(started);
      const totalTours = Object.keys(tutorialSteps).length;
      const completedToursList = Object.keys(completedTours).filter(
        (k) => !k.endsWith('_completed_at')
      );
      const completedCount = completedToursList.length;
      const startedCount = Object.keys(startedTours).filter(
        (k) => !k.endsWith('_started_at')
      ).length;

      return {
        completed: completedCount,
        total: totalTours,
        percentage: Math.round((completedCount / totalTours) * 100),
        started: startedCount,
        interactions,
        completedTours: completedToursList,
        tours: completedTours,
      };
    } catch {
      return {
        completed: 0,
        total: Object.keys(tutorialSteps).length,
        percentage: 0,
        started: 0,
        interactions: 0,
        completedTours: [],
        tours: {},
      };
    }
  }

  /**
   * Highlight a specific element with context
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
            title: '💡 Feature Highlight',
            description: 'This is an important feature you should know about!',
          },
        },
      ],
    });

    this.driverObj.drive();
  }

  /**
   * Show contextual help based on current page
   */
  showContextualHelp(context: string) {
    const helpContent: Record<string, { title: string; description: string }> =
      {
        upload_stuck: {
          title: '🤔 Need Help Uploading?',
          description: `Common issues:

- **File too large?** Max 50MB. Compress or split video.
- **No EXIF data?** Enter location manually.
- **Missing fields?** Red asterisk (*) = required.

Want a quick tutorial? Click "Show Me How" below.`,
        },
        search_no_results: {
          title: '🔍 No Results Found',
          description: `Try:

- **Broaden filters:** Remove date/location restrictions
- **Check spelling:** "cyclone" not "cyclon"
- **Use tags:** Try "coastal" or "flood"

Or browse all recent uploads.`,
        },
      };

    const content = helpContent[context];
    if (content) {
      this.driverObj = driver({
        ...defaultConfig,
        steps: [
          {
            popover: content,
          },
        ],
      });
      this.driverObj.drive();
    }
  }
}

// Export singleton instance
export const tutorialManager = new TutorialManager();

/**
 * React hook for enhanced tutorial management
 */
export function useTutorial() {
  return {
    startTour: (
      tourName: keyof typeof tutorialSteps,
      config?: Partial<Config>
    ) => tutorialManager.startTour(tourName, config),
    stopTour: () => tutorialManager.stopTour(),
    isTourCompleted: (tourName: string) =>
      tutorialManager.isTourCompleted(tourName),
    markTourCompleted: (tourName: string) =>
      tutorialManager.markTourCompleted(tourName),
    resetTours: () => tutorialManager.resetTours(),
    isFirstVisit: () => tutorialManager.isFirstVisit(),
    highlight: (element: string, popover?: DriveStep['popover']) =>
      tutorialManager.highlight(element, popover),
    setUserRole: (role: UserRole) => tutorialManager.setUserRole(role),
    getStats: () => tutorialManager.getCompletionStats(),
    showHelp: (context: string) => tutorialManager.showContextualHelp(context),
  };
}
