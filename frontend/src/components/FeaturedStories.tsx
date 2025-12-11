'use client';

import { useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from 'react-compare-slider';
import { Camera, MapPin, Calendar, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { sanitizeText } from '@/lib/sanitize';
import { getApiUrl } from '@/lib/config';

interface Story {
  id: string;
  title: string;
  description: string;
  beforeImage: string;
  afterImage: string;
  location: string;
  date: string;
  hazardType: string;
  impact: string;
}

interface Props {
  stories: Story[];
  className?: string;
}

export default function FeaturedStories({ stories, className = '' }: Props) {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 300], [0, -50]);
  const y2 = useTransform(scrollY, [0, 300], [0, 50]);

  if (stories.length === 0) {
    return null;
  }

  return (
    <section className={`relative overflow-hidden ${className}`}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm uppercase tracking-wide text-pacific-400">Impact Chronicles</p>
            <h2 className="mt-2 text-4xl font-bold text-white">Featured Stories</h2>
            <p className="mt-4 text-lg text-white/70">
              Visual narratives showing the transformative power of Pacific hazards
            </p>
          </motion.div>
        </div>

        <div className="space-y-20">
          {stories.map((story, index) => (
            <StoryCard
              key={story.id}
              story={story}
              index={index}
              parallaxY={index % 2 === 0 ? y1 : y2}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface StoryCardProps {
  story: Story;
  index: number;
  parallaxY: any;
}

function StoryCard({ story, index, parallaxY }: StoryCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isEven = index % 2 === 0;

  return (
    <motion.div
      className={`grid gap-8 lg:grid-cols-2 ${isEven ? '' : 'lg:grid-flow-col-dense'}`}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.8, delay: index * 0.1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Comparison */}
      <motion.div
        className={`relative overflow-hidden rounded-3xl shadow-2xl ${isEven ? '' : 'lg:col-start-2'}`}
        style={{ y: parallaxY }}
      >
        <div className="aspect-[4/3] w-full">
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={story.beforeImage}
                alt="Before disaster"
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={story.afterImage}
                alt="After disaster"
              />
            }
            position={50}
            className="h-full w-full"
          />
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
          <div className="flex items-center gap-2 text-xs text-white/80">
            <span className="rounded-full bg-white/20 px-2 py-1 backdrop-blur">Before</span>
            <ArrowRight className="h-3 w-3" />
            <span className="rounded-full bg-white/20 px-2 py-1 backdrop-blur">After</span>
          </div>
        </div>
      </motion.div>

      {/* Story Content */}
      <motion.div
        className={`flex flex-col justify-center ${isEven ? '' : 'lg:col-start-1 lg:row-start-1'}`}
      >
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          <div className="mb-4 inline-block rounded-full bg-coral-500/20 px-4 py-1 text-sm font-semibold text-coral-300">
            {story.hazardType}
          </div>
          
          <h3 className="mb-4 text-3xl font-bold text-white">
            {sanitizeText(story.title)}
          </h3>
          
          <p className="mb-6 text-lg text-white/70">
            {sanitizeText(story.description)}
          </p>

          <div className="mb-6 space-y-3 text-sm text-white/60">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-pacific-400" />
              <span>{story.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-pacific-400" />
              <span>{story.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-pacific-400" />
              <span>{story.impact}</span>
            </div>
          </div>

          <Link
            href={`/images/${story.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-deep-900 transition hover:scale-105 hover:shadow-xl"
          >
            Explore Full Story
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}
