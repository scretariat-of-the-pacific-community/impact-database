'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { Upload, ArrowLeft, X, FileImage } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { config } from '@/lib/config';
import { Button, FormField } from '@/components/design-system';
import ErrorBanner from '@/components/ErrorBanner';
import { trackUploadEvent } from '@/lib/analytics';
import {
  queueUpload,
  getQueuedUploads,
  flushQueuedUploads,
  subscribeToOnlineFlush,
  QueuedUploadPayload,
} from '@/lib/offline-uploads';

interface UploadForm {
  file: FileList;
  hazard_type: string;
  location: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  title?: string;
  abstract?: string;
  keywords?: string;
}

// File size constants (synchronized with backend and config)
const MAX_FILE_SIZE = config.UPLOAD.MAX_FILE_SIZE;
const ALLOWED_EXTENSIONS = config.UPLOAD.ALLOWED_EXTENSIONS;

const base64ToBlob = (base64: string, type: string) => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: type || 'application/octet-stream' });
};

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [queuedUploads, setQueuedUploads] = useState<QueuedUploadPayload[]>([]);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: vocabData, isLoading, error, refetch } = useQuery({
    queryKey: ['vocabularies'],
    queryFn: () => imageApi.vocabularies(),
  });
  
  // Debug logging
  React.useEffect(() => {
    console.log('Upload page - vocabData:', vocabData);
    console.log('Upload page - isLoading:', isLoading);
    console.log('Upload page - error:', error);
  }, [vocabData, isLoading, error]);
  
  const { register, handleSubmit, formState: { errors }, setValue, clearErrors } = useForm<UploadForm>();

  // File validation function
  const validateFile = useCallback((file: File): string | null => {
    // Check file size minimum
    if (file.size < 1024) {
      return 'File size too small. Minimum size is 1KB';
    }
    
    // Check file size maximum
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB limit`;
    }
    
    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    
    // Check for potentially dangerous filenames
    const filename = file.name.toLowerCase();
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return 'Invalid filename. Please rename your file and try again';
    }
    
    return null;
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      return;
    }

    // Clear any previous validation errors
    setValidationError(null);
    setSelectedFile(file);
    
    // Create preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const newPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(newPreviewUrl);
    
    // Update form
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    setValue('file', dataTransfer.files);
    clearErrors('file');
  }, [validateFile, previewUrl, setValue, clearErrors]);

  // Remove selected file
  const removeSelectedFile = useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setValue('file', {} as FileList);
  }, [previewUrl, setValue]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleQueuedUpload = async (payload: QueuedUploadPayload) => {
    const blob = base64ToBlob(payload.fileData, payload.fileType);
    const file = new File([blob], payload.fileName, { type: payload.fileType || 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(payload.metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, value as any);
      }
    });
    await imageApi.upload(formData);
  };

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setUploadProgress(0);

      return imageApi.upload(formData, (progress) => {
        setUploadProgress(progress);
      });
    },
    onSuccess: () => {
      setUploadProgress(100);
      trackUploadEvent('succeeded');
      queryClient.invalidateQueries({ queryKey: ['images'] });
      setTimeout(() => router.push('/'), 1000); // Small delay to show completion
    },
    onError: (error) => {
      setUploadProgress(0);
      trackUploadEvent('failed');
      console.error('Upload failed:', error);
    },
  });

  const onSubmit = (data: UploadForm) => {
    if (!selectedFile) {
      setValidationError('Please select a file to upload');
      return;
    }

    // Clear validation errors before upload
    setValidationError(null);
    trackUploadEvent('started', data.hazard_type);

    const metadata: Record<string, any> = {
      hazard_type: data.hazard_type,
      location: data.location,
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
      title: data.title,
      abstract: data.abstract,
      keywords: data.keywords,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      queueUpload(metadata, selectedFile).then(() => {
        setQueueMessage('Stored offline. We will sync this upload when you reconnect.');
        setQueuedUploads(getQueuedUploads());
        setSelectedFile(null);
        setUploadProgress(0);
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, value as any);
      }
    });

    uploadMutation.mutate(formData);
  };

  // Cleanup preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  React.useEffect(() => {
    setQueuedUploads(getQueuedUploads());
    const flush = () =>
      flushQueuedUploads(handleQueuedUpload).then(() => setQueuedUploads(getQueuedUploads()));
    const unsubscribe = subscribeToOnlineFlush(flush);
    // Attempt immediate flush in case we're back online
    flush();
    return () => {
      unsubscribe?.();
    };
  }, []);

  React.useEffect(() => {
    if (!queueMessage) return;
    const timeout = setTimeout(() => setQueueMessage(null), 5000);
    return () => clearTimeout(timeout);
  }, [queueMessage]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSyncQueuedUploads = async () => {
    await flushQueuedUploads(handleQueuedUpload);
    setQueuedUploads(getQueuedUploads());
    setQueueMessage('Queued uploads synced successfully.');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Link href="/" className="mr-4">
              <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-gray-900" />
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Upload Image</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {(queueMessage || queuedUploads.length > 0) && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
              {queueMessage && <p>{queueMessage}</p>}
              {queuedUploads.length > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <p>{queuedUploads.length} upload(s) waiting for connectivity.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={handleSyncQueuedUploads}>
                    Sync now
                  </Button>
                </div>
              )}
            </div>
          )}
          {error && (
            <ErrorBanner
              tone="warning"
              title="We couldn't load the metadata vocabularies"
              message="Some dropdowns may be incomplete until we reconnect. Please retry once you're online."
              onRetry={() => refetch()}
              retryLabel="Retry loading vocabularies"
            />
          )}
          {/* File Upload */}
          <div className="bg-white p-6 rounded-lg shadow">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image File *
            </label>
            
            {!selectedFile ? (
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center ${
                  dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="mt-2 block text-sm font-medium text-gray-900">
                      Drop files here or click to select an image
                    </span>
                    <input
                      id="file-upload"
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    {ALLOWED_EXTENSIONS.join(', ').toUpperCase()} up to {Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose Image
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              // File Selected - Show Preview
              <div className="border rounded-lg p-4">
                <div className="flex items-start gap-4">
                  {/* Preview */}
                  <div className="flex-shrink-0">
                    {previewUrl ? (
                      <div className="relative">
                        <Image
                          src={previewUrl}
                          alt="Preview"
                          width={100}
                          height={100}
                          className="rounded-lg object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                        <FileImage className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatFileSize(selectedFile.size)}
                    </p>
                    <div className="mt-2">
                      <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded inline-block">
                        ✓ Valid file
                      </div>
                    </div>
                  </div>
                  
                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={removeSelectedFile}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Progress Bar */}
                {uploadMutation.isPending && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Uploading...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Validation Error Display */}
            {validationError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 text-sm">{validationError}</p>
              </div>
            )}
            
            {errors.file && <p className="mt-1 text-sm text-red-600">{errors.file.message}</p>}
          </div>

          {/* Required Fields */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Required Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Hazard Type"
                htmlFor="upload-hazard-type"
                required
                error={errors.hazard_type?.message}
              >
                <select
                  id="upload-hazard-type"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-gray-900 appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: 'right 0.5rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1.5em 1.5em'
                  }}
                  {...register('hazard_type', { required: 'Hazard type is required' })}
                  disabled={isLoading}
                >
                  <option value="" style={{ backgroundColor: 'white', color: '#374151' }}>
                    {isLoading ? 'Loading hazard types...' : 'Select hazard type'}
                  </option>
                  {vocabData?.hazard_types?.map((type: { id: string; label: string; description: string }) => (
                    <option key={type.id} value={type.id} style={{ backgroundColor: 'white', color: '#374151' }}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Location"
                htmlFor="upload-location"
                required
                error={errors.location?.message}
              >
                <input
                  id="upload-location"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., Port Vila, Vanuatu"
                  {...register('location', { required: 'Location is required' })}
                />
              </FormField>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Country" htmlFor="upload-country" hint="Optional">
                <select
                  id="upload-country"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-gray-900 appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: 'right 0.5rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1.5em 1.5em'
                  }}
                  {...register('country')}
                  disabled={isLoading}
                >
                  <option value="" style={{ backgroundColor: 'white', color: '#374151' }}>
                    {isLoading ? 'Loading countries...' : 'Select country'}
                  </option>
                  {vocabData?.countries?.map((country: { id: string; label: string }) => (
                    <option key={country.id} value={country.id} style={{ backgroundColor: 'white', color: '#374151' }}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Title" htmlFor="upload-title" hint="Optional">
                <input
                  id="upload-title"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Descriptive title for the image"
                  {...register('title')}
                />
              </FormField>

              <FormField label="Latitude" htmlFor="upload-latitude" hint="e.g., -17.7334">
                <input
                  id="upload-latitude"
                  type="number"
                  step="any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., -17.7334"
                  {...register('latitude', { valueAsNumber: true })}
                />
              </FormField>

              <FormField label="Longitude" htmlFor="upload-longitude" hint="e.g., 168.3273">
                <input
                  id="upload-longitude"
                  type="number"
                  step="any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g., 168.3273"
                  {...register('longitude', { valueAsNumber: true })}
                />
              </FormField>

              <FormField label="Abstract" htmlFor="upload-abstract" className="md:col-span-2">
                <textarea
                  id="upload-abstract"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Brief description of the image content"
                  {...register('abstract')}
                />
              </FormField>

              <FormField label="Keywords" htmlFor="upload-keywords" hint="Comma-separated terms" className="md:col-span-2">
                <input
                  id="upload-keywords"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Comma-separated keywords (e.g., flooding, damage, infrastructure)"
                  {...register('keywords')}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Add descriptive keywords separated by commas to help others find your image.
                </p>
              </FormField>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              leftIcon={!uploadMutation.isPending ? <Upload className="w-4 h-4" /> : undefined}
              isLoading={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Image'}
            </Button>
          </div>

          {/* Upload Progress */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">Uploading...</span>
                <span className="text-sm text-blue-600">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {uploadProgress === 100 && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-green-800 text-sm">
                ✅ Upload completed successfully! Redirecting...
              </p>
            </div>
          )}

          {uploadMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800">
                Error uploading image: {uploadMutation.error?.message || 'Unknown error'}
              </p>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
