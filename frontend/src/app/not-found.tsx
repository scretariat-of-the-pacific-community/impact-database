'use client';

import Link from 'next/link';
import { Home, Search, RefreshCw, Compass } from 'lucide-react';
import { motion } from 'framer-motion';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-deep-950 via-pacific-950 to-deep-950 px-4">
      <div className="mx-auto max-w-2xl text-center">
        {/* Animated 404 with Pacific wave theme */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <div className="mb-8 inline-block">
            <div className="relative">
              {/* Wave animation behind 404 */}
              <svg
                className="absolute -left-8 -top-8 h-48 w-48 opacity-20"
                viewBox="0 0 200 200"
              >
                <motion.circle
                  cx="100"
                  cy="100"
                  r="80"
                  stroke="#009EE0"
                  strokeWidth="2"
                  fill="none"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.4, 0.2] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
              </svg>

              <h1 className="relative text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pacific-400 via-palm-400 to-coral-400">
                404
              </h1>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h2 className="mb-4 text-3xl font-semibold text-white">
              Lost in the Pacific Ocean
            </h2>
            <p className="mb-8 text-lg text-white/70">
              This page has drifted away like a message in a bottle. Let&apos;s
              navigate you back to familiar shores.
            </p>
          </motion.div>

          {/* Island illustration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mx-auto mb-12 h-48 w-full"
          >
            <svg viewBox="0 0 400 200" className="h-full w-full">
              <defs>
                <linearGradient
                  id="oceanGrad404"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#009EE0" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#0369A1" stopOpacity="0.6" />
                </linearGradient>
              </defs>

              {/* Ocean waves */}
              <path
                d="M0 120 Q 50 110, 100 120 T 200 120 T 300 120 T 400 120 L 400 200 L 0 200 Z"
                fill="url(#oceanGrad404)"
                opacity="0.4"
              />
              <path
                d="M0 140 Q 60 130, 120 140 T 240 140 T 360 140 T 400 140 L 400 200 L 0 200 Z"
                fill="url(#oceanGrad404)"
                opacity="0.6"
              />

              {/* Island */}
              <ellipse
                cx="200"
                cy="110"
                rx="60"
                ry="20"
                fill="#18B374"
                opacity="0.6"
              />
              <path
                d="M 160 110 Q 180 85, 200 95 Q 220 85, 240 110"
                fill="#18B374"
                opacity="0.8"
              />

              {/* Palm tree */}
              <rect
                x="198"
                y="95"
                width="4"
                height="20"
                fill="#8B4513"
                opacity="0.8"
              />
              <path
                d="M 200 95 Q 185 85, 180 88"
                stroke="#18B374"
                strokeWidth="3"
                fill="none"
                opacity="0.9"
              />
              <path
                d="M 200 95 Q 215 85, 220 88"
                stroke="#18B374"
                strokeWidth="3"
                fill="none"
                opacity="0.9"
              />
              <path
                d="M 200 95 Q 195 80, 197 75"
                stroke="#18B374"
                strokeWidth="3"
                fill="none"
                opacity="0.9"
              />

              {/* Compass floating */}
              <g transform="translate(280, 80)">
                <circle r="15" fill="#FF6B4A" opacity="0.2" />
                <motion.g
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                >
                  <path
                    d="M 0 -10 L 2 0 L 0 10 L -2 0 Z"
                    fill="#FF6B4A"
                    opacity="0.8"
                  />
                </motion.g>
              </g>
            </svg>
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pacific-500 to-palm-500 px-6 py-3 font-semibold text-white shadow-lg transition hover:shadow-xl hover:scale-105"
            >
              <Home className="h-5 w-5" />
              Back to Home
            </Link>

            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              <Search className="h-5 w-5" />
              Search Database
            </Link>

            <Link
              href="/map"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              <Compass className="h-5 w-5" />
              Explore Map
            </Link>
          </motion.div>

          {/* Helpful suggestions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur"
          >
            <h3 className="mb-3 font-semibold text-white">Suggestions:</h3>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-pacific-400">→</span>
                <span>Check the URL for typos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-palm-400">→</span>
                <span>Use the search bar to find specific hazard imagery</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-coral-400">→</span>
                <span>Browse the interactive map for geographic data</span>
              </li>
            </ul>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
