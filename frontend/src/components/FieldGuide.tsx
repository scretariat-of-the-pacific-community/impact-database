'use client';

import React from 'react';
import {
  Camera,
  MapPin,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Book,
} from 'lucide-react';

interface GuideSection {
  title: string;
  content: string;
  tips?: string[];
  dos?: string[];
  donts?: string[];
}

interface FieldGuideProps {
  type: 'photography' | 'coordinates' | 'descriptions' | 'safety';
}

export default function FieldGuide({ type }: FieldGuideProps) {
  const photographyGuide: GuideSection[] = [
    {
      title: 'Before You Photograph',
      content:
        'Safety first! Never put yourself at risk to capture an image. Wait until it is safe to document disaster impacts.',
      tips: [
        'Check local authorities for safety advisories',
        'Bring necessary safety equipment (sturdy shoes, rain gear)',
        'Let someone know where you are going',
        'Charge your phone fully before heading out',
      ],
    },
    {
      title: 'Composition & Framing',
      content:
        'Good composition helps viewers understand the scale and severity of disaster impacts.',
      dos: [
        'Include reference objects for scale (people, buildings, vehicles)',
        'Capture wide shots showing the extent of damage',
        'Take multiple angles of the same scene',
        'Show before/after if possible (use archive photos)',
        'Include landmarks to help identify locations',
      ],
      donts: [
        "Don't zoom in too much - context is important",
        'Avoid cluttered backgrounds that distract from the subject',
        "Don't photograph people without permission",
        'Avoid images that could identify victims of trauma',
      ],
    },
    {
      title: 'Technical Quality',
      content:
        'High-quality images are more useful for analysis and documentation.',
      dos: [
        'Hold camera steady or use a tripod',
        'Ensure good lighting (natural light is best)',
        'Keep lens clean',
        'Use landscape orientation for wide scenes',
        'Take photos in highest resolution available',
      ],
      donts: [
        "Don't use excessive filters or editing",
        'Avoid very low light conditions (blurry images)',
        "Don't over-compress images before uploading",
      ],
    },
    {
      title: 'Timing & Documentation',
      content:
        'When you take photos matters for tracking disaster progression.',
      tips: [
        'Take photos during the event if safe (king tides, flooding)',
        'Document aftermath within 24-48 hours',
        'Return to same location days/weeks later for recovery progress',
        'Note the exact time photos were taken',
        'Enable GPS tagging in camera settings',
      ],
    },
    {
      title: 'Specific Hazard Tips',
      content:
        'Different disasters require different documentation approaches.',
      tips: [
        '🌀 Cyclones: Damage to structures, fallen trees, debris, flooding',
        '🌊 Floods: Water level markers, inundated areas, erosion',
        '🌪️ Tsunamis: Debris lines, structural damage, boats displaced inland',
        '🌡️ Droughts: Dried water sources, cracked soil, crop damage',
        '🏔️ Landslides: Slope failures, debris flows, damaged infrastructure',
      ],
    },
  ];

  const coordinatesGuide: GuideSection[] = [
    {
      title: 'Understanding Coordinates',
      content:
        'GPS coordinates pinpoint exact locations on Earth using latitude and longitude.',
      tips: [
        'Latitude: North-South position (-90° to +90°)',
        'Longitude: East-West position (-180° to +180°)',
        'Format: Decimal degrees (e.g., -18.1416, 178.4419 for Suva, Fiji)',
        'Positive latitude = North, Negative = South',
        'Positive longitude = East, Negative = West',
      ],
    },
    {
      title: 'Getting Coordinates from Your Phone',
      content: 'Modern smartphones make it easy to find GPS coordinates.',
      dos: [
        'iPhone: Open Maps, drop a pin, swipe up for coordinates',
        'Android: Long-press on map apps to see coordinates',
        'Enable location services before taking photos',
        'Most cameras embed GPS data in image metadata (EXIF)',
      ],
    },
    {
      title: 'Estimating Coordinates Without GPS',
      content: 'You can still provide useful location data without GPS.',
      tips: [
        'Use OpenStreetMap.org to click location and copy coordinates',
        'Reference known landmarks (school, church, town hall)',
        'Estimate distance/direction from major locations',
        'Use village/district names if coordinates unavailable',
      ],
    },
    {
      title: 'Coordinate Accuracy',
      content: 'More precise coordinates enable better spatial analysis.',
      dos: [
        'Aim for at least 4 decimal places (±11 meters accuracy)',
        'Stand at the photo location, not nearby',
        'Wait for GPS to stabilize (15-30 seconds)',
        'Check that coordinates make sense (are you in the Pacific?)',
      ],
      donts: [
        "Don't guess coordinates - it's better to leave blank",
        "Don't copy coordinates from different locations",
        "Don't mix up latitude and longitude",
      ],
    },
    {
      title: 'Verifying Coordinates',
      content: 'Always double-check your coordinates before submitting.',
      tips: [
        'Paste coordinates into OpenStreetMap.org to verify location',
        'Pacific Islands are roughly: Lat -25° to 25°, Long 130° to -130°',
        'Fiji example: -18.1416, 178.4419 (Suva)',
        "Tonga example: -21.1789, -175.1982 (Nuku'alofa)",
        'Samoa example: -13.8506, -171.7513 (Apia)',
      ],
    },
  ];

  const descriptionsGuide: GuideSection[] = [
    {
      title: 'What Makes a Good Description',
      content:
        'Effective descriptions provide context that images alone cannot convey.',
      dos: [
        'State what disaster/hazard is shown',
        'Specify when it occurred (date and time)',
        'Describe the severity and impacts',
        'Mention affected areas or communities',
        'Include any relevant measurements (water depth, wind speed)',
      ],
      donts: [
        'Don\'t use vague terms like "bad flooding" - be specific',
        'Avoid emotional language - stick to factual observations',
        "Don't include personal opinions about causes",
        "Don't identify individuals without consent",
      ],
    },
    {
      title: 'Structure Your Description',
      content: 'Follow a logical structure for clarity.',
      tips: [
        '1. What: "Coastal flooding from king tide"',
        '2. When: "January 15, 2025, approximately 11:00 AM"',
        '3. Where: "Suva foreshore area, near Government Buildings"',
        '4. Impact: "Water reached 2 meters above normal, flooding 3 buildings"',
        '5. Context: "Highest tide in 10 years according to residents"',
      ],
    },
    {
      title: 'Examples of Effective Descriptions',
      content: 'Learn from these well-written examples.',
      dos: [
        '✅ "Tropical Cyclone Ana aftermath, Jan 30, 2025. Category 3 cyclone destroyed 5 homes in Vatulele village. Photo shows collapsed roof structure and debris. Winds estimated 150 km/h."',
        '✅ "Flash flooding on Queens Road near Navua, Feb 5, 2025, 3:00 PM. River overflowed after 200mm rain in 6 hours. Water depth approximately 1.5 meters, road impassable."',
        '✅ "Tsunami debris in Nuku\'alofa harbor following 8.2 magnitude earthquake, March 10, 2025. Water receded 200 meters, then surged 4 meters above normal, depositing boats inland."',
      ],
      donts: [
        '❌ "Big flood" - Too vague, no context',
        '❌ "This is terrible, someone should do something" - Emotional, not factual',
        '❌ "Flooding caused by climate change" - Attribution requires scientific analysis',
      ],
    },
    {
      title: 'Additional Context to Include',
      content:
        'These details enhance the scientific value of your contribution.',
      tips: [
        'Weather conditions (rain, wind, sea state)',
        'Comparison to previous events ("worst since 2019")',
        'Community response or evacuations',
        'Infrastructure damage (roads closed, power out)',
        'Traditional knowledge or local observations',
      ],
    },
  ];

  const safetyGuide: GuideSection[] = [
    {
      title: 'Personal Safety Comes First',
      content: 'NO photograph is worth risking your life or safety.',
      dos: [
        'Wait until authorities declare area safe',
        'Follow evacuation orders immediately',
        'Wear protective equipment (boots, gloves, mask)',
        'Bring first aid kit and emergency supplies',
        'Travel with a partner, never alone',
      ],
      donts: [
        'NEVER enter flooded areas (hidden hazards, currents)',
        "Don't approach damaged structures (collapse risk)",
        "Don't touch downed power lines or debris",
        "Don't drive through flooded roads",
        'Don\'t take risks for "better photos"',
      ],
    },
    {
      title: 'Environmental Hazards',
      content: 'Disaster zones contain many hidden dangers.',
      tips: [
        '⚠️ Contaminated water (sewage, chemicals)',
        '⚠️ Unstable ground (sinkholes, erosion)',
        '⚠️ Sharp debris (glass, metal, nails)',
        '⚠️ Electrical hazards (downed lines)',
        '⚠️ Structural instability (buildings, trees)',
        '⚠️ Disease risk (standing water, mosquitoes)',
      ],
    },
    {
      title: 'Respecting Privacy & Dignity',
      content: 'Be culturally sensitive when documenting disasters.',
      dos: [
        'Ask permission before photographing people',
        'Respect "no entry" signs and barriers',
        'Honor cultural sites and sacred areas',
        'Be empathetic to trauma and loss',
        'Offer assistance before taking photos',
      ],
      donts: [
        "Don't photograph victims in distress",
        "Don't enter private property without permission",
        "Don't interfere with emergency response",
        "Don't share graphic images on social media",
        "Don't exploit tragedy for sensationalism",
      ],
    },
    {
      title: 'Legal & Ethical Considerations',
      content: 'Understand your rights and responsibilities.',
      tips: [
        'You can photograph from public spaces',
        'Obey all local laws and regulations',
        'Media credentials may be required in some areas',
        'Images you submit become part of public record (CC-BY-4.0 license)',
        'Credit the photographer (you!) to prevent misuse',
      ],
    },
    {
      title: 'Emergency Contact Information',
      content: 'Know who to call in emergencies.',
      tips: [
        '🚨 Fiji Emergency: 911 or 917',
        '🚨 Tonga Emergency: 911',
        '🚨 Samoa Emergency: 994 (Fire), 995 (Police), 996 (Ambulance)',
        '🌊 Pacific Tsunami Warning Center: monitor radio/TV',
        '📱 Save local disaster management agency numbers',
      ],
    },
  ];

  const guides = {
    photography: {
      title: 'Photography Tips for Disaster Documentation',
      icon: Camera,
      sections: photographyGuide,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    coordinates: {
      title: 'How to Determine Coordinates',
      icon: MapPin,
      sections: coordinatesGuide,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    descriptions: {
      title: 'Writing Effective Descriptions',
      icon: FileText,
      sections: descriptionsGuide,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    safety: {
      title: 'Safety Guidelines',
      icon: AlertTriangle,
      sections: safetyGuide,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  };

  const currentGuide = guides[type];
  const Icon = currentGuide.icon;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className={`${currentGuide.bgColor} rounded-lg p-6 mb-6`}>
        <div className="flex items-center gap-3 mb-2">
          <Icon className={`h-8 w-8 ${currentGuide.color}`} />
          <h1 className="text-2xl font-bold text-gray-900">
            {currentGuide.title}
          </h1>
        </div>
        <p className="text-gray-700">
          Essential guidelines for contributing high-quality disaster
          documentation to Pacific Impact Atlas.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {currentGuide.sections.map((section) => (
          <div
            key={section.title}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <Book className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-semibold text-gray-900">
                {section.title}
              </h2>
            </div>

            <p className="text-gray-700 mb-4">{section.content}</p>

            {/* Tips */}
            {section.tips && section.tips.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  <h3 className="font-medium text-gray-900">Tips:</h3>
                </div>
                <ul className="space-y-1 ml-6">
                  {section.tips.map((tip) => (
                    <li
                      key={`${section.title}-tip-${tip}`}
                      className="text-gray-700 text-sm"
                    >
                      • {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dos */}
            {section.dos && section.dos.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <h3 className="font-medium text-green-700">Do:</h3>
                </div>
                <ul className="space-y-1 ml-6">
                  {section.dos.map((item: any) => (
                    <li
                      key={`${section.title}-do-${item}`}
                      className="text-gray-700 text-sm"
                    >
                      ✓ {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Don'ts */}
            {section.donts && section.donts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <h3 className="font-medium text-red-700">Don&apos;t:</h3>
                </div>
                <ul className="space-y-1 ml-6">
                  {section.donts.map((item: any) => (
                    <li
                      key={`${section.title}-dont-${item}`}
                      className="text-gray-700 text-sm"
                    >
                      ✗ {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-600">
          <strong>Need more help?</strong> Contact our support team at{' '}
          <a
            href="mailto:support@oceanportal.org"
            className="text-blue-600 hover:underline"
          >
            support@oceanportal.org
          </a>{' '}
          or visit our community forums.
        </p>
      </div>
    </div>
  );
}
