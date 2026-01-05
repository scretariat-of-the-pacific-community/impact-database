'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RefreshCw, AlertTriangle, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-deep-950 via-coral-950 to-deep-950 px-4">
      <div className="mx-auto max-w-2xl text-center">
        {/* Animated storm illustration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          {/* Storm visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mx-auto mb-8 h-64 w-full"
          >
            <svg viewBox="0 0 400 250" className="h-full w-full">
              <defs>
                <linearGradient id="stormSky" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#1e293b" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#FF6B4A" stopOpacity="0.3" />
                </linearGradient>
                <linearGradient id="roughSea" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0369A1" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              {/* Stormy sky */}
              <rect
                x="0"
                y="0"
                width="400"
                height="150"
                fill="url(#stormSky)"
              />

              {/* Lightning */}
              <motion.path
                d="M 180 30 L 190 80 L 175 80 L 185 130"
                stroke="#FF6B4A"
                strokeWidth="3"
                fill="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              />

              {/* Storm clouds */}
              <ellipse
                cx="150"
                cy="60"
                rx="50"
                ry="25"
                fill="#1e293b"
                opacity="0.7"
              />
              <ellipse
                cx="200"
                cy="50"
                rx="60"
                ry="30"
                fill="#334155"
                opacity="0.8"
              />
              <ellipse
                cx="250"
                cy="55"
                rx="45"
                ry="22"
                fill="#1e293b"
                opacity="0.7"
              />

              {/* Rough seas with high waves */}
              <motion.path
                d="M0 160 Q 50 140, 100 160 T 200 160 T 300 160 T 400 160 L 400 250 L 0 250 Z"
                fill="url(#roughSea)"
                opacity="0.5"
                animate={{
                  d: [
                    'M0 160 Q 50 140, 100 160 T 200 160 T 300 160 T 400 160 L 400 250 L 0 250 Z',
                    'M0 160 Q 50 170, 100 160 T 200 160 T 300 160 T 400 160 L 400 250 L 0 250 Z',
                    'M0 160 Q 50 140, 100 160 T 200 160 T 300 160 T 400 160 L 400 250 L 0 250 Z',
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              <motion.path
                d="M0 180 Q 60 160, 120 180 T 240 180 T 360 180 T 400 180 L 400 250 L 0 250 Z"
                fill="url(#roughSea)"
                opacity="0.7"
                animate={{
                  d: [
                    'M0 180 Q 60 160, 120 180 T 240 180 T 360 180 T 400 180 L 400 250 L 0 250 Z',
                    'M0 180 Q 60 190, 120 180 T 240 180 T 360 180 T 400 180 L 400 250 L 0 250 Z',
                    'M0 180 Q 60 160, 120 180 T 240 180 T 360 180 T 400 180 L 400 250 L 0 250 Z',
                  ],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 0.3,
                }}
              />

              {/* Warning buoy */}
              <motion.g
                animate={{ y: [0, -5, 0, -3, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <circle cx="320" cy="170" r="12" fill="#FF6B4A" />
                <circle cx="320" cy="170" r="8" fill="#ffffff" opacity="0.3" />
                <path
                  d="M 320 158 L 320 140"
                  stroke="#FF6B4A"
                  strokeWidth="2"
                />
                <circle cx="320" cy="140" r="3" fill="#FF6B4A" />
              </motion.g>

              {/* Rain */}
              {[...Array(15)].map((_, i) => (
                <motion.line
                  key={`raindrop-${i}`}
                  x1={20 + i * 25}
                  y1="20"
                  x2={15 + i * 25}
                  y2="50"
                  stroke="#94a3b8"
                  strokeWidth="1"
                  opacity="0.4"
                  initial={{ y: 0 }}
                  animate={{ y: [0, 100] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </svg>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center gap-3 rounded-full bg-coral-500/20 px-4 py-2 text-coral-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Something Went Wrong</span>
            </div>

            <h1 className="mb-4 text-4xl font-bold text-white">
              Rough Seas Ahead
            </h1>

            <p className="mb-8 text-lg text-white/70">
              We&apos;ve encountered unexpected rough waters. Our crew is
              working to calm the storm.
              {error.digest && (
                <span className="mt-2 block text-sm text-white/50">
                  Error ID: {error.digest}
                </span>
              )}
            </p>
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <button
              onClick={reset}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-coral-500 to-pacific-500 px-6 py-3 font-semibold text-white shadow-lg transition hover:shadow-xl hover:scale-105"
            >
              <RefreshCw className="h-5 w-5 transition group-hover:rotate-180" />
              Try Again
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              <Home className="h-5 w-5" />
              Return Home
            </Link>
          </motion.div>

          {/* Error details */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur"
          >
            <h3 className="mb-3 font-semibold text-white">What happened?</h3>
            <p className="mb-4 text-sm text-white/70">
              {error.message ||
                'An unexpected error occurred while processing your request.'}
            </p>

            <div className="flex flex-col gap-2 text-sm">
              <h4 className="font-semibold text-white">What you can do:</h4>
              <ul className="space-y-2 text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-coral-400">→</span>
                  <span>Try refreshing the page using the button above</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pacific-400">→</span>
                  <span>Check your internet connection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-palm-400">→</span>
                  <span>Contact support if the problem persists</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 flex items-center justify-center">
              <a
                href="mailto:support@pacifichazards.org"
                className="inline-flex items-center gap-2 text-sm text-pacific-400 transition hover:text-pacific-300"
              >
                <MessageCircle className="h-4 w-4" />
                Report this issue
              </a>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
