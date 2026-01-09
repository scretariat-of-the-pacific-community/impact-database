/**
 * Featured Stories - Curated editorial content for homepage display
 *
 * These are handpicked before/after comparisons showcasing significant
 * Pacific disaster events. Store satellite imagery in /public/featured/
 *
 * To add a new story:
 * 1. Add before/after images to /public/featured/
 * 2. Add entry to this array
 * 3. Deploy
 */

export interface FeaturedStory {
  id: string;
  title: string;
  description: string;
  beforeImage: string;
  afterImage: string;
  location: string;
  country: string;
  date: string;
  hazardType: string;
  impact: string;
  source?: string;
  sourceUrl?: string;
}

export const featuredStories: FeaturedStory[] = [
  {
    id: 'tonga-eruption-2022',
    title: 'Nukuʻalofa Port - Hunga Tonga-Hunga Haʻapai Eruption',
    description: `This satellite image shows the Nukuʻalofa port in Tonga after the Hunga Tonga-Hunga Haʻapai volcanic eruption and tsunami in January 2022. The port sustained damage from tsunami waves that reached up to 15 meters high on some west coasts. Thick ashfall, visible as gray coverage on the land, contaminated water supplies and delayed aid deliveries. The underwater fiber-optic communication cable was severed during the eruption, cutting off much of the island's connection to the outside world. The eruption was one of the largest recorded since 1991 and generated a massive ash plume and sonic boom detected worldwide.`,
    beforeImage: '/featured/tonga-before.jpg',
    afterImage: '/featured/tonga-after.jpg',
    location: 'Nukuʻalofa, Tongatapu',
    country: 'Tonga',
    date: '2022-01-15',
    hazardType: 'Volcanic Eruption & Tsunami',
    impact: '15m tsunami waves, communication severed, ash contamination',
    source: 'MAXAR Technologies',
    sourceUrl: 'https://www.maxar.com/',
  },
  {
    id: 'fiji-cyclone-winston-2016',
    title: 'Severe Tropical Cyclone Winston - Fiji',
    description: `This satellite image captures the devastating aftermath of Severe Tropical Cyclone Winston in Fiji. Winston was the strongest tropical cyclone ever recorded in the Southern Hemisphere, with winds reaching up to 185 mph (300 km/h). It made landfall on February 20, 2016, as a Category 5 storm, causing widespread destruction and claiming more than 40 lives. The image, provided by DigitalGlobe, shows an area where buildings are severely damaged or destroyed, and the landscape is denuded of vegetation. Communication was lost to many areas, and entire villages were destroyed, leading the government to declare a state of natural disaster for the whole of Fiji.`,
    beforeImage: '/featured/fiji-cyclone-before.avif',
    afterImage: '/featured/fiji-cyclone-after.jpg',
    location: 'Fiji',
    country: 'Fiji',
    date: '2016-02-20',
    hazardType: 'Category 5 Tropical Cyclone',
    impact: '185 mph winds, 40+ deaths, entire villages destroyed',
    source: 'DigitalGlobe',
    sourceUrl: 'https://www.maxar.com/products/commercial-imagery',
  },
];

export default featuredStories;
