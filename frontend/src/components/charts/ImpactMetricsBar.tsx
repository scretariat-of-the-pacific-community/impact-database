'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, TooltipProps } from 'recharts';
import { motion } from 'framer-motion';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface MetricData {
  name: string;
  value: number;
}

interface Props {
  data: MetricData[];
  title?: string;
  className?: string;
}

const COLORS = ['#009ee0', '#18b374', '#ff6b4a', '#8b5cf6', '#eab308', '#ef4444', '#06b6d4'];

export default function ImpactMetricsBar({ data, title, className = '' }: Props) {
  const sortedData = [...data].sort((a, b) => b.value - a.value).slice(0, 10);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value?: ValueType; payload: MetricData }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as MetricData;
      return (
        <div className="rounded-lg border border-white/20 bg-deep-900/95 p-3 shadow-xl backdrop-blur">
          <p className="font-semibold text-white">{data.name}</p>
          <p className="text-sm text-white/80">{payload[0].value} reports</p>
        </div>
      );
    }
    return null;
  };

  if (sortedData.length === 0) {
    return (
      <div className={`flex h-80 items-center justify-center ${className}`}>
        <p className="text-white/60">No metrics data available</p>
      </div>
    );
  }

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
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            type="number"
            stroke="rgba(255,255,255,0.6)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
          />
          <YAxis
            dataKey="name"
            type="category"
            stroke="rgba(255,255,255,0.6)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="value"
            radius={[0, 8, 8, 0]}
            animationDuration={1000}
          >
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
