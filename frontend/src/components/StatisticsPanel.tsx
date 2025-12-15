'use client';

import { motion } from 'framer-motion';
import { BarChart3, HelpCircle, TrendingUp, Activity } from 'lucide-react';
import { useState } from 'react';

interface StatisticsData {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
}

interface StatisticsPanelProps {
  hazardStats: StatisticsData;
  countryStats: StatisticsData;
  timeSeriesStats: StatisticsData;
  totalImages: number;
  uniqueHazards: number;
  uniqueCountries: number;
  className?: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, description, icon, color }: StatCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border border-white/10 bg-gradient-to-br ${color} backdrop-blur p-4`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-white/10">
            {icon}
          </div>
          <button
            onClick={() => setShowTooltip(!showTooltip)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Show explanation"
          >
            <HelpCircle className="w-4 h-4 text-white/60" />
          </button>
        </div>
        
        <p className="text-xs text-white/60 mb-1">{label}</p>
        <p className="text-2xl font-bold text-white">
          {typeof value === 'number' ? value.toFixed(2) : value}
        </p>
        
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-3 border-t border-white/10"
          >
            <p className="text-xs text-white/70 leading-relaxed">
              {description}
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export default function StatisticsPanel({
  hazardStats,
  countryStats,
  timeSeriesStats,
  totalImages,
  uniqueHazards,
  uniqueCountries,
  className = '',
}: StatisticsPanelProps) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur p-8 ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-6 h-6 text-pacific-400" />
        <h3 className="text-xl font-semibold text-white">Statistical Indicators</h3>
      </div>

      <div className="space-y-6">
        {/* Hazard Distribution Statistics */}
        <div>
          <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Hazard Distribution
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Mean"
              value={hazardStats.mean}
              description="Average number of images per hazard type. This represents the typical distribution across all hazard categories."
              icon={<TrendingUp className="w-5 h-5 text-pacific-300" />}
              color="from-pacific-900/20 to-pacific-800/10"
            />
            <StatCard
              label="Median"
              value={hazardStats.median}
              description="Middle value when hazard counts are sorted. Less affected by outliers than the mean, representing the typical hazard count."
              icon={<BarChart3 className="w-5 h-5 text-pacific-300" />}
              color="from-pacific-900/20 to-pacific-800/10"
            />
            <StatCard
              label="Std Dev"
              value={hazardStats.stdDev}
              description="Standard deviation measures the spread of hazard counts. Higher values indicate more variability in hazard distribution."
              icon={<Activity className="w-5 h-5 text-pacific-300" />}
              color="from-pacific-900/20 to-pacific-800/10"
            />
            <StatCard
              label="Min"
              value={hazardStats.min}
              description="Lowest number of images for any hazard type. Indicates the least documented hazard category."
              icon={<BarChart3 className="w-5 h-5 text-palm-300" />}
              color="from-palm-900/20 to-palm-800/10"
            />
            <StatCard
              label="Max"
              value={hazardStats.max}
              description="Highest number of images for any hazard type. Indicates the most frequently documented hazard category."
              icon={<TrendingUp className="w-5 h-5 text-coral-300" />}
              color="from-coral-900/20 to-coral-800/10"
            />
          </div>
        </div>

        {/* Country Distribution Statistics */}
        <div>
          <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Geographic Distribution
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Mean"
              value={countryStats.mean}
              description="Average number of images per country. Indicates typical geographic coverage across all regions."
              icon={<TrendingUp className="w-5 h-5 text-palm-300" />}
              color="from-palm-900/20 to-palm-800/10"
            />
            <StatCard
              label="Median"
              value={countryStats.median}
              description="Middle value of country counts. Provides a central measure less influenced by countries with very high or low counts."
              icon={<BarChart3 className="w-5 h-5 text-palm-300" />}
              color="from-palm-900/20 to-palm-800/10"
            />
            <StatCard
              label="Std Dev"
              value={countryStats.stdDev}
              description="Variability in country coverage. Higher values suggest uneven distribution of data across geographic regions."
              icon={<Activity className="w-5 h-5 text-palm-300" />}
              color="from-palm-900/20 to-palm-800/10"
            />
            <StatCard
              label="Min"
              value={countryStats.min}
              description="Lowest image count for any country. Identifies regions needing more data collection efforts."
              icon={<BarChart3 className="w-5 h-5 text-coral-300" />}
              color="from-coral-900/20 to-coral-800/10"
            />
            <StatCard
              label="Max"
              value={countryStats.max}
              description="Highest image count for any country. Shows the most comprehensively documented region."
              icon={<TrendingUp className="w-5 h-5 text-pacific-300" />}
              color="from-pacific-900/20 to-pacific-800/10"
            />
          </div>
        </div>

        {/* Time Series Statistics */}
        <div>
          <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Upload Patterns
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Avg/Period"
              value={timeSeriesStats.mean}
              description="Average uploads per time period. Baseline measure of typical activity level over time."
              icon={<TrendingUp className="w-5 h-5 text-coral-300" />}
              color="from-coral-900/20 to-coral-800/10"
            />
            <StatCard
              label="Median"
              value={timeSeriesStats.median}
              description="Typical upload count per period. Central tendency measure for regular activity patterns."
              icon={<BarChart3 className="w-5 h-5 text-coral-300" />}
              color="from-coral-900/20 to-coral-800/10"
            />
            <StatCard
              label="Volatility"
              value={timeSeriesStats.stdDev}
              description="Upload variability over time. Higher values indicate inconsistent contribution patterns or seasonal effects."
              icon={<Activity className="w-5 h-5 text-coral-300" />}
              color="from-coral-900/20 to-coral-800/10"
            />
            <StatCard
              label="Low Period"
              value={timeSeriesStats.min}
              description="Minimum uploads in any period. Identifies times of low activity requiring engagement efforts."
              icon={<BarChart3 className="w-5 h-5 text-yellow-300" />}
              color="from-yellow-900/20 to-yellow-800/10"
            />
            <StatCard
              label="Peak Period"
              value={timeSeriesStats.max}
              description="Maximum uploads in any period. Shows highest engagement level, possibly during major hazard events."
              icon={<TrendingUp className="w-5 h-5 text-palm-300" />}
              color="from-palm-900/20 to-palm-800/10"
            />
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="mt-6 pt-6 border-t border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{totalImages}</p>
              <p className="text-sm text-white/60 mt-1">Total Images</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{uniqueHazards}</p>
              <p className="text-sm text-white/60 mt-1">Hazard Types</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{uniqueCountries}</p>
              <p className="text-sm text-white/60 mt-1">Countries</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
