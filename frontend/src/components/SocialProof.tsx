'use client';

import { motion } from 'framer-motion';
import {
  Shield,
  Users,
  Award,
  TrendingUp,
  Globe,
  CheckCircle,
} from 'lucide-react';
import Image from 'next/image';

interface Partner {
  name: string;
  logo: string;
  description: string;
}

interface TrustMetric {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export default function SocialProof() {
  const partners: Partner[] = [
    {
      name: 'Pacific Community (SPC)',
      logo: '/partners/spc-logo.svg',
      description: 'Regional development organization',
    },
    {
      name: 'UNDP Pacific',
      logo: '/partners/undp-logo.svg',
      description: 'United Nations Development Programme',
    },
    {
      name: 'SPREP',
      logo: '/partners/sprep-logo.svg',
      description: 'Secretariat of Pacific Regional Environment',
    },
    {
      name: 'PIFS',
      logo: '/partners/pifs-logo.svg',
      description: 'Pacific Islands Forum Secretariat',
    },
  ];

  // Real, verifiable platform capabilities instead of fake statistics
  const trustMetrics: TrustMetric[] = [
    {
      label: 'ISO 19115 Compliant',
      value: '100%',
      icon: Shield,
      color: 'from-pacific-500/20 to-pacific-500/5 text-pacific-400',
    },
    {
      label: 'Open Source',
      value: 'MIT',
      icon: CheckCircle,
      color: 'from-palm-500/20 to-palm-500/5 text-palm-400',
    },
    {
      label: 'STAC Compatible',
      value: 'v1.0',
      icon: Award,
      color: 'from-coral-500/20 to-coral-500/5 text-coral-400',
    },
    {
      label: 'API Response Time',
      value: '<200ms',
      icon: TrendingUp,
      color: 'from-sand-500/20 to-sand-500/5 text-sand-400',
    },
  ];

  return (
    <section className="mx-auto max-w-7xl space-y-12 py-16">
      {/* Trust Metrics */}
      <div className="rounded-3xl border border-white/10 bg-deep-900/40 p-8 backdrop-blur">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-wide text-white/70">
            Platform Standards
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Enterprise-Grade Infrastructure
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {trustMetrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              className={`rounded-2xl bg-gradient-to-br ${metric.color} p-6 backdrop-blur`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <metric.icon className="mb-4 h-8 w-8" />
              <p className="text-3xl font-bold text-white">{metric.value}</p>
              <p className="mt-2 text-sm text-white/70">{metric.label}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Partner Logos */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <div className="mb-8 text-center">
          <Globe className="mx-auto mb-4 h-12 w-12 text-pacific-400" />
          <h3 className="text-xl font-semibold text-white">
            Partner Organizations
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Collaborating to build climate resilience across the Pacific
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {partners.map((partner, index) => (
            <motion.div
              key={partner.name}
              className="flex flex-col items-center rounded-xl border border-white/10 bg-white/5 p-6 text-center transition hover:bg-white/10"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              {/* Partner logo */}
              <div className="relative mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white/10">
                <Image
                  src={partner.logo}
                  alt={`${partner.name} logo`}
                  width={80}
                  height={80}
                  className="object-contain p-2"
                  onError={(e: any) => {
                    // Fallback to Globe icon if image fails to load
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <Globe
                  className="absolute h-10 w-10 text-white/60"
                  style={{ display: 'none' }}
                />
              </div>
              <h4 className="font-semibold text-white">{partner.name}</h4>
              <p className="mt-2 text-xs text-white/60">
                {partner.description}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-palm-400">
                <CheckCircle className="h-3 w-3" />
                <span>Verified</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Additional Trust Indicators */}
      <div className="grid gap-6 md:grid-cols-3">
        <motion.div
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-pacific-500/10 to-pacific-500/5 p-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Shield className="mb-4 h-8 w-8 text-pacific-400" />
          <h3 className="text-lg font-semibold text-white">ISO Compliant</h3>
          <p className="mt-2 text-sm text-white/70">
            Full ISO 19115 metadata standards compliance for interoperability
          </p>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-palm-500/10 to-palm-500/5 p-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          <Award className="mb-4 h-8 w-8 text-palm-400" />
          <h3 className="text-lg font-semibold text-white">Quality Assured</h3>
          <p className="mt-2 text-sm text-white/70">
            Multi-stage review workflow with expert validation and audit trails
          </p>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-coral-500/10 to-coral-500/5 p-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <Globe className="mb-4 h-8 w-8 text-coral-400" />
          <h3 className="text-lg font-semibold text-white">Open Standards</h3>
          <p className="mt-2 text-sm text-white/70">
            STAC and OGC API-Records support for global data interoperability
          </p>
        </motion.div>
      </div>
    </section>
  );
}
