/* Admin UI for reviewing upload failures - React component. */
'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface FailureStats {
  total_failures: number;
  by_reason: { [key: string]: number };
  by_day: { [key: string]: number };
  top_uploaders: Array<{ uploader_id: string; count: number }>;
}

interface FailurePattern {
  reason: string;
  count: number;
  percentage: number;
  common_errors: string[];
  recommendations: string[];
}

interface FailureDetail {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string | null;
  failure_reason: string;
  error_details: string;
  uploader_id: string;
  attempted_at: string;
  latitude: number | null;
  longitude: number | null;
}

export default function UploadFailuresAdmin() {
  const [stats, setStats] = useState<FailureStats | null>(null);
  const [patterns, setPatterns] = useState<FailurePattern[]>([]);
  const [failures, setFailures] = useState<FailureDetail[]>([]);
  const [selectedReason, setSelectedReason] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch stats
  useEffect(() => {
    fetchStats();
    fetchPatterns();
  }, []);

  // Fetch failures when filters change
  useEffect(() => {
    fetchFailures();
  }, [selectedReason, dateRange, page]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/failures/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchPatterns = async () => {
    try {
      const response = await fetch('/api/admin/failures/patterns?limit=10');
      const data = await response.json();
      setPatterns(data.patterns);
    } catch (error) {
      console.error('Failed to fetch patterns:', error);
    }
  };

  const fetchFailures = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: String(page * 20),
      });

      if (selectedReason && selectedReason !== 'all') {
        params.append('reason', selectedReason);
      }
      if (dateRange.start) {
        params.append('start_date', dateRange.start);
      }
      if (dateRange.end) {
        params.append('end_date', dateRange.end);
      }

      const response = await fetch(`/api/admin/failures/list?${params}`);
      const data = await response.json();
      setFailures(data.failures);
    } catch (error) {
      console.error('Failed to fetch failures:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async (days: number) => {
    if (!confirm(`Delete failures older than ${days} days?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/failures/cleanup?days=${days}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      alert(`Deleted ${data.deleted} old failure records`);
      fetchStats();
      fetchFailures();
    } catch (error) {
      console.error('Failed to cleanup:', error);
      alert('Cleanup failed');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Upload Failures Dashboard</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">
              Total Failures
            </h3>
            <p className="text-3xl font-bold text-gray-900">
              {stats.total_failures}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">Top Reason</h3>
            <p className="text-lg font-semibold text-gray-900">
              {Object.entries(stats.by_reason).sort(
                (a, b) => b[1] - a[1]
              )[0]?.[0] || 'N/A'}
            </p>
            <p className="text-sm text-gray-600">
              {Object.entries(stats.by_reason).sort(
                (a, b) => b[1] - a[1]
              )[0]?.[1] || 0}{' '}
              failures
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">
              Most Active Uploader
            </h3>
            <p className="text-lg font-semibold text-gray-900 truncate">
              {stats.top_uploaders[0]?.uploader_id.substring(0, 12) || 'N/A'}...
            </p>
            <p className="text-sm text-gray-600">
              {stats.top_uploaders[0]?.count || 0} failures
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">Actions</h3>
            <button
              onClick={() => handleCleanup(30)}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Cleanup Old Records
            </button>
          </div>
        </div>
      )}

      {/* Failure Patterns */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Common Failure Patterns</h2>
        </div>
        <div className="p-6">
          {patterns.map((pattern) => (
            <div
              key={pattern.reason}
              className="mb-6 pb-6 border-b border-gray-200 last:border-0"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium">
                  {pattern.reason.replace(/_/g, ' ')}
                </h3>
                <span className="text-sm text-gray-600">
                  {pattern.count} ({pattern.percentage.toFixed(1)}%)
                </span>
              </div>

              {pattern.common_errors.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">
                    Common Errors:
                  </h4>
                  <ul className="list-disc list-inside text-sm text-gray-600">
                    {pattern.common_errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pattern.recommendations.length > 0 && (
                <div className="bg-blue-50 p-3 rounded">
                  <h4 className="text-sm font-medium text-blue-900 mb-1">
                    Recommendations:
                  </h4>
                  <ul className="list-disc list-inside text-sm text-blue-800">
                    {pattern.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <h2 className="text-xl font-semibold mb-4">Filter Failures</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full border border-gray-300 rounded-md shadow-sm p-2"
            >
              <option value="all">All Reasons</option>
              {stats &&
                Object.keys(stats.by_reason).map((reason) => (
                  <option key={reason} value={reason}>
                    {reason.replace(/_/g, ' ')} ({stats.by_reason[reason]})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange({ ...dateRange, start: e.target.value })
              }
              className="w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange({ ...dateRange, end: e.target.value })
              }
              className="w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>
        </div>
      </div>

      {/* Failures List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Recent Failures</h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : failures.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No failures found
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {failures.map((failure) => (
                  <tr key={failure.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {failure.filename}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                        {failure.failure_reason.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate">
                      {failure.error_details}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatBytes(failure.file_size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(
                        new Date(failure.attempted_at),
                        'MMM d, yyyy HH:mm'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700">Page {page + 1}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={failures.length < 20}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
