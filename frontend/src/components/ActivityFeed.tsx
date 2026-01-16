'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Clock, Upload, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { imageApi } from '@/lib/api';

interface Activity {
  id: string;
  type: 'upload' | 'review' | 'view';
  title: string;
  description: string;
  timestamp: string;
  user?: string;
  hazard_type?: string;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  const POLL_INTERVAL = 30000; // 30 seconds - balance between real-time updates and server load

  const { data: recentData } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () =>
      imageApi.search({
        limit: 10,
        sort_by: 'upload_date',
        sort_order: 'desc',
      }),
    refetchInterval: POLL_INTERVAL,
  });

  useEffect(() => {
    if ((recentData as any)?.images) {
      const newActivities: Activity[] = (recentData as any)?.images
        .slice(0, 5)
        .map((img: any) => ({
          id: img.id || img.filename,
          type: 'upload', // All recent items are uploads in this context
          title: img.title || img.filename,
          description: `${img.hazard_type || 'Unknown'} • ${img.contact?.organisation_name || 'Location unknown'}`,
          timestamp: img.upload_date || new Date().toISOString(),
          user: img.contact?.organisation_name,
          hazard_type: img.hazard_type,
        }));
      setActivities(newActivities);
    }
  }, [recentData]);

  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case 'upload':
        return <Upload className="h-4 w-4" />;
      case 'review':
        return <CheckCircle className="h-4 w-4" />;
      case 'view':
        return <Eye className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getColor = (type: Activity['type']) => {
    switch (type) {
      case 'upload':
        return 'from-pacific-500/20 to-pacific-500/5 text-pacific-400';
      case 'review':
        return 'from-palm-500/20 to-palm-500/5 text-palm-400';
      case 'view':
        return 'from-coral-500/20 to-coral-500/5 text-coral-400';
      default:
        return 'from-white/10 to-white/5 text-white/60';
    }
  };

  return (
    <motion.div
      className="fixed right-6 top-24 z-40 w-80 rounded-2xl border border-white/10 bg-deep-900/90 p-4 shadow-2xl backdrop-blur-xl"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: isVisible ? 1 : 0, x: isVisible ? 0 : 100 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-white/80" />
          <h3 className="font-semibold text-white">Live Activity</h3>
        </div>
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="text-white/60 transition hover:text-white"
        >
          {isVisible ? '−' : '+'}
        </button>
      </div>

      <AnimatePresence mode="popLayout">
        {isVisible && (
          <motion.div className="space-y-2">
            {activities.length === 0 ? (
              <p className="text-sm text-white/60">No recent activity</p>
            ) : (
              activities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  className={`rounded-lg bg-gradient-to-br ${getColor(activity.type)} p-3 transition hover:scale-[1.02]`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 100 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 rounded-full bg-white/10 p-1.5">
                      {getIcon(activity.type)}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-medium text-white">
                        {activity.title}
                      </p>
                      <p className="truncate text-xs text-white/70">
                        {activity.description}
                      </p>
                      {activity.user && (
                        <p className="mt-1 truncate text-xs text-white/50">
                          by {activity.user}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-white/50">
                        {formatDistanceToNow(new Date(activity.timestamp), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
