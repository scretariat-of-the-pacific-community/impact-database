'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, TooltipProps } from 'recharts';
import { motion } from 'framer-motion';

const HAZARD_COLORS: Record<string, string> = {
  flood: '#3b82f6',
  cyclone: '#8b5cf6',
  drought: '#eab308',
  earthquake: '#ef4444',
  tsunami: '#06b6d4',
  landslide: '#f97316',
  wildfire: '#dc2626',
  other: '#6b7280',
};

interface HazardData {
  name: string;
  value: number;
  percentage?: number;
}

interface Props {
  data: Array<{ hazard_type: string; count: number }>;
  className?: string;
}

export default function HazardDistributionPie({ data, className = '' }: Props) {
  const chartData: HazardData[] = data.map((item) => ({
    name: item.hazard_type || 'Unknown',
    value: item.count,
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);
  const dataWithPercentage = chartData.map((item) => ({
    ...item,
    percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : 0,
  }));

  const CustomTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as HazardData;
      return (
        <div className="rounded-lg border border-white/20 bg-deep-900/95 p-3 shadow-xl backdrop-blur">
          <p className="font-semibold text-white">{data.name}</p>
          <p className="text-sm text-white/80">
            {data.value} reports ({data.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <ul className="flex flex-wrap justify-center gap-3 text-sm">
        {payload.map((entry: any, index: number) => (
          <motion.li
            key={`item-${index}`}
            className="flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-white/80">{entry.value}</span>
          </motion.li>
        ))}
      </ul>
    );
  };

  if (chartData.length === 0) {
    return (
      <div className={`flex h-80 items-center justify-center ${className}`}>
        <p className="text-white/60">No hazard data available</p>
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={dataWithPercentage}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
            animationBegin={0}
            animationDuration={800}
          >
            {dataWithPercentage.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={HAZARD_COLORS[entry.name.toLowerCase()] || HAZARD_COLORS.other}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
