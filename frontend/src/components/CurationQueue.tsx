'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth-utils';
import Image from 'next/image';
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  FlagIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftIcon,
  ArrowsRightLeftIcon,
  QueueListIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import ErrorBanner from './ErrorBanner';
import { sanitizeText } from '@/lib/sanitize';

interface CurationItem {
  id: string;
  imageId: string;
  title: string;
  description: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'needs_changes' | 'duplicate' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string | null;
  flagged: boolean;
  flagReason?: string;
  submittedBy: string;
  submittedAt: string;
  lastModified: string;
  reviewerNotes?: string;
  commentsCount: number;
  thumbnailUrl?: string;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  metadata: {
    hazardType: string;
    captureDate: string;
    [key: string]: any;
  };
}

interface CurationQueueProps {
  onItemSelect?: (item: CurationItem) => void;
  selectedItemId?: string;
}

const CurationQueue: React.FC<CurationQueueProps> = ({ onItemSelect, selectedItemId }) => {
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assignedTo: '',
    flagged: false,
    search: ''
  });
  const [sortBy, setSortBy] = useState('submittedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['curation-queue', filters, sortBy, sortOrder, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries({
        ...filters,
        sort_by: sortBy,
        sort_order: sortOrder,
        page: currentPage.toString(),
        page_size: pageSize.toString(),
      }).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });

      const response = await authFetch(`/api/admin/curation/queue?${params}`);
      if (!response.ok) throw new Error('Failed to fetch curation queue');
      return response.json();
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status, notes }: { itemId: string; status: string; notes?: string }) => {
      const response = await authFetch(`/api/admin/curation/queue/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status, reviewer_notes: notes })
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curation-queue'] });
    }
  });

  const flagMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      const response = await authFetch(`/api/admin/curation/queue/${itemId}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      if (!response.ok) throw new Error('Failed to flag item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curation-queue'] });
    }
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <ClockIcon className="h-4 w-4 text-yellow-500" />;
      case 'under_review': return <EyeIcon className="h-4 w-4 text-blue-500" />;
      case 'approved': return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircleIcon className="h-4 w-4 text-red-500" />;
      case 'needs_changes': return <PencilIcon className="h-4 w-4 text-orange-500" />;
      case 'duplicate': return <ArrowsRightLeftIcon className="h-4 w-4 text-purple-500" />;
      default: return <ClockIcon className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleQuickAction = useCallback((itemId: string, action: string) => {
    switch (action) {
      case 'approve':
        updateStatusMutation.mutate({ itemId, status: 'approved' });
        break;
      case 'reject':
        updateStatusMutation.mutate({ itemId, status: 'rejected' });
        break;
      case 'flag':
        flagMutation.mutate({ itemId, reason: 'Requires attention' });
        break;
    }
  }, [updateStatusMutation, flagMutation]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'We were unable to contact the admin API. This might be a temporary issue.';
    return (
      <ErrorBanner
        title="Error loading curation queue"
        message={message}
        tone="error"
        onRetry={() => refetch()}
        retryLabel="Retry"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <h2 className="text-xl font-semibold text-gray-900">Curation Queue</h2>
          
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="needs_changes">Needs Changes</option>
            <option value="duplicate">Duplicate</option>
          </select>

          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={filters.assignedTo}
            onChange={(e) => setFilters({ ...filters, assignedTo: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Curators</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </select>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={filters.flagged}
              onChange={(e) => setFilters({ ...filters, flagged: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Flagged only</span>
          </label>
        </div>
      </div>

      {/* Queue Items */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">
              {data?.total || 0} items total
            </span>
            <div className="flex items-center space-x-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="submittedAt">Submitted Date</option>
                <option value="priority">Priority</option>
                <option value="status">Status</option>
                <option value="lastModified">Last Modified</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {data?.items?.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <QueueListIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">The queue is empty</h3>
              <p className="text-gray-500">There are no submissions to review at this time.</p>
            </motion.div>
          )}
          {data?.items?.map((item: CurationItem) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`border-b border-gray-200 p-6 hover:bg-gray-50 cursor-pointer ${
                selectedItemId === item.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
              onClick={() => onItemSelect?.(item)}
              role="button"
              tabIndex={0}
              aria-label={`Open submission ${sanitizeText(item.title || item.imageId)}`}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && onItemSelect) {
                  event.preventDefault();
                  onItemSelect(item);
                }
              }}
            >
              <div className="flex items-start space-x-4">
                {/* Thumbnail */}
                <div className="flex-shrink-0">
                  {item.thumbnailUrl ? (
                    <div className="relative h-16 w-16">
                      <Image
                        src={item.thumbnailUrl}
                        alt={item.title || 'Submission thumbnail'}
                        fill
                        sizes="64px"
                        className="rounded-lg object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="h-16 w-16 bg-gray-200 rounded-lg flex items-center justify-center">
                      <span className="text-gray-400 text-xs">No image</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {sanitizeText(item.title || 'Untitled')}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {sanitizeText(item.description || 'No description')}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <span>ID: {sanitizeText(item.imageId)}</span>
                        <span>Hazard: {sanitizeText(item.metadata.hazardType)}</span>
                        {item.location && (
                          <span>📍 {sanitizeText(item.location.address)}</span>
                        )}
                        <span>👤 {sanitizeText(item.submittedBy)}</span>
                      </div>
                    </div>

                    {/* Status and Actions */}
                    <div className="flex flex-col items-end space-y-2">
                      <div className="flex items-center space-x-2">
                        {item.flagged && (
                          <FlagIcon className="h-4 w-4 text-red-500" title={sanitizeText(item.flagReason || 'Flagged')} />
                        )}
                        {item.commentsCount > 0 && (
                          <div className="flex items-center text-gray-500">
                            <ChatBubbleLeftIcon className="h-4 w-4 mr-1" />
                            <span className="text-xs">{item.commentsCount}</span>
                          </div>
                        )}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(item.priority)}`}>
                          {item.priority}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        {getStatusIcon(item.status)}
                        <span className="text-sm text-gray-600 capitalize">
                          {item.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAction(item.id, 'approve');
                          }}
                          className="p-1 text-green-600 hover:bg-green-100 rounded"
                          title="Approve"
                          aria-label="Approve submission"
                        >
                          <CheckCircleIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAction(item.id, 'reject');
                          }}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                          title="Reject"
                          aria-label="Reject submission"
                        >
                          <XCircleIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAction(item.id, 'flag');
                          }}
                          className="p-1 text-orange-600 hover:bg-orange-100 rounded"
                          title="Flag"
                          aria-label="Flag submission for review"
                        >
                          <FlagIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="text-xs text-gray-500 text-right">
                        <div>Submitted: {new Date(item.submittedAt).toLocaleDateString()}</div>
                        {item.assignedTo && <div>Assigned: {item.assignedTo}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Pagination */}
        {data?.total > pageSize && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, data.total)} of {data.total} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {Math.ceil(data.total / pageSize)}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(Math.ceil(data.total / pageSize), currentPage + 1))}
                  disabled={currentPage === Math.ceil(data.total / pageSize)}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CurationQueue;
