'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  ListChecks,
  Users,
  CloudUpload,
  CloudDownload,
  Settings,
  UserCircle,
} from 'lucide-react';

// Import components
import CurationDashboard from '../../components/CurationDashboard';
import CurationQueue, { CurationItem } from '../../components/CurationQueue';
import UserManagement from '../../components/UserManagement';
import BulkImportExport from '../../components/BulkImportExport';
import ReviewWorkflow from '../../components/ReviewWorkflow';
import ErrorBoundary from '@/components/ErrorBoundary';

const AdminCurationPage: React.FC = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'queue' | 'users' | 'import-export'
  >('dashboard');
  const [selectedItem, setSelectedItem] = useState<CurationItem | null>(null);
  const [showReviewWorkflow, setShowReviewWorkflow] = useState(false);

  const tabs = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: BarChart3,
      description: 'Overview and statistics',
    },
    {
      id: 'queue',
      label: 'Curation Queue',
      icon: ListChecks,
      description: 'Review and manage submissions',
    },
    {
      id: 'users',
      label: 'User Management',
      icon: Users,
      description: 'Manage users and permissions',
    },
    {
      id: 'import-export',
      label: 'Import/Export',
      icon: CloudUpload,
      description: 'Bulk operations and data management',
    },
  ];

  const handleItemSelect = (item: CurationItem) => {
    setSelectedItem(item);
    setShowReviewWorkflow(true);
  };

  const handleCloseReviewWorkflow = () => {
    setShowReviewWorkflow(false);
    setSelectedItem(null);
  };

  const handleStatusChange = (newStatus: string) => {
    // Optionally close the workflow after status change
    if (newStatus === 'approved' || newStatus === 'rejected') {
      setTimeout(() => {
        setShowReviewWorkflow(false);
        setSelectedItem(null);
      }, 1000);
    }
  };

  return (
    <ErrorBoundary boundaryName="admin portal">
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Admin Portal
                </h1>
                <p className="text-gray-600 mt-1">
                  Manage curation, users, and system operations
                </p>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.push('/profile')}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <UserCircle className="h-5 w-5 mr-2" />
                  Back to Profile
                </button>
                <div className="text-sm text-gray-500">
                  <Settings className="h-4 w-4 inline mr-1" />
                  System: Online
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav
              className="flex space-x-8"
              role="navigation"
              aria-label="Curation portal sections"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <div className="text-left">
                      <div>{tab.label}</div>
                      <div className="text-xs text-gray-400 font-normal">
                        {tab.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AnimatePresence mode="wait">
            {!showReviewWorkflow ? (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'dashboard' && <CurationDashboard />}

                {activeTab === 'queue' && (
                  <CurationQueue
                    onItemSelect={handleItemSelect}
                    selectedItemId={selectedItem?.id}
                  />
                )}

                {activeTab === 'users' && <UserManagement />}

                {activeTab === 'import-export' && <BulkImportExport />}
              </motion.div>
            ) : (
              <motion.div
                key="review-workflow"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {selectedItem && (
                  <ReviewWorkflow
                    itemId={selectedItem.id}
                    onStatusChange={handleStatusChange}
                    onClose={handleCloseReviewWorkflow}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Quick Actions Floating Menu */}
        {!showReviewWorkflow && (
          <div className="fixed bottom-6 right-6 z-40">
            <div className="flex flex-col space-y-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveTab('import-export')}
                className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
                title="Quick Import"
              >
                <CloudUpload className="h-6 w-6" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveTab('queue')}
                className="p-3 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 transition-colors"
                title="Review Queue"
              >
                <ListChecks className="h-6 w-6" />
              </motion.button>
            </div>
          </div>
        )}

        {/* Breadcrumb when in review workflow */}
        {showReviewWorkflow && selectedItem && (
          <div className="fixed top-20 left-0 right-0 bg-blue-50 border-b border-blue-200 z-30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <div className="flex items-center space-x-2 text-sm">
                <button
                  onClick={() => setActiveTab('queue')}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Curation Queue
                </button>
                <span className="text-gray-400">/</span>
                <span className="text-gray-700">
                  Review: {selectedItem.title || selectedItem.imageId}
                </span>
                <span className="text-gray-400">/</span>
                <span className="text-gray-500">ID: {selectedItem.id}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AdminCurationPage;
