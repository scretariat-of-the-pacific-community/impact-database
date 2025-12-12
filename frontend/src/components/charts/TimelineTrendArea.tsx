'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface TimelineData {
  date: string;
  count: number;
}

interface Props {
  data: TimelineData[];
  className?: string;
}

export default function TimelineTrendArea({ data, className = '' }: Props) {
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value?: ValueType }>;
    label?: NameType;
  }) => {
    if (active && payload && payload.length) {
      const labelText = typeof label === 'string' ? label : String(label ?? '');
      return (
        <div className="rounded-lg border border-white/20 bg-deep-900/95 p-3 shadow-xl backdrop-blur">
          <p className="font-semibold text-white">
            {format(parseISO(labelText), 'MMM d, yyyy')}
          </p>
          <p className="text-sm text-pacific-300">
            {payload[0].value} uploads
          </p>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <div className={`flex h-80 items-center justify-center ${className}`}>
        <p className="text-white/60">No timeline data available</p>
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={data}
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
          />
          <YAxis
            stroke="rgba(255,255,255,0.6)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
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
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
