'use client';

import React, { useState } from 'react';
import {
  Camera,
  MapPin,
  FileText,
  AlertTriangle,
  PlayCircle,
  BookOpen,
  Download,
  ExternalLink,
  GraduationCap,
  Award,
  Users,
  Video,
} from 'lucide-react';
import FieldGuide from '@/components/FieldGuide';

type GuideType =
  | 'photography'
  | 'coordinates'
  | 'descriptions'
  | 'safety'
  | null;

export default function TrainingHubPage() {
  const [selectedGuide, setSelectedGuide] = useState<GuideType>(null);

  const guides = [
    {
      id: 'photography' as const,
      title: 'Photography Tips',
      description:
        'Learn how to capture high-quality disaster documentation photos',
      icon: Camera,
      color: 'blue',
      topics: [
        'Composition',
        'Safety',
        'Technical quality',
        'Hazard-specific tips',
      ],
    },
    {
      id: 'coordinates' as const,
      title: 'GPS Coordinates',
      description:
        'Master the art of determining and verifying location coordinates',
      icon: MapPin,
      color: 'green',
      topics: [
        'Understanding GPS',
        'Using your phone',
        'Estimating without GPS',
        'Accuracy',
      ],
    },
    {
      id: 'descriptions' as const,
      title: 'Effective Descriptions',
      description:
        'Write clear, informative descriptions that enhance your images',
      icon: FileText,
      color: 'purple',
      topics: ['Structure', 'Context', 'Examples', "Do's and don'ts"],
    },
    {
      id: 'safety' as const,
      title: 'Safety Guidelines',
      description: 'Essential safety practices for disaster documentation',
      icon: AlertTriangle,
      color: 'red',
      topics: [
        'Personal safety',
        'Environmental hazards',
        'Privacy',
        'Legal considerations',
      ],
    },
  ];

  const videoTutorials = [
    {
      title: 'Getting Started with Ocean Portal',
      duration: '5:30',
      thumbnail: '/illustrations/empty-state-pacific.svg',
      description:
        'Complete introduction to uploading your first disaster image',
    },
    {
      title: 'Pacific Hazards Field Guide',
      duration: '12:45',
      thumbnail: '/illustrations/loading-waves.svg',
      description:
        'Identifying and documenting common Pacific Island disasters',
    },
    {
      title: 'Advanced Metadata Techniques',
      duration: '8:20',
      thumbnail: '/illustrations/empty-state-pacific.svg',
      description: 'Maximizing the scientific value of your contributions',
    },
  ];

  const resources = [
    {
      title: 'Quick Reference Card (PDF)',
      description: 'Printable 1-page guide for field use',
      size: '2.4 MB',
      icon: Download,
    },
    {
      title: 'Mobile Checklist',
      description: 'Phone-friendly upload checklist',
      size: '850 KB',
      icon: Download,
    },
    {
      title: 'Pacific Hazards Database',
      description: 'Learn about regional disaster types',
      icon: ExternalLink,
    },
  ];

  const certifications = [
    {
      title: 'Certified Contributor',
      requirement: 'Complete all 4 field guides + upload 5 approved images',
      badge: '🌊',
      status: 'available',
    },
    {
      title: 'Quality Champion',
      requirement: 'Maintain 95% approval rate over 20 uploads',
      badge: '⭐',
      status: 'available',
    },
    {
      title: 'Community Trainer',
      requirement: 'Train 3 new contributors + 50 approved uploads',
      badge: '🎓',
      status: 'coming-soon',
    },
  ];

  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-200',
      hover: 'hover:bg-blue-100',
    },
    green: {
      bg: 'bg-green-50',
      text: 'text-green-600',
      border: 'border-green-200',
      hover: 'hover:bg-green-100',
    },
    purple: {
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      border: 'border-purple-200',
      hover: 'hover:bg-purple-100',
    },
    red: {
      bg: 'bg-red-50',
      text: 'text-red-600',
      border: 'border-red-200',
      hover: 'hover:bg-red-100',
    },
  };

  if (selectedGuide) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-4xl mx-auto mb-6">
          <button
            onClick={() => setSelectedGuide(null)}
            className="text-pacific-400 hover:text-pacific-300 font-medium flex items-center gap-2"
          >
            ← Back to Training Hub
          </button>
        </div>
        <FieldGuide type={selectedGuide} />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-400 rounded-lg p-8 mb-8 text-white">
          <div className="flex items-center gap-3 mb-3">
            <GraduationCap className="h-10 w-10" />
            <h1 className="text-3xl font-bold">Training Hub</h1>
          </div>
          <p className="text-lg text-blue-50 mb-4">
            Master the skills needed to contribute high-quality disaster
            documentation to Ocean Portal
          </p>
          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span>4 Field Guides</span>
            </div>
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              <span>3 Video Tutorials</span>
            </div>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              <span>3 Certifications</span>
            </div>
          </div>
        </div>

        {/* Field Guides */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-600" />
            Field Guides
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {guides.map((guide) => {
              const colors =
                colorClasses[guide.color as keyof typeof colorClasses];
              const Icon = guide.icon;

              return (
                <button
                  key={guide.id}
                  onClick={() => setSelectedGuide(guide.id)}
                  className={`${colors.bg} ${colors.border} border-2 rounded-lg p-6 text-left transition-all ${colors.hover} hover:shadow-md`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`${colors.text} p-3 rounded-lg bg-white`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 mb-2">
                        {guide.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-3">
                        {guide.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {guide.topics.map((topic, idx) => (
                          <span
                            key={idx}
                            className="text-xs bg-white px-2 py-1 rounded text-gray-700"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Video Tutorials */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <PlayCircle className="h-6 w-6 text-blue-600" />
            Video Tutorials
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {videoTutorials.map((video, idx) => (
              <div
                key={idx}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
              >
                <div className="relative bg-gray-100 h-48 flex items-center justify-center">
                  <PlayCircle className="h-16 w-16 text-blue-600 opacity-75" />
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                    {video.duration}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 mb-2">
                    {video.title}
                  </h3>
                  <p className="text-sm text-gray-600">{video.description}</p>
                  <button className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1">
                    <PlayCircle className="h-4 w-4" />
                    Watch Now
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Coming Soon:</strong> Interactive quizzes will be added to
              each video tutorial to test your knowledge!
            </p>
          </div>
        </section>

        {/* Downloadable Resources */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Download className="h-6 w-6 text-blue-600" />
            Downloadable Resources
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {resources.map((resource, idx) => {
              const Icon = resource.icon;
              return (
                <button
                  key={idx}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow text-left"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {resource.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        {resource.description}
                      </p>
                      {resource.size && (
                        <span className="text-xs text-gray-500">
                          {resource.size}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Certifications */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="h-6 w-6 text-blue-600" />
            Earn Certifications
          </h2>
          <div className="space-y-4">
            {certifications.map((cert, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-lg shadow-sm border-2 p-6 ${
                  cert.status === 'coming-soon'
                    ? 'border-gray-200 opacity-60'
                    : 'border-blue-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{cert.badge}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-gray-900">{cert.title}</h3>
                      {cert.status === 'coming-soon' && (
                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      <strong>Requirements:</strong> {cert.requirement}
                    </p>
                    {cert.status === 'available' && (
                      <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                        Start Working Towards This →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Community Learning */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Community Learning
          </h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <p className="text-gray-700 mb-4">
              Connect with experienced contributors and learn from the
              community!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Discussion Forums
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Ask questions, share tips, and learn from other citizen
                  scientists
                </p>
                <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                  Join Discussions →
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Mentorship Program
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Get paired with an experienced contributor for 1-on-1 guidance
                </p>
                <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                  Find a Mentor →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Help Section */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border-2 border-blue-200">
          <h3 className="font-bold text-gray-900 mb-2">Need Help?</h3>
          <p className="text-gray-700 mb-3">
            Our support team is here to assist you with any questions about
            contributing to Ocean Portal.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:support@oceanportal.org"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Email Support
            </a>
            <button className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium border border-blue-200">
              Live Chat
            </button>
            <button className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium border border-blue-200">
              FAQ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
