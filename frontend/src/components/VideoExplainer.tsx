'use client';

import { motion } from 'framer-motion';
import { Play, X } from 'lucide-react';
import { useState } from 'react';

interface VideoExplainerProps {
  videoId?: string;
  title?: string;
  description?: string;
}

export default function VideoExplainer({
  videoId = 'KOBVBk8OD5I', // Pacific Climate Change & Resilience video
  title = 'How Pacific Impact Atlas Works',
  description = 'Learn how to contribute disaster imagery and help build climate resilience across the Pacific region',
}: VideoExplainerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);

  return (
    <section className="mx-auto max-w-7xl py-16">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/60 to-pacific-900/20 p-8 backdrop-blur">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-wide text-white/70">
            Learn More
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">{title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">{description}</p>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-2xl bg-deep-950/80">
          {!isPlaying ? (
            <motion.button
              onClick={() => setIsPlaying(true)}
              className="group absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pacific-900/50 to-deep-950/90 transition hover:from-pacific-800/60 hover:to-deep-900/90"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Thumbnail placeholder */}
              <div className="absolute inset-0 bg-gradient-to-br from-pacific-900/40 to-deep-950/60" />

              {/* Play button */}
              <motion.div
                className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition group-hover:bg-white/30"
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Play className="ml-1 h-8 w-8 fill-white text-white" />
              </motion.div>

              {/* Video info overlay */}
              <div className="absolute bottom-6 left-6 right-6 text-left">
                <p className="text-sm text-white/80">▶ Watch Introduction</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Contributing to Pacific Resilience
                </h3>
              </div>
            </motion.button>
          ) : (
            <div className="relative h-full w-full">
              {loadError ? (
                <div className="flex h-full items-center justify-center bg-deep-950/90">
                  <div className="text-center">
                    <p className="text-white/70">Unable to load video</p>
                    <button
                      onClick={() => {
                        setLoadError(false);
                        setIsPlaying(false);
                      }}
                      className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                  title={title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                  onError={() => setLoadError(true)}
                />
              )}
              <button
                onClick={() => setIsPlaying(false)}
                className="absolute right-4 top-4 z-20 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* Video features */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <motion.div
            className="rounded-xl border border-white/10 bg-white/5 p-4 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-2xl font-bold text-pacific-400">3:45</p>
            <p className="mt-1 text-sm text-white/70">Quick Overview</p>
          </motion.div>

          <motion.div
            className="rounded-xl border border-white/10 bg-white/5 p-4 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <p className="text-2xl font-bold text-palm-400">5 Steps</p>
            <p className="mt-1 text-sm text-white/70">Upload Process</p>
          </motion.div>

          <motion.div
            className="rounded-xl border border-white/10 bg-white/5 p-4 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <p className="text-2xl font-bold text-coral-400">100%</p>
            <p className="mt-1 text-sm text-white/70">Community Driven</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
