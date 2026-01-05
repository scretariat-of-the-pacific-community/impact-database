/**
 * Site-wide configuration for branding, content, and feature flags
 */

export const siteConfig = {
  name: 'Pacific Impact Atlas',
  tagline: 'Disaster Evidence Documentation',

  description:
    'Disaster and hazard image metadata management system for Pacific Island communities',

  // Current sprint/iteration branding
  sprint: {
    name: 'Data Storytelling',
    week: 'Week 2',
    display: 'Data Storytelling · Week 2',
  },

  // Contact & emergency
  emergency: {
    fiji: '911',
    tonga: '911',
    samoa: {
      police: '994',
      fire: '995',
      ambulance: '996',
    },
  },

  // Feature flags
  features: {
    analytics: true,
    offlineMode: true,
    pushNotifications: false,
    aiDescriptions: false,
  },

  pages: {
    home: {
      hero: {
        badge: 'Data Storytelling · Week 2',
        title: 'Interactive maps & visual intelligence for Pacific hazards',
        subtitle:
          'Explore 3D terrain, heatmaps, and timeline-driven insights. Discover compelling before/after stories and real-time activity across the Pacific region.',
        actions: [
          {
            kind: 'link',
            href: '/search',
            label: 'Launch Search',
            variant: 'ocean',
            icon: 'Search',
          },
          {
            kind: 'link',
            href: '/upload',
            label: 'Upload Field Sighting',
            variant: 'coral',
            icon: 'Upload',
          },
          {
            kind: 'button',
            label: 'Watch the Story',
            variant: 'coral',
            icon: 'Sparkles',
            ariaLabel: 'Watch the story video',
          },
        ],
      },
      navigation: {
        eyebrow: 'Platform Wayfinding',
        title: 'Navigate the portal with purpose',
        description:
          'Jump into key workflows that keep the hazard pipeline flowing.',
        cards: [
          {
            href: '/search',
            title: 'Search & Browse',
            description:
              'Precision filters for hazard type, metadata fields, and timeframes.',
            icon: 'Search',
            cta: 'Explore Catalog',
            ctaIcon: 'Filter',
            accent: 'from-pacific-500/20 to-pacific-500/5',
          },
          {
            href: '/map',
            title: 'Interactive Map',
            description:
              'Discover geolocated imagery with EEZ filters and spatial tools.',
            icon: 'MapPin',
            cta: 'View Map',
            ctaIcon: 'Compass',
            accent: 'from-palm-500/20 to-palm-500/5',
          },
          {
            href: '/analytics',
            title: 'Insights & Trends',
            description:
              'Review hazard frequency, response velocity, and reviewer capacity.',
            icon: 'TrendingUp',
            cta: 'Open Insights',
            ctaIcon: 'Sparkles',
            accent: 'from-coral-500/20 to-coral-500/5',
          },
          {
            href: '/training',
            title: 'Training Hub',
            description:
              'Field guides, tutorials, and best practices for quality contributions.',
            icon: 'GraduationCap',
            cta: 'Start Learning',
            ctaIcon: 'BookOpen',
            accent: 'from-sand-500/20 to-sand-500/5',
          },
        ],
      },
      sections: {
        dataInsights: {
          eyebrow: 'Data Insights',
          title: 'Visual Analytics Dashboard',
          description:
            'Track hazard patterns and community contributions in real-time.',
        },
        metrics: {
          eyebrow: 'Mission Metrics',
          title: 'Operational coverage snapshot',
          description:
            'Monitor catalog depth, hazard mix, contributor count, and geotag coverage.',
        },
        hazardIntelligence: {
          eyebrow: 'Hazard Intelligence',
          title: 'Pacific threat telemetry',
          description:
            'Sparkline feeds highlight the most active hazard archetypes each week.',
          badge: 'Live telemetry',
        },
        impactGallery: {
          eyebrow: 'Impact Stories',
          title: 'Immersive Impact Gallery',
          description:
            'Lightweight thumbnails with instant lightbox bring before/after stories to life.',
          actionLabel: 'View full gallery',
        },
      },
    },
    search: {
      hero: {
        eyebrow: 'Catalog',
        title: 'Search Catalog',
        description:
          'Surface the right hazard imagery using guided filters and saved preferences.',
      },
      filters: {
        searchPlaceholder: 'Search images by title, keywords, location...',
        hazardLabel: 'Hazard Types',
        agenciesLabel: 'Source Agencies',
        dateLabel: 'Date Range',
        dateFromLabel: 'From',
        dateToLabel: 'To',
        sortLabel: 'Sort By',
      },
    },
  },
} as const;

export type SiteConfig = typeof siteConfig;
