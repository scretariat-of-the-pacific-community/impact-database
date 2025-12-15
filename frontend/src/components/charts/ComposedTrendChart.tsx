'use client';

import {
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';
import { motion } from 'framer-motion';
import { ForecastPoint } from '@/lib/forecasting';

interface ComposedTrendChartProps {
  data: ForecastPoint[];
  title?: string;
  showForecast?: boolean;
  className?: string;
}

export default function ComposedTrendChart({
  data,
  title = 'Trend Analysis with Forecast',
  showForecast = true,
  className = '',
}: ComposedTrendChartProps) {
  const CustomTooltip = (props: any) => {
    const { active, payload } = props;
    if (active && payload && payload.length) {
      const data = payload[0].payload as ForecastPoint;
      
      return (
        <div className="rounded-lg border border-white/20 bg-deep-900/95 p-3 shadow-xl backdrop-blur">
          <p className="font-semibold text-white">{data.period}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm text-white/80">
              {data.isForecast ? 'Forecast' : 'Actual'}: {data.value.toFixed(1)}
            </p>
            {data.isForecast && data.lowerBound && data.upperBound && (
              <>
                <p className="text-xs text-white/60">
                  Range: {data.lowerBound.toFixed(1)} - {data.upperBound.toFixed(1)}
                </p>
                {data.confidence && (
                  <p className="text-xs text-pacific-300">
                    Confidence: {data.confidence}%
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <ul className="flex flex-wrap justify-center gap-4 text-sm mt-4">
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

  const actualData = data.filter(d => d.isActual);
  const forecastData = data.filter(d => d.isForecast);
  const combinedData = showForecast ? data : actualData;

  return (
    <motion.div
      className={`rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur p-6 ${className}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      {title && (
        <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      )}
      
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={combinedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#009ee0" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#009ee0" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff6b4a" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#ff6b4a" stopOpacity={0}/>
            </linearGradient>
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          
          <XAxis
            dataKey="period"
            stroke="rgba(255, 255, 255, 0.5)"
            tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
            tickFormatter={(value) => {
              // Shorten date labels
              if (value.length > 7) {
                return value.substring(5); // Show MM-DD or last part
              }
              return value;
            }}
          />
          
          <YAxis
            stroke="rgba(255, 255, 255, 0.5)"
            tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }}
          />
          
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          
          {/* Actual data as area + line */}
          <Area
            type="monotone"
            dataKey={(d: ForecastPoint) => d.isActual ? d.value : null}
            fill="url(#actualGradient)"
            stroke="none"
            name="Historical Trend"
          />
          
          <Line
            type="monotone"
            dataKey={(d: ForecastPoint) => d.isActual ? d.value : null}
            stroke="#009ee0"
            strokeWidth={3}
            dot={{ fill: '#009ee0', r: 4 }}
            activeDot={{ r: 6 }}
            name="Actual Values"
          />
          
          {/* Forecast as dashed line with confidence interval */}
          {showForecast && (
            <>
              <Area
                type="monotone"
                dataKey={(d: ForecastPoint) => d.isForecast && d.upperBound ? d.upperBound : null}
                fill="url(#forecastGradient)"
                stroke="none"
                name="Upper Bound"
              />
              
              <Line
                type="monotone"
                dataKey={(d: ForecastPoint) => d.isForecast ? d.value : null}
                stroke="#ff6b4a"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#ff6b4a', r: 3 }}
                name="Forecast"
              />
              
              <Line
                type="monotone"
                dataKey={(d: ForecastPoint) => d.isForecast && d.lowerBound ? d.lowerBound : null}
                stroke="#ff6b4a"
                strokeWidth={1}
                strokeDasharray="2 2"
                strokeOpacity={0.5}
                dot={false}
                name="Lower Bound"
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      
      {showForecast && forecastData.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/60">
          <span>Forecast Method: {forecastData[0].confidence ? 'Statistical' : 'Moving Average'}</span>
          {forecastData[0].confidence && (
            <span>Avg Confidence: {forecastData[0].confidence.toFixed(0)}%</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
