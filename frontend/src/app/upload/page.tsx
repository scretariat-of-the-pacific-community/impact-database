'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { VocabulariesResponse } from '@/lib/types';
import { Upload, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: vocabData }: { data: VocabulariesResponse | undefined } = useQuery({
    queryKey: ['vocabularies'],
    queryFn: () => imageApi.vocabularies(),
  });
  
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<UploadForm>();

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => imageApi.upload(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      router.push('/');
    },
  });

  const onSubmit = (data: UploadForm) => {
    const formData = new FormData();
    formData.append('file', data.file[0]);
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
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(e.dataTransfer.files[0]);
      setValue('file', dataTransfer.files);
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
                    {...register('file', { required: 'Please select a file' })}
                  />
                </label>
                <p className="mt-1 text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
              </div>
            </div>
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
                >
                  <option value="">Select hazard type</option>
                  {vocabData?.hazard_types?.map((type: any) => (
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
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Vanuatu"
                  {...register('country')}
                />
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
                  placeholder="Comma-separated keywords (e.g., flooding, damage, infrastructure)"
                  {...register('keywords')}
                />
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