'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line } from 'recharts';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useMemo } from 'react';

interface TimelineData {
  date: string;
  count: number;
  rollingAvg?: number;
}

interface Props {
  data: TimelineData[];
  className?: string;
}

export default function TimelineTrendArea({ data, className = '' }: Props) {
  // Calculate rolling 7-day average
  const enrichedData = useMemo(() => {
    if (data.length < 7) return data;
    
    return data.map((item, index) => {
      if (index < 6) {
        return { ...item, rollingAvg: undefined };
      }
      
      const last7Days = data.slice(index - 6, index + 1);
      const avg = last7Days.reduce((sum, d) => sum + d.count, 0) / 7;
      return { ...item, rollingAvg: parseFloat(avg.toFixed(2)) };
    });
  }, [data]);

  // Calculate peak date and trend insight
  const insight = useMemo(() => {
    const totalUploads = data.reduce((sum, d) => sum + d.count, 0);
    
    if (totalUploads === 0) {
      return 'No uploads in the last 30 days.';
    }
    
    const peakDay = data.reduce((max, d) => d.count > max.count ? d : max, data[0]);
    const peakDate = format(parseISO(peakDay.date), 'MMM d');
    
    // Check trend after peak
    const peakIndex = data.findIndex(d => d.date === peakDay.date);
    const afterPeak = data.slice(peakIndex + 1);
    
    if (afterPeak.length >= 7) {
      const recentAvg = afterPeak.slice(-7).reduce((sum, d) => sum + d.count, 0) / 7;
      const peakValue = peakDay.count;
      
      if (recentAvg < peakValue * 0.5) {
        return `Uploads peaked on ${peakDate} (${peakDay.count}) and have declined since.`;
      } else if (recentAvg > peakValue * 0.8) {
        return `Uploads peaked on ${peakDate} (${peakDay.count}) and have remained stable since.`;
      } else {
        return `Uploads peaked on ${peakDate} (${peakDay.count}) and have moderated since.`;
      }
    }
    
    return `Uploads peaked on ${peakDate} with ${peakDay.count} submission${peakDay.count !== 1 ? 's' : ''}.`;
  }, [data]);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value?: ValueType; dataKey?: string }>;
    label?: NameType;
  }) => {
    if (active && payload && payload.length) {
      const labelText = typeof label === 'string' ? label : String(label ?? '');
      const dailyCount = payload.find(p => p.dataKey === 'count')?.value;
      const rollingAvg = payload.find(p => p.dataKey === 'rollingAvg')?.value;
      
      return (
        <div className="rounded-lg border border-white/20 bg-deep-900/95 p-3 shadow-xl backdrop-blur">
          <p className="font-semibold text-white">
            {format(parseISO(labelText), 'MMM d, yyyy')}
          </p>
          <p className="text-sm text-pacific-300">
            Daily: {dailyCount} upload{dailyCount !== 1 ? 's' : ''}
          </p>
          {rollingAvg !== undefined && (
            <p className="text-xs text-palm-300">
              7-day avg: {rollingAvg}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Check if all data is zero
  const totalUploads = data.reduce((sum, d) => sum + d.count, 0);
  
  if (data.length === 0) {
    return (
      <div className={`flex h-80 flex-col items-center justify-center ${className}`}>
        <p className="text-sm text-white/60">No uploads in the last 30 days.</p>
      </div>
    );
  }

  // Determine Y-axis tick interval for integer values
  const maxCount = Math.max(...data.map(d => d.count));
  const yAxisTicks = maxCount <= 5 ? Array.from({ length: maxCount + 1 }, (_, i) => i) : undefined;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={enrichedData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#009ee0" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#009ee0" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="date"
            stroke="rgba(255,255,255,0.6)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
            tickFormatter={(value) => format(parseISO(value), 'MMM d')}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            stroke="rgba(255,255,255,0.6)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
            allowDecimals={maxCount > 5}
            ticks={yAxisTicks}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#009ee0"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorUploads)"
            animationDuration={1000}
          />
          {enrichedData.some(d => d.rollingAvg !== undefined) && (
            <Line
              type="monotone"
              dataKey="rollingAvg"
              stroke="#ffd700"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              animationDuration={1000}
            />
          )}
        </AreaChart>
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
