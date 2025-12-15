'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { AlertTriangle, MapPin } from 'lucide-react';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface MetricData {
  name: string;
  value: number;
  country?: string;
}

interface Props {
  data: MetricData[];
  title?: string;
  className?: string;
}

const COLORS = ['#009ee0', '#18b374', '#ff6b4a', '#8b5cf6', '#eab308', '#ef4444', '#06b6d4', '#f59e0b', '#84cc16', '#14b8a6'];

export default function ImpactMetricsBar({ data, title, className = '' }: Props) {
  const sortedData = useMemo(() => 
    [...data].sort((a, b) => b.value - a.value).slice(0, 10),
    [data]
  );

  const totalReports = useMemo(() => 
    data.reduce((sum, item) => sum + item.value, 0),
    [data]
  );

  const unspecifiedCount = useMemo(() => {
    const unspecified = data.find(d => 
      d.name === 'Unspecified location' || 
      d.name === 'Unknown' ||
      d.country === 'Unspecified location'
    );
    return unspecified?.value || 0;
  }, [data]);

  const unspecifiedPct = useMemo(() => 
    totalReports > 0 ? Math.round((unspecifiedCount / totalReports) * 100) : 0,
    [unspecifiedCount, totalReports]
  );

  const hasUnspecified = unspecifiedCount > 0;
  const topCountry = sortedData[0]?.name || 'N/A';
  const topCountryCount = sortedData[0]?.value || 0;
  const topCountryPct = totalReports > 0 ? Math.round((topCountryCount / totalReports) * 100) : 0;

  // Generate dynamic insight
  const insight = useMemo(() => {
    if (totalReports === 0) {
      return 'No country data available yet.';
    }

    const knownCountries = sortedData.filter(d => 
      d.name !== 'Unspecified location' && d.name !== 'Unknown'
    );

    if (knownCountries.length === 0) {
      return 'All reports lack country attribution. Improve metadata capture.';
    }

    if (knownCountries.length < 3) {
      return `Limited geographic coverage with only ${knownCountries.length} ${knownCountries.length === 1 ? 'country' : 'countries'} identified${hasUnspecified ? `, and ${unspecifiedPct}% missing attribution` : ''}.`;
    }

    const topKnown = knownCountries[0];
    if (hasUnspecified && unspecifiedPct >= 10) {
      return `Most reports are concentrated in ${topKnown.name} (${topCountryPct}%), with ${unspecifiedPct}% missing country attribution.`;
    }

    return `Most reports are concentrated in ${topKnown.name}, accounting for ${topCountryPct}% of all evidence.`;
  }, [sortedData, totalReports, topCountryPct, unspecifiedPct, hasUnspecified]);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value?: ValueType; payload: MetricData }>;
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload as MetricData;
      const pct = totalReports > 0 ? ((item.value / totalReports) * 100).toFixed(1) : '0';
      
      return (
        <div className="rounded-lg border border-white/20 bg-deep-900/95 p-3 shadow-xl backdrop-blur">
          <p className="font-semibold text-white">{item.name}</p>
          <p className="text-sm text-pacific-300">
            {item.value} report{item.value !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-surface-soft">
            {pct}% of total
          </p>
        </div>
      );
    }
    return null;
  };

  // Edge case: Everything is "Unspecified location"
  if (sortedData.length === 1 && (sortedData[0].name === 'Unspecified location' || sortedData[0].name === 'Unknown')) {
    return (
      <motion.div
        className={`${className} flex flex-col items-center justify-center rounded-xl border border-coral-500/30 bg-coral-900/20 p-8 text-center`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <AlertTriangle className="mb-4 h-12 w-12 text-coral-400" />
        <h4 className="mb-2 text-lg font-semibold text-white">
          Missing Country Attribution
        </h4>
        <p className="mb-4 max-w-md text-sm text-surface-soft">
          All {sortedData[0].value} report{sortedData[0].value !== 1 ? 's' : ''} lack country metadata. 
          Geographic analysis requires location information.
        </p>
        <div className="text-xs text-surface-soft">
          <p className="font-medium text-pacific-300">Next Actions:</p>
          <ul className="mt-2 space-y-1 text-left">
            <li>• Improve upload metadata capture</li>
            <li>• Enable auto-detection from image EXIF</li>
            <li>• Add required country field validation</li>
          </ul>
        </div>
      </motion.div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className={`flex h-80 items-center justify-center ${className}`}>
        <p className="text-sm text-white/60">No geographic data available</p>
      </div>
    );
  }

  // Prepare data with rank numbers
  const rankedData = sortedData.map((item, index) => ({
    ...item,
    rank: index + 1,
    displayName: `${index + 1}. ${item.name}`,
  }));

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
    >
      {title && (
        <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      )}
      
      {/* Warning for high unspecified percentage */}
      {hasUnspecified && unspecifiedPct >= 20 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-coral-500/30 bg-coral-900/10 p-3 text-xs text-surface-soft">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-coral-400" />
          <p>
            <span className="font-medium text-coral-300">{unspecifiedPct}% of reports</span> lack country metadata. 
            Some uploads are missing location information.
          </p>
        </div>
      )}

      <ResponsiveContainer width="100%" height={Math.max(300, rankedData.length * 45)}>
        <BarChart
          data={rankedData}
          layout="vertical"
          margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            type="number"
            stroke="rgba(255,255,255,0.6)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
            allowDecimals={false}
          />
          <YAxis
            dataKey="displayName"
            type="category"
            stroke="rgba(255,255,255,0.6)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
            width={150}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="value"
            radius={[0, 8, 8, 0]}
            animationDuration={1000}
          >
            {rankedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.name === 'Unspecified location' || entry.name === 'Unknown' 
                  ? '#6b7280' // Gray for unspecified
                  : COLORS[index % COLORS.length]
                }
              />
            ))}
            {/* Value labels at bar end */}
            <LabelList
              dataKey="value"
              position="right"
              fill="rgba(255,255,255,0.9)"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      
      {/* Insight Line */}
      <div className="mt-3 border-t border-white/5 pt-3">
        <p className="text-xs text-surface-soft">
          💡 {insight}
        </p>
      </div>
    </motion.div>
  );
}
