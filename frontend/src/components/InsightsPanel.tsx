'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Info, 
  Lightbulb,
  X,
  BarChart3
} from 'lucide-react';
import { Insight } from '@/lib/insights-engine';

interface InsightsPanelProps {
  insights: Insight[];
  className?: string;
}

const severityConfig = {
  critical: {
    bg: 'bg-coral-900/30',
    border: 'border-coral-500/30',
    text: 'text-coral-300',
    icon: 'text-coral-400',
  },
  warning: {
    bg: 'bg-yellow-900/30',
    border: 'border-yellow-500/30',
    text: 'text-yellow-300',
    icon: 'text-yellow-400',
  },
  info: {
    bg: 'bg-pacific-900/30',
    border: 'border-pacific-500/30',
    text: 'text-pacific-300',
    icon: 'text-pacific-400',
  },
};

const typeIcons = {
  trend: TrendingUp,
  anomaly: AlertTriangle,
  correlation: Info,
  recommendation: Lightbulb,
};

export default function InsightsPanel({ insights, className = '' }: InsightsPanelProps) {
  if (insights.length === 0) {
    return (
      <div className={`rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur p-8 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-6 h-6 text-pacific-400" />
          <h3 className="text-xl font-semibold text-white">Data Insights</h3>
        </div>
        <p className="text-white/60 text-center py-8">
          No insights available yet. More data needed for analysis.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur p-8 ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-6 h-6 text-pacific-400" />
        <h3 className="text-xl font-semibold text-white">Data Insights</h3>
        <span className="ml-auto text-sm text-white/60">
          {insights.length} {insights.length === 1 ? 'insight' : 'insights'} found
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {insights.map((insight, index) => {
            const Icon = typeIcons[insight.type];
            const config = severityConfig[insight.severity];
            
            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className={`relative rounded-xl border ${config.border} ${config.bg} p-5 backdrop-blur`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${config.bg} flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${config.icon}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-semibold ${config.text} mb-1`}>
                      {insight.title}
                    </h4>
                    <p className="text-xs text-white/70 leading-relaxed">
                      {insight.description}
                    </p>
                    
                    {insight.change !== undefined && (
                      <div className="mt-3 flex items-center gap-2">
                        {insight.change > 0 ? (
                          <TrendingUp className="w-4 h-4 text-palm-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-coral-400" />
                        )}
                        <span className={`text-xs font-semibold ${insight.change > 0 ? 'text-palm-400' : 'text-coral-400'}`}>
                          {insight.change > 0 ? '+' : ''}{insight.change.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-white/50">
                        {insight.confidence}% confidence
                      </span>
                      <div className="h-1 w-16 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${insight.confidence}%` }}
                          transition={{ delay: index * 0.05 + 0.2, duration: 0.5 }}
                          className={`h-full ${config.bg.replace('/30', '')}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
