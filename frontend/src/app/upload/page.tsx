'use client';

import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { Upload, ArrowLeft, X, FileImage } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { config } from '@/lib/config';

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

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: vocabData, isLoading, error } = useQuery({
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

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setUploadProgress(0);
      
      return imageApi.upload(formData, (progress) => {
        setUploadProgress(progress);
      });
    },
    onSuccess: () => {
      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ['images'] });
      setTimeout(() => router.push('/'), 1000); // Small delay to show completion
    },
    onError: (error) => {
      setUploadProgress(0);
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

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('hazard_type', data.hazard_type);
    formData.append('location', data.location);
    
    if (data.country) formData.append('country', data.country);
    if (data.latitude) formData.append('latitude', data.latitude.toString());
    if (data.longitude) formData.append('longitude', data.longitude.toString());
    if (data.title) formData.append('title', data.title);
    if (data.abstract) formData.append('abstract', data.abstract);
    if (data.keywords) formData.append('keywords', data.keywords);

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
                      Drop files here or click to upload
                    </span>
                    <input
                      id="file-upload"
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    {ALLOWED_EXTENSIONS.join(', ').toUpperCase()} up to {Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB
                  </p>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hazard Type *
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  {...register('hazard_type', { required: 'Hazard type is required' })}
                  disabled={isLoading}
                >
                  <option value="">
                    {isLoading ? 'Loading hazard types...' : 'Select hazard type'}
                  </option>
                  {vocabData?.hazard_types?.map((type: { id: string; label: string; description: string }) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {errors.hazard_type && <p className="mt-1 text-sm text-red-600">{errors.hazard_type.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location *
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Port Vila, Vanuatu"
                  {...register('location', { required: 'Location is required' })}
                />
                {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location.message}</p>}
              </div>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  {...register('country')}
                  disabled={isLoading}
                >
                  <option value="">
                    {isLoading ? 'Loading countries...' : 'Select country'}
                  </option>
                  {vocabData?.countries?.map((country: { id: string; label: string }) => (
                    <option key={country.id} value={country.id}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Descriptive title for the image"
                  {...register('title')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., -17.7334"
                  {...register('latitude', { valueAsNumber: true })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 168.3273"
                  {...register('longitude', { valueAsNumber: true })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Abstract</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of the image content"
                  {...register('abstract')}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Comma-separated keywords (e.g., flooding, damage, infrastructure, coastal, impact)"
                  {...register('keywords')}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Add descriptive keywords separated by commas to help others find your image. 
                  Examples: flooding, damage, infrastructure, roads, buildings, coastal, impact, assessment
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploadMutation.isPending}
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploadMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Image
                </>
              )}
            </button>
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