'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendFetch } from '@/lib/auth-utils';
import {
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  DocumentArrowUpIcon,
  DocumentArrowDownIcon,
  PlayIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
  FolderOpenIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '@/components/design-system';

interface ImportJob {
  id: string;
  filename: string;
  type: 'zip' | 'csv';
  status: 'pending' | 'validating' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  createdAt: string;
  completedAt?: string;
  errors: Array<{
    item: string;
    error: string;
    line?: number;
  }>;
  validationReport?: {
    validItems: number;
    invalidItems: number;
    warnings: string[];
  };
}

interface ExportJob {
  id: string;
  format: 'csv' | 'geojson' | 'iso_xml';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  downloadUrl?: string;
  expiresAt?: string;
  createdAt: string;
  completedAt?: string;
  filters: any;
}

const BulkImportExport: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<'zip' | 'csv'>('zip');
  const [dryRun, setDryRun] = useState(true);
  const [exportFormat, setExportFormat] = useState<
    'csv' | 'geojson' | 'iso_xml'
  >('csv');
  const [exportFilters, setExportFilters] = useState({
    hazardType: '',
    dateFrom: '',
    dateTo: '',
    status: 'approved',
  });

  const queryClient = useQueryClient();

  // Fetch import jobs
  const { data: importJobs, isLoading: importLoading } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: async () => {
      const response = await backendFetch('/api/admin/curation/bulk-import');
      if (!response.ok) throw new Error('Failed to fetch import jobs');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds for progress updates
  });

  // Fetch export jobs
  const { data: exportJobs, isLoading: exportLoading } = useQuery({
    queryKey: ['export-jobs'],
    queryFn: async () => {
      const response = await backendFetch('/api/admin/curation/export');
      if (!response.ok) throw new Error('Failed to fetch export jobs');
      return response.json();
    },
    refetchInterval: 5000,
  });

  // Upload and start import
  const importMutation = useMutation({
    mutationFn: async ({
      file,
      type,
      dryRun,
    }: {
      file: File;
      type: string;
      dryRun: boolean;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      formData.append('dry_run', dryRun.toString());

      const response = await backendFetch('/api/admin/curation/bulk-import', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to start import');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      setSelectedFile(null);
    },
  });

  // Start export
  const exportMutation = useMutation({
    mutationFn: async ({
      format,
      filters,
    }: {
      format: string;
      filters: any;
    }) => {
      const response = await backendFetch('/api/admin/curation/export', {
        method: 'POST',
        body: JSON.stringify({
          export_type: format,
          format_options: {},
          filters: filters || {},
        }),
      });
      if (!response.ok) throw new Error('Failed to start export');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['export-jobs'] });
    },
  });

  // Handle file drag and drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);

      // Auto-detect import type based on file extension
      if (file.name.endsWith('.zip')) {
        setImportType('zip');
      } else if (file.name.endsWith('.csv')) {
        setImportType('csv');
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      // Auto-detect import type
      if (file.name.endsWith('.zip')) {
        setImportType('zip');
      } else if (file.name.endsWith('.csv')) {
        setImportType('csv');
      }
    }
  };

  const startImport = () => {
    if (selectedFile) {
      importMutation.mutate({
        file: selectedFile,
        type: importType,
        dryRun,
      });
    }
  };

  const startExport = () => {
    exportMutation.mutate({
      format: exportFormat,
      filters: exportFilters,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'validating':
      case 'processing':
        return <ArrowPathIcon className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'validating':
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Import/Export</h1>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'import'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CloudArrowUpIcon className="h-4 w-4 inline mr-2" />
            Import
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'export'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CloudArrowDownIcon className="h-4 w-4 inline mr-2" />
            Export
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'import' && (
          <motion.div
            key="import"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Import Form */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Import Data
              </h3>

              {/* File Upload Area */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {selectedFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center space-x-3">
                      <FolderOpenIcon className="h-12 w-12 text-blue-500" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900">
                          {selectedFile.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <div>
                      <p className="text-lg font-medium text-gray-900">
                        Drop files here or click to browse
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports ZIP archives and CSV files
                      </p>
                    </div>
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      accept=".zip,.csv"
                      className="hidden"
                      id="file-upload"
                      name="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200"
                    >
                      Choose File
                    </label>
                  </div>
                )}
              </div>

              {/* Import Options */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Select
                    label="Import Type"
                    name="importType"
                    value={importType}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setImportType(e.target.value as 'zip' | 'csv')}
                    variant="light"
                    size="md"
                  >
                    <option value="zip">ZIP Archive (Images + Metadata)</option>
                    <option value="csv">CSV File (Metadata Only)</option>
                  </Select>
                </div>

                <div className="flex items-center justify-center">
                  <label
                    htmlFor="dry-run-checkbox"
                    className="flex items-center space-x-2"
                  >
                    <input
                      type="checkbox"
                      id="dry-run-checkbox"
                      name="dryRun"
                      checked={dryRun}
                      onChange={(
                        e: React.ChangeEvent<
                          HTMLSelectElement | HTMLInputElement
                        >
                      ) => setDryRun((e.target as HTMLInputElement).checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Dry Run (Validate Only)
                    </span>
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={startImport}
                    disabled={!selectedFile || importMutation.isPending}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    <PlayIcon className="h-4 w-4 mr-2" />
                    {dryRun ? 'Validate' : 'Import'}
                  </button>
                </div>
              </div>

              {/* Help Text */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">
                  Import Guidelines
                </h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>
                    • ZIP files should contain images and a metadata.csv file
                  </li>
                  <li>
                    • CSV files must include required columns: title,
                    description, hazard_type, capture_date
                  </li>
                  <li>
                    • Use dry run to validate your data before actual import
                  </li>
                  <li>• Large imports are processed in the background</li>
                </ul>
              </div>
            </div>

            {/* Import Jobs */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Import History
                </h3>
              </div>

              {importLoading ? (
                <div className="p-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {(importJobs as any)?.map((job: ImportJob) => (
                    <div key={job.id} className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">
                              {job.filename}
                            </h4>
                            <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                              <span>
                                Type: {(job.type || 'unknown').toUpperCase()}
                              </span>
                              <span>Items: {job.totalItems}</span>
                              <span>
                                Started:{' '}
                                {new Date(job.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
                          >
                            {job.status}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {(job.status === 'processing' ||
                        job.status === 'validating') && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Progress</span>
                            <span>{job.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${job.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Results Summary */}
                      {job.status === 'completed' && (
                        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-lg font-semibold text-green-600">
                              {job.successCount}
                            </div>
                            <div className="text-gray-500">Successful</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-red-600">
                              {job.errorCount}
                            </div>
                            <div className="text-gray-500">Errors</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-gray-600">
                              {job.totalItems}
                            </div>
                            <div className="text-gray-500">Total</div>
                          </div>
                        </div>
                      )}

                      {/* Validation Report */}
                      {job.validationReport && (
                        <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
                          <h5 className="text-sm font-medium text-yellow-900 mb-2">
                            Validation Report
                          </h5>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-green-600 font-medium">
                                {job.validationReport.validItems}
                              </span>
                              <span className="text-gray-600">
                                {' '}
                                valid items
                              </span>
                            </div>
                            <div>
                              <span className="text-red-600 font-medium">
                                {job.validationReport.invalidItems}
                              </span>
                              <span className="text-gray-600">
                                {' '}
                                invalid items
                              </span>
                            </div>
                          </div>
                          {job.validationReport.warnings.length > 0 && (
                            <div className="mt-2">
                              <h6 className="text-xs font-medium text-yellow-900">
                                Warnings:
                              </h6>
                              <ul className="text-xs text-yellow-800 mt-1 space-y-1">
                                {job.validationReport.warnings.map(
                                  (warning, idx) => (
                                    <li
                                      key={`${job.id}-warning-${idx}-${warning}`}
                                    >
                                      • {warning}
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Errors */}
                      {job.errors.length > 0 && (
                        <div className="mt-3">
                          <details className="group">
                            <summary className="cursor-pointer text-sm font-medium text-red-600 hover:text-red-800">
                              View {job.errors.length} errors
                            </summary>
                            <div className="mt-2 p-3 bg-red-50 rounded-lg max-h-32 overflow-y-auto">
                              {job.errors.map((error, idx) => (
                                <div
                                  key={`${job.id}-error-${error.item}-${error.line ?? idx}`}
                                  className="text-xs text-red-800 mb-1"
                                >
                                  <span className="font-medium">
                                    {error.item}
                                  </span>
                                  {error.line && (
                                    <span className="text-red-600">
                                      {' '}
                                      (line {error.line})
                                    </span>
                                  )}
                                  : {error.error}
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  ))}

                  {(!importJobs || (importJobs as any).length === 0) && (
                    <div className="p-6 text-center text-gray-500">
                      No import jobs found. Upload a file to get started.
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'export' && (
          <motion.div
            key="export"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Export Form */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Export Data
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Format Selection */}
                <div>
                  <Select
                    label="Export Format"
                    name="exportFormat"
                    value={exportFormat}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setExportFormat(e.target.value as any)}
                    variant="light"
                    size="md"
                  >
                    <option value="csv">CSV (Spreadsheet)</option>
                    <option value="geojson">GeoJSON (Spatial)</option>
                    <option value="iso_xml">ISO 19139 XML (Metadata)</option>
                  </Select>
                </div>

                {/* Filters */}
                <div className="space-y-4">
                  <div>
                    <Select
                      label="Hazard Type"
                      name="hazardType"
                      value={exportFilters.hazardType}
                      onChange={(
                        e: React.ChangeEvent<
                          HTMLSelectElement | HTMLInputElement
                        >
                      ) =>
                        setExportFilters({
                          ...exportFilters,
                          hazardType: e.target.value,
                        })
                      }
                      variant="light"
                      size="md"
                    >
                      <option value="">All Types</option>
                      <option value="flood">Flood</option>
                      <option value="earthquake">Earthquake</option>
                      <option value="tsunami">Tsunami</option>
                      <option value="landslide">Landslide</option>
                      <option value="cyclone">Cyclone</option>
                      <option value="drought">Drought</option>
                      <option value="wildfire">Wildfire</option>
                      <option value="volcanic">Volcanic</option>
                      <option value="coastal_erosion">Coastal Erosion</option>
                      <option value="sea_level_rise">Sea Level Rise</option>
                      <option value="storm_surge">Storm Surge</option>
                      <option value="ocean_acidification">
                        Ocean Acidification
                      </option>
                      <option value="coral_bleaching">Coral Bleaching</option>
                      <option value="marine_heatwave">Marine Heatwave</option>
                      <option value="king_tide">King Tide</option>
                      <option value="rogue_wave">Rogue Wave</option>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="export-date-from"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Date From
                      </label>
                      <input
                        type="date"
                        id="export-date-from"
                        name="dateFrom"
                        autoComplete="off"
                        value={exportFilters.dateFrom}
                        onChange={(
                          e: React.ChangeEvent<
                            HTMLSelectElement | HTMLInputElement
                          >
                        ) =>
                          setExportFilters({
                            ...exportFilters,
                            dateFrom: e.target.value,
                          })
                        }
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="export-date-to"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Date To
                      </label>
                      <input
                        type="date"
                        id="export-date-to"
                        name="dateTo"
                        autoComplete="off"
                        value={exportFilters.dateTo}
                        onChange={(
                          e: React.ChangeEvent<
                            HTMLSelectElement | HTMLInputElement
                          >
                        ) =>
                          setExportFilters({
                            ...exportFilters,
                            dateTo: e.target.value,
                          })
                        }
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <Select
                      label="Status"
                      name="exportStatus"
                      value={exportFilters.status}
                      onChange={(
                        e: React.ChangeEvent<
                          HTMLSelectElement | HTMLInputElement
                        >
                      ) =>
                        setExportFilters({
                          ...exportFilters,
                          status: e.target.value,
                        })
                      }
                      variant="light"
                      size="md"
                    >
                      <option value="">All Statuses</option>
                      <option value="approved">Approved Only</option>
                      <option value="pending">Pending Review</option>
                      <option value="under_review">Under Review</option>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={startExport}
                  disabled={exportMutation.isPending}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                  Start Export
                </button>
              </div>
            </div>

            {/* Export Jobs */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Export History
                </h3>
              </div>

              {exportLoading ? (
                <div className="p-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {(exportJobs as any)?.map((job: ExportJob) => (
                    <div key={job.id} className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">
                              {(job.format || 'unknown').toUpperCase()} Export
                            </h4>
                            <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                              <span>Items: {job.totalItems}</span>
                              <span>
                                Started:{' '}
                                {new Date(job.createdAt).toLocaleString()}
                              </span>
                              {job.completedAt && (
                                <span>
                                  Completed:{' '}
                                  {new Date(job.completedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
                          >
                            {job.status}
                          </span>

                          {job.downloadUrl && job.status === 'completed' && (
                            <a
                              href={job.downloadUrl}
                              download
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-md hover:bg-blue-200"
                            >
                              <CloudArrowDownIcon className="h-3 w-3 mr-1" />
                              Download
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {job.status === 'processing' && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Progress</span>
                            <span>{job.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${job.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Expiry Warning */}
                      {job.downloadUrl && job.expiresAt && (
                        <div className="mt-2 text-xs text-orange-600">
                          <ExclamationTriangleIcon className="h-3 w-3 inline mr-1" />
                          Download expires:{' '}
                          {new Date(job.expiresAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}

                  {(!exportJobs || (exportJobs as any).length === 0) && (
                    <div className="p-6 text-center text-gray-500">
                      No export jobs found. Start an export to get started.
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BulkImportExport;
