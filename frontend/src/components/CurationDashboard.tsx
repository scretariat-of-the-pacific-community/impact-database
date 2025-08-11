'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserGroupIcon,
  DocumentTextIcon,
  FlagIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

interface DashboardStats {
  totalItems: number;
  pendingReview: number;
  underReview: number;
  approved: number;
  rejected: number;
  flagged: number;
  duplicates: number;
  avgReviewTime: number;
  curatorWorkload: { [key: string]: number };
  recentActivity: Array<{
    id: string;
    action: string;
    item: string;
    curator: string;
    timestamp: string;
  }>;
}

const CurationDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState('7d');

  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['curation-dashboard', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/admin/dashboard?period=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      return response.json();
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const StatCard = ({ title, value, icon: Icon, color, trend }: {
    title: string;
    value: number | string;
    icon: React.ComponentType<any>;
    color: string;
    trend?: number;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-lg shadow-md p-6 border-l-4 border-${color}-500`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {trend !== undefined && (
            <p className={`text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '+' : ''}{trend}% from last period
            </p>
          )}
        </div>
        <Icon className={`h-12 w-12 text-${color}-500`} />
      </div>
    </motion.div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
            <p className="text-sm text-red-700 mt-1">Please try refreshing the page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Curation Dashboard</h1>
        <div className="flex space-x-2">
          {['24h', '7d', '30d', '90d'].map((period) => (
            <button
              key={period}
              onClick={() => setTimeRange(period)}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                timeRange === period
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Items"
          value={stats?.totalItems || 0}
          icon={DocumentTextIcon}
          color="blue"
        />
        <StatCard
          title="Pending Review"
          value={stats?.pendingReview || 0}
          icon={ClockIcon}
          color="yellow"
        />
        <StatCard
          title="Under Review"
          value={stats?.underReview || 0}
          icon={UserGroupIcon}
          color="orange"
        />
        <StatCard
          title="Flagged Items"
          value={stats?.flagged || 0}
          icon={FlagIcon}
          color="red"
        />
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Review Status Chart */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Review Status Overview</h3>
          <div className="space-y-3">
            {[
              { label: 'Approved', value: stats?.approved || 0, color: 'green' },
              { label: 'Rejected', value: stats?.rejected || 0, color: 'red' },
              { label: 'Under Review', value: stats?.underReview || 0, color: 'yellow' },
              { label: 'Pending', value: stats?.pendingReview || 0, color: 'gray' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full bg-${item.color}-500 mr-3`}></div>
                  <span className="text-sm text-gray-700">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Curator Workload */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Curator Workload</h3>
          <div className="space-y-3">
            {Object.entries(stats?.curatorWorkload || {}).map(([curator, count]) => (
              <div key={curator} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{curator}</span>
                <div className="flex items-center">
                  <div className="w-24 bg-gray-200 rounded-full h-2 mr-3">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${Math.min((count / 50) * 100, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
        <div className="flow-root">
          <ul className="-mb-8">
            {stats?.recentActivity?.map((activity, idx) => (
              <li key={activity.id}>
                <div className="relative pb-8">
                  {idx < stats.recentActivity.length - 1 && (
                    <span
                      className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                        <DocumentTextIcon className="h-4 w-4 text-white" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                      <div>
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{activity.curator}</span> {activity.action}{' '}
                          <span className="font-medium">{activity.item}</span>
                        </p>
                      </div>
                      <div className="text-right text-sm whitespace-nowrap text-gray-500">
                        {new Date(activity.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CurationDashboard;