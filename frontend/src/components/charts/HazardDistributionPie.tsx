'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { motion } from 'framer-motion';

const HAZARD_COLORS: Record<string, string> = {
  flood: '#3b82f6',
  cyclone: '#8b5cf6',
  drought: '#eab308',
  earthquake: '#ef4444',
  tsunami: '#06b6d4',
  landslide: '#f97316',
  wildfire: '#dc2626',
  volcanic: '#f87171',
  coastal_erosion: '#0ea5e9',
  storm: '#0ea5e9',
  other: '#6b7280',
  unknown: '#94a3b8',
};

interface HazardDataPoint {
  name: string;
  key: string;
  value: number;
  percentage: number;
}

interface Props {
  data: Array<{ hazard_type: string; count: number }>;
  className?: string;
}

const MAX_SLICES = 6;

const toTitleCase = (value: string) =>
  value
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export default function HazardDistributionPie({ data, className = '' }: Props) {
  const { chartData, total, topHazard, insightHazard } = useMemo(() => {
    if (!data || data.length === 0) {
      return { chartData: [], total: 0, topHazard: null, insightHazard: null };
    }

    const normalized = data
      .map((item) => ({
        name: item.hazard_type ? toTitleCase(item.hazard_type) : 'Unknown',
        key: (item.hazard_type || 'unknown').toLowerCase(),
        value: item.count || 0,
      }))
      .filter((item) => item.value >= 0);

    const totalValue = normalized.reduce((sum, item) => sum + item.value, 0);
    if (totalValue === 0) {
      return { chartData: [], total: 0, topHazard: null, insightHazard: null };
    }

    const sorted = [...normalized].sort((a, b) => b.value - a.value);
    let slices = sorted;

    if (sorted.length > MAX_SLICES) {
      const top = sorted.slice(0, MAX_SLICES);
      const otherValue = sorted.slice(MAX_SLICES).reduce((sum, item) => sum + item.value, 0);
      if (otherValue > 0) {
        top.push({
          name: 'Other',
          key: 'other',
          value: otherValue,
        });
      }
      slices = top;
    }

    const chartReady: HazardDataPoint[] = slices.map((item) => ({
      ...item,
      percentage: totalValue ? (item.value / totalValue) * 100 : 0,
    }));

    const primaryHazard =
      chartReady.find((item) => item.name !== 'Other' && item.name !== 'Unknown') || chartReady[0] || null;

    return {
      chartData: chartReady,
      total: totalValue,
      topHazard: chartReady[0] || null,
      insightHazard: primaryHazard,
    };
  }, [data]);

  if (total === 0 || chartData.length === 0) {
    return (
      <div className={`flex h-80 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-deep-900/40 ${className}`}>
        <p className="text-base font-semibold text-white">No hazard-tagged reports in the selected period.</p>
        <p className="text-sm text-white/70">Upload new imagery or adjust filters to see hazard trends.</p>
      </div>
    );
  }

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: HazardDataPoint }>;
  }) => {
    if (active && payload && payload.length) {
      const datum = payload[0].payload;
      return (
        <div className="rounded-lg border border-white/10 bg-deep-900/95 p-3 text-sm shadow-xl backdrop-blur">
          <p className="font-semibold text-white">{datum.name}</p>
          <p className="text-white/80">
            {datum.value.toLocaleString()} reports • {datum.percentage.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: { payload?: Array<{ value: string; color: string }> }) => {
    if (!payload || payload.length === 0) return null;
    return (
      <ul className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-white/80">
        {payload.slice(0, MAX_SLICES + 1).map((entry, index) => (
          <motion.li
            key={`legend-${entry.value}-${index}`}
            className="flex items-center gap-2"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.value}</span>
          </motion.li>
        ))}
      </ul>
    );
  };

  const insightHazardName = insightHazard?.name || 'hazards';
  const insightPercent = insightHazard ? insightHazard.percentage : 0;

  return (
    <motion.div
      className={`relative rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/80 to-deep-900/40 p-6 shadow-xl ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm uppercase tracking-wide text-white/60">Hazard Distribution</p>
          <p className="text-lg font-semibold text-white">What hazards are being reported?</p>
        </div>
      </div>
      <div className="relative h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Pie
              data={chartData as any}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
              stroke="transparent"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`slice-${entry.name}-${index}`}
                  fill={HAZARD_COLORS[entry.key] || HAZARD_COLORS.other}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-semibold text-white">{total.toLocaleString()}</p>
          <p className="text-xs uppercase tracking-widest text-white/60">Total reports</p>
          {topHazard && (
            <p className="mt-2 text-sm font-medium text-white">
              Top: {topHazard.name} ({topHazard.percentage.toFixed(1)}%)
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-white">
        {insightHazard ? (
          <p>
            <span className="font-semibold">{insightHazardName}</span> account for{' '}
            {insightPercent.toFixed(1)}% of recent reports.
          </p>
        ) : (
          <p>Hazard mix will appear once new reports arrive.</p>
        )}
      </div>
    </motion.div>
  );
}
