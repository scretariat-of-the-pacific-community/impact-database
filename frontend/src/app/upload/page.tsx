'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useForm, RegisterOptions } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import {
  Upload,
  ArrowLeft,
  X,
  FileImage,
  MapPin,
  Loader2,
  FileText,
  Plus,
  Trash2,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import dompurify from 'dompurify';

// Client-side DOMPurify singleton
const DOMPurify = typeof window !== 'undefined' ? dompurify(window) : null;

// Dynamically import MapPicker to avoid SSR issues with Leaflet
const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-pacific-400 animate-spin mx-auto mb-2" />
        <p className="text-sm text-white">Loading map...</p>
      </div>
    </div>
  ),
});
import { config } from '@/lib/config';
import { Button, FormField } from '@/components/design-system';
import ErrorBanner from '@/components/ErrorBanner';
import { trackUploadEvent } from '@/lib/analytics';
import { toast } from 'sonner';
import {
  queueUpload,
  getQueuedUploads,
  flushQueuedUploads,
  subscribeToOnlineFlush,
  QueuedUploadPayload,
} from '@/lib/offline-uploads';

const INPUT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
} as const;

type SanitizeSetValueOptions = {
  shouldDirty?: boolean;
  shouldValidate?: boolean;
  shouldTouch?: boolean;
};

interface UploadForm {
  file: FileList;
  hazard_type: string;
  location: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  altitude_ref?: number;
  title?: string;
  abstract?: string;
  keywords?: string;
  hazardType?: string;
  sourceType?: string;
  eventId?: string;
  titleTemplate?: string;
  source_type?: string;
}

interface ApiUploadMetadata {
  filename: string;
  datetime: string;
  hazard_type: string;
  event_id: string | null;
  geometry: { type: 'Point'; coordinates: number[] } | null;
  altitude: number | null;
  altitude_ref: number;
  data_license: string;
  source_type: string;
  positional_accuracy: number | null;
  title: string;
  abstract: string | null;
  location: string | null;
  country: string | null;
  keywords: string[];
}

interface MetadataLike {
  hazard_type: string;
  location?: string;
  country?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  title?: string;
  abstract?: string;
  keywords?: string | string[];
  datetime?: string;
  geometry?: { type: 'Point'; coordinates: number[] } | null;
  event_id?: string | null;
  data_license?: string;
  source_type?: string;
  positional_accuracy?: number | null;
}

// File size constants (synchronized with backend and config)
const MAX_FILE_SIZE = config.UPLOAD.MAX_FILE_SIZE;
const MAX_BATCH_FILES = 10; // Maximum files per batch upload
const MAX_BATCH_SIZE = 500 * 1024 * 1024; // 500MB total batch size
const ALLOWED_EXTENSIONS = config.UPLOAD.ALLOWED_EXTENSIONS;

const humanizeFilename = (filename: string) => {
  const base = filename.replace(/\.[^/.]+$/, '');
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Untitled Upload';
  }
  return cleaned
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const toNumber = (value?: number | string | null) => {
  if (typeof value === 'number') return Number.isNaN(value) ? undefined : value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const buildGeometry = (
  latitude?: number | string | null,
  longitude?: number | string | null
) => {
  const lat = toNumber(latitude);
  const lon = toNumber(longitude);
  if (typeof lat === 'number' && typeof lon === 'number') {
    return {
      type: 'Point' as const,
      coordinates: [Number(lon), Number(lat)],
    };
  }
  return null;
};

const extractKeywords = (keywords?: string | string[]) => {
  if (!keywords) return [];
  if (Array.isArray(keywords)) {
    return keywords
      .map((keyword) => (typeof keyword === 'string' ? keyword.trim() : ''))
      .filter(Boolean);
  }
  return keywords
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
};

const buildApiMetadata = (
  metadata: MetadataLike,
  fileName: string
): ApiUploadMetadata => {
  const location = metadata.location?.trim() || null;
  const country = metadata.country?.trim() || null;
  return {
    filename: fileName,
    datetime: metadata.datetime || new Date().toISOString(),
    hazard_type: metadata.hazard_type,
    event_id: metadata.event_id ?? null,
    altitude: null,
    altitude_ref: 0,
    geometry:
      metadata.geometry ?? buildGeometry(metadata.latitude, metadata.longitude),
    data_license:
      metadata.data_license || 'https://creativecommons.org/licenses/by/4.0/',
    source_type: metadata.source_type || 'citizen',
    positional_accuracy: metadata.positional_accuracy ?? null,
    title: metadata.title?.trim() || humanizeFilename(fileName),
    abstract: metadata.abstract?.trim() || null,
    location,
    country,
    keywords: extractKeywords(metadata.keywords),
  };
};

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // Initialize query client before using it in useEffect
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Real-time batch progress polling
  const { data: batchStatus, isLoading: batchStatusLoading } = useQuery({
    queryKey: ['batch-status', activeBatchId],
    queryFn: async () => {
      if (!activeBatchId) return null;

      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/${activeBatchId}/status`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          setActiveBatchId(null);
          return null;
        }
        throw new Error('Failed to fetch batch status');
      }

      return response.json();
    },
    enabled: !!activeBatchId && isAuthenticated,
    refetchInterval: (data: any) => {
      if (!data || data.is_complete) {
        return false;
      }
      return 2000;
    },
    refetchOnWindowFocus: false,
  });

  // Show completion notification when batch finishes
  React.useEffect(() => {
    if ((batchStatus as any)?.is_complete && activeBatchId) {
      const { status, successful_files, failed_files, total_files } =
        batchStatus as any;

      if (status === 'completed') {
        toast.success('Batch upload complete!', {
          description: `Successfully uploaded ${successful_files} of ${total_files} images`,
        });
      } else if (status === 'partial') {
        toast.warning('Batch upload partially complete', {
          description: `${successful_files} succeeded, ${failed_files} failed`,
        });
      } else if (status === 'failed') {
        toast.error('Batch upload failed', {
          description: `All ${total_files} files failed to upload`,
        });
      } else if (status === 'cancelled') {
        toast.info('Batch upload cancelled', {
          description: 'Upload was cancelled by user',
        });
      }

      setActiveBatchId(null);
      queryClient.invalidateQueries({ queryKey: ['images'] });
    }
  }, [
    (batchStatus as any)?.is_complete,
    activeBatchId,
    batchStatus,
    queryClient,
  ]);

  // Template queries
  const { data: templatesData } = useQuery({
    queryKey: ['batch-templates'],
    queryFn: async () => {
      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/templates`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) return { templates: [], total: 0 };
      return response.json();
    },
    enabled: isAuthenticated,
  });

  // Analytics query
  const { data: analyticsData } = useQuery({
    queryKey: ['batch-analytics'],
    queryFn: async () => {
      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/analytics?days=30`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) return null;
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [queuedUploads, setQueuedUploads] = useState<QueuedUploadPayload[]>([]);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [isChrome, setIsChrome] = useState(false);
  const [exifMetadata, setExifMetadata] = useState<{
    camera?: string;
    orientation?: number;
    altitude?: number;
    hasGPS?: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshQueuedUploads = useCallback(async () => {
    try {
      const queue = await getQueuedUploads();
      setQueuedUploads(queue);
    } catch (error) {
      toast.error('Could not load queued uploads', {
        description:
          'Offline uploads may not display until the connection stabilizes.',
      });
    }
  }, []);
  const {
    data: vocabData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['vocabularies'],
    queryFn: () => imageApi.vocabularies(),
  });

  // Detect Chrome browser (client-side only to avoid hydration mismatch)
  React.useEffect(() => {
    const userAgent = navigator.userAgent;
    const vendor = navigator.vendor;
    setIsChrome(/Chrome/.test(userAgent) && /Google Inc/.test(vendor));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    clearErrors,
    watch,
    getValues,
  } = useForm<UploadForm>();

  const sanitizeInputValue = useCallback(
    (value: string | null | undefined) =>
      DOMPurify?.sanitize(value ?? '', INPUT_SANITIZE_CONFIG as any) ??
      value ??
      '',
    []
  );

  const registerSanitizedField = useCallback(
    <TFieldName extends keyof UploadForm>(
      name: TFieldName,
      options?: RegisterOptions<UploadForm, TFieldName>
    ) =>
      register(name, {
        ...options,
        onChange: (event: any) => {
          const inputValue = (event.target.value ?? '') as string;
          const sanitizedValue = sanitizeInputValue(inputValue);
          if (sanitizedValue !== inputValue) {
            event.target.value = sanitizedValue;
          }
          setValue(name, sanitizedValue as any, {
            shouldDirty: true,
            shouldValidate: true,
          });
          if (options?.onChange) {
            options.onChange(event);
          }
        },
      }),
    [register, sanitizeInputValue, setValue]
  );

  const setSanitizedFieldValue = useCallback(
    <TFieldName extends keyof UploadForm>(
      name: TFieldName,
      value: string | null | undefined,
      options?: SanitizeSetValueOptions
    ) => {
      setValue(name, sanitizeInputValue(value) as any, options);
    },
    [sanitizeInputValue, setValue]
  );

  // Watch coordinates for MapPicker
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const location = watch('location');
  const country = watch('country');

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
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return 'Invalid filename. Please rename your file and try again';
    }

    return null;
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (file: File) => {
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

      const existingTitle = getValues('title');
      if (!existingTitle || existingTitle.trim().length === 0) {
        setSanitizedFieldValue('title', humanizeFilename(file.name));
      }

      // Extract EXIF GPS data and metadata from image
      try {
        // @ts-ignore - exif-js types
        const EXIF = await import('exif-js');

        EXIF.getData(file as any, function (this: any) {
          const metadata: any = {};

          // Extract GPS coordinates
          // @ts-ignore
          const lat = EXIF.getTag(this, 'GPSLatitude');
          // @ts-ignore
          const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
          // @ts-ignore
          const lon = EXIF.getTag(this, 'GPSLongitude');
          // @ts-ignore
          const lonRef = EXIF.getTag(this, 'GPSLongitudeRef');

          // Extract GPS altitude
          // @ts-ignore
          const altitude = EXIF.getTag(this, 'GPSAltitude');
          // @ts-ignore
          const altitudeRef = EXIF.getTag(this, 'GPSAltitudeRef');

          // Extract camera info
          // @ts-ignore
          const make = EXIF.getTag(this, 'Make');
          // @ts-ignore
          const model = EXIF.getTag(this, 'Model');

          // Extract orientation
          // @ts-ignore
          const orientation = EXIF.getTag(this, 'Orientation');

          if (lat && lon) {
            // Convert to decimal degrees
            const convertToDecimal = (coords: number[]) => {
              return coords[0] + coords[1] / 60 + coords[2] / 3600;
            };

            let latitude = convertToDecimal(lat);
            let longitude = convertToDecimal(lon);

            // Apply direction
            if (latRef === 'S') latitude = -latitude;
            if (lonRef === 'W') longitude = -longitude;

            // Only set if coordinates fields are empty
            const currentLat = getValues('latitude');
            const currentLon = getValues('longitude');

            if (!currentLat && !currentLon) {
              setValue('latitude', latitude);
              setValue('longitude', longitude);
              toast.success('GPS coordinates auto-extracted', {
                description: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
              });
            }

            metadata.hasGPS = true;
          }

          // Extract and set altitude
          if (altitude !== undefined) {
            const altMeters =
              typeof altitude === 'number' ? altitude : parseFloat(altitude);
            const currentAlt = getValues('altitude');

            if (!currentAlt) {
              // Apply altitude reference (0=above sea level, 1=below)
              const finalAlt = altitudeRef === 1 ? -altMeters : altMeters;
              setValue('altitude', finalAlt);
              setValue('altitude_ref', altitudeRef || 0);
              metadata.altitude = finalAlt;
              toast.success('Altitude auto-extracted', {
                description: `${finalAlt.toFixed(0)}m ${altitudeRef === 1 ? 'below' : 'above'} sea level`,
              });
            }
          }

          // Store camera info and orientation for display
          if (make || model) {
            metadata.camera = `${make || ''} ${model || ''}`.trim();
          }
          if (orientation) {
            metadata.orientation = orientation;
          }

          setExifMetadata(metadata);

          // Show comprehensive toast notification
          if (metadata.hasGPS || metadata.altitude || metadata.camera) {
            const details: string[] = [];
            if (metadata.hasGPS) details.push('GPS coordinates');
            if (metadata.altitude)
              details.push(`Altitude: ${metadata.altitude.toFixed(0)}m`);
            if (metadata.camera) details.push(`Camera: ${metadata.camera}`);

            toast.success('EXIF metadata extracted', {
              description: details.join(' • '),
            });
          }
          // No toast needed when no EXIF data - it's optional
        });
      } catch (error) {
        toast.warning('Metadata extraction unavailable', {
          description:
            'We could not read EXIF data from this image. You can still submit details manually.',
        });
      }
    },
    [
      validateFile,
      previewUrl,
      setValue,
      clearErrors,
      getValues,
      setSanitizedFieldValue,
    ]
  );

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

  // Handle multiple files for batch upload
  const handleMultipleFiles = useCallback(
    (files: File[]) => {
      // Check file count limit
      if (files.length > MAX_BATCH_FILES) {
        toast.error('Too many files', {
          description: `Maximum ${MAX_BATCH_FILES} files per batch. You selected ${files.length} files.`,
        });
        return;
      }

      const validFiles: File[] = [];
      const errors: string[] = [];
      let totalSize = 0;

      files.forEach((file) => {
        const validationError = validateFile(file);
        if (!validationError) {
          validFiles.push(file);
          totalSize += file.size;
        } else {
          errors.push(`${file.name}: ${validationError}`);
        }
      });

      // Check total batch size limit
      if (totalSize > MAX_BATCH_SIZE) {
        toast.error('Batch size too large', {
          description: `Total size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_BATCH_SIZE / 1024 / 1024}MB limit`,
        });
        return;
      }

      if (validFiles.length > 0) {
        setSelectedFiles(validFiles);
        setBatchMode(true);
        setValidationError(null);
        toast.success(`${validFiles.length} files ready for batch upload`);
      }

      if (errors.length > 0) {
        toast.warning('Some files were skipped', {
          description: errors.slice(0, 3).join(', '),
        });
      }
    },
    [validateFile]
  );

  // Remove file from batch
  const removeFromBatch = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Clear batch
  const clearBatch = useCallback(() => {
    setSelectedFiles([]);
    setBatchMode(false);
    setValidationError(null);
  }, []);

  // Batch upload mutation
  const batchUploadMutation = useMutation({
    mutationFn: async (data: { files: File[]; metadata: any }) => {
      const formData = new FormData();

      data.files.forEach((file) => {
        formData.append('files', file);
      });

      Object.entries(data.metadata).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });

      const response = await fetch(`${config.API.BASE_URL}/api/batch/create`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        // Try to parse error as JSON, fallback to text if not JSON
        const contentType = response.headers.get('content-type');
        let errorMessage = 'Batch upload failed';

        if (contentType?.includes('application/json')) {
          try {
            const error = await response.json();
            errorMessage = error.detail || errorMessage;
          } catch (e) {
            // JSON parse failed, use default message
          }
        } else {
          // Not JSON, try to get text
          try {
            const text = await response.text();
            errorMessage = text.slice(0, 200) || errorMessage; // Limit to 200 chars
          } catch (e) {
            // Text parse failed, use default message
          }
        }

        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (response: any) => {
      toast.success('Batch upload started', {
        description: `Processing ${response.total_files} files in background`,
      });
      clearBatch();

      // Set active batch ID to start polling
      setActiveBatchId(response.id);

      queryClient.invalidateQueries({ queryKey: ['images'] });
      // Don't redirect - stay on page to show progress
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Batch upload failed', { description: message });
    },
  });

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Retry failed files mutation
  const retryFailedMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/${batchId}/retry-failed`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to retry batch');
      }

      return response.json();
    },
    onSuccess: (response: any) => {
      toast.success('Retry started', {
        description: `Retrying ${response.total_files} failed files`,
      });
      setActiveBatchId(response.id);
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Retry failed', { description: message });
    },
  });

  // Cancel batch mutation
  const cancelBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/${batchId}/cancel`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to cancel batch');
      }

      return response.json();
    },
    onSuccess: () => {
      toast.info('Batch cancelled');
      setActiveBatchId(null);
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Cancel failed', { description: message });
    },
  });

  // Template mutations
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description: string;
      template_data: any;
    }) => {
      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/templates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save template');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Template saved successfully');
      queryClient.invalidateQueries({ queryKey: ['batch-templates'] });
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Failed to save template', { description: message });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/templates/${templateId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete template');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Template deleted');
      queryClient.invalidateQueries({ queryKey: ['batch-templates'] });
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Failed to delete template', { description: message });
    },
  });

  const loadTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(
        `${config.API.BASE_URL}/api/batch/templates/${templateId}`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) throw new Error('Failed to load template');
      return response.json();
    },
    onSuccess: (template: any) => {
      // Apply template data to form
      const data = template.template_data;
      if (data.hazard_type) setValue('hazardType', data.hazard_type);
      if (data.source_type) setValue('sourceType', data.source_type);
      if (data.event_id) setValue('eventId', data.event_id);
      if (data.title_template) setValue('titleTemplate', data.title_template);
      if (data.abstract) setValue('abstract', data.abstract);
      if (data.location) setValue('location', data.location);
      if (data.country) setValue('country', data.country);
      if (data.keywords) setValue('keywords', data.keywords);
      toast.success(`Template "${template.name}" loaded`);
    },
    onError: () => {
      toast.error('Failed to load template');
    },
  });

  const handleQueuedUpload = useCallback(
    async (payload: QueuedUploadPayload) => {
      const file = new File([payload.fileData], payload.fileName, {
        type: payload.fileType || 'application/octet-stream',
      });

      const apiMetadata = buildApiMetadata(
        payload.metadata as MetadataLike,
        payload.fileName
      );

      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata_json', JSON.stringify(apiMetadata));
      await imageApi.upload(formData);
    },
    []
  );

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setUploadProgress(0);

      return imageApi.upload(formData, (progress) => {
        setUploadProgress(progress);
      });
    },
    onSuccess: (response: any) => {
      setUploadProgress(100);
      trackUploadEvent('succeeded');
      queryClient.invalidateQueries({ queryKey: ['images'] });
      const unlocked = response?.new_achievements || [];
      if (Array.isArray(unlocked) && unlocked.length > 0) {
        unlocked.forEach((achievement: any) => {
          toast.success(
            `Achievement unlocked: ${achievement.name || achievement.id}`,
            {
              description:
                achievement.description || 'You hit a new milestone!',
              duration: 6000,
            }
          );
        });
      }
      setTimeout(() => router.push('/'), 1000); // Small delay to show completion
    },
    onError: (error: any) => {
      setUploadProgress(0);
      trackUploadEvent('failed');
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.toLowerCase().includes('validate credentials') ||
        message.includes('401')
      ) {
        toast.error('Session expired. Please sign in to continue uploading.');
        router.push(`/auth/login?returnUrl=${encodeURIComponent(pathname)}`);
      } else {
        toast.error('Upload failed', {
          description: message,
        });
      }
    },
  });

  const onSubmit = async (data: UploadForm) => {
    if (authLoading) {
      toast.info('Checking your session. Please try again in a moment.');
      return;
    }

    if (!isAuthenticated) {
      toast.error('Please sign in to upload images.', {
        description: 'You need an active session to submit uploads.',
      });
      router.push(`/auth/login?returnUrl=${encodeURIComponent(pathname)}`);
      return;
    }

    // Prevent double-submission
    if (uploadMutation.isPending || batchUploadMutation.isPending) {
      return;
    }

    // Handle batch upload
    if (batchMode && selectedFiles.length > 0) {
      const metadata = {
        hazard_type: data.hazard_type,
        source_type: 'citizen',
        event_id: null,
        data_license: 'https://creativecommons.org/licenses/by/4.0/',
        title_template: data.title,
        abstract: data.abstract,
        location: data.location,
        country: data.country,
        keywords: data.keywords,
      };

      batchUploadMutation.mutate({ files: selectedFiles, metadata });
      return;
    }

    if (!selectedFile) {
      setValidationError('Please select a file to upload');
      return;
    }

    // Clear validation errors before upload
    setValidationError(null);
    trackUploadEvent('started', data.hazard_type);
    const apiMetadata = buildApiMetadata(data, selectedFile.name);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        await queueUpload(apiMetadata, selectedFile);
        setQueueMessage(
          'Stored offline. We will sync this upload when you reconnect.'
        );
        await refreshQueuedUploads();
        setSelectedFile(null);
        setUploadProgress(0);
      } catch (error) {
        toast.error('Offline queue failed', {
          description:
            'We could not store this upload. Please retry once you are online.',
        });
        setQueueMessage(
          'We could not store this upload offline. Please try again when you are online.'
        );
      }
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('metadata_json', JSON.stringify(apiMetadata));

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
    const flush = async () => {
      await flushQueuedUploads(handleQueuedUpload);
      await refreshQueuedUploads();
    };

    refreshQueuedUploads();
    const unsubscribe = subscribeToOnlineFlush(flush);
    flush();
    return () => {
      unsubscribe?.();
    };
  }, [handleQueuedUpload, refreshQueuedUploads]);

  React.useEffect(() => {
    if (!queueMessage) return;
    const timeout = setTimeout(() => setQueueMessage(null), 5000);
    return () => clearTimeout(timeout);
  }, [queueMessage]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 1) {
        handleMultipleFiles(files);
      } else {
        handleFileSelect(files[0]);
      }
    }
  };

  const handleSyncQueuedUploads = async () => {
    await flushQueuedUploads(handleQueuedUpload);
    await refreshQueuedUploads();
    setQueueMessage('Queued uploads synced successfully.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 text-white">
      <header className="border-b border-white/10 backdrop-blur-sm bg-deep-900/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Link href="/" className="mr-4 hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6 text-surface-soft" />
            </Link>
            <h1 className="text-3xl font-bold text-white">Upload Image</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Batch Progress Indicator */}
        {batchStatus && !(batchStatus as any)?.is_complete && (
          <div className="mb-6 rounded-3xl border border-pacific-500/30 bg-gradient-to-br from-pacific-900/40 to-deep-900/40 backdrop-blur p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Batch Upload Progress
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-surface-soft">
                  {(batchStatus as any)?.status === 'processing'
                    ? 'Processing...'
                    : 'Pending...'}
                </span>
                {(batchStatus as any)?.status === 'processing' &&
                  activeBatchId && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => cancelBatchMutation.mutate(activeBatchId)}
                      disabled={cancelBatchMutation.isPending}
                    >
                      {cancelBatchMutation.isPending
                        ? 'Cancelling...'
                        : 'Cancel'}
                    </Button>
                  )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-soft">
                  {(batchStatus as any)?.processed_files} of{' '}
                  {(batchStatus as any)?.total_files} files processed
                </span>
                <span className="text-pacific-400 font-medium">
                  {(batchStatus as any)?.progress_percent.toFixed(1)}%
                </span>
              </div>

              <div className="w-full bg-deep-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-pacific-500 to-pacific-400 h-2.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${(batchStatus as any)?.progress_percent}%`,
                  }}
                />
              </div>

              <div className="flex gap-4 text-xs text-surface-soft">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  {(batchStatus as any)?.successful_files} succeeded
                </span>
                {(batchStatus as any)?.failed_files > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    {(batchStatus as any)?.failed_files} failed
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Completed Batch with Failed Files - Show Retry Option */}
        {batchStatus &&
          (batchStatus as any)?.is_complete &&
          (batchStatus as any)?.failed_files > 0 && (
            <div className="mb-6 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-900/40 to-deep-900/40 backdrop-blur p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Batch Completed with Errors
                  </h3>
                  <p className="text-sm text-surface-soft">
                    {(batchStatus as any)?.successful_files} files succeeded,{' '}
                    {(batchStatus as any)?.failed_files} files failed
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    activeBatchId && retryFailedMutation.mutate(activeBatchId)
                  }
                  disabled={retryFailedMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {retryFailedMutation.isPending
                    ? 'Starting Retry...'
                    : 'Retry Failed Files'}
                </Button>
              </div>
              {(batchStatus as any)?.failure_summary &&
                (batchStatus as any)?.failure_summary.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-sm text-surface-soft cursor-pointer hover:text-white">
                      View failure details
                    </summary>
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {(batchStatus as any)?.failure_summary.map(
                        (failure: any, idx: number) => (
                          <div
                            key={idx}
                            className="text-xs text-red-400 bg-red-950/30 p-2 rounded"
                          >
                            <span className="font-medium">
                              {failure.filename}:
                            </span>{' '}
                            {failure.error}
                          </div>
                        )
                      )}
                    </div>
                  </details>
                )}
            </div>
          )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {(queueMessage || queuedUploads.length > 0) && (
            <div className="rounded-2xl border border-pacific-500/30 bg-pacific-900/20 backdrop-blur p-4 text-sm text-pacific-100">
              {queueMessage && <p>{queueMessage}</p>}
              {queuedUploads.length > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <p>
                    {queuedUploads.length} upload(s) waiting for connectivity.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleSyncQueuedUploads}
                  >
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
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur p-6">
            <label className="block text-sm font-medium text-surface-soft mb-2">
              Image File{selectedFiles.length > 0 ? 's' : ''} *
            </label>

            {!selectedFile && selectedFiles.length === 0 ? (
              <div
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                  dragActive
                    ? 'border-pacific-400 bg-pacific-500/10'
                    : 'border-white/20 bg-deep-900/20'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-surface-soft" />
                <div className="mt-4">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="mt-2 block text-sm font-medium text-white">
                      Drop files here or click to select an image
                    </span>
                    <input
                      id="file-upload"
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      multiple
                      ref={fileInputRef}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const files = e.target.files;
                        if (files && files.length > 1) {
                          handleMultipleFiles(Array.from(files));
                        } else if (files && files[0]) {
                          handleFileSelect(files[0]);
                        }
                      }}
                    />
                  </label>
                  <p className="mt-1 text-xs text-surface-soft/70">
                    {ALLOWED_EXTENSIONS.join(', ').toUpperCase()} up to{' '}
                    {Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB per file
                    {/* Batch limits: max {MAX_BATCH_FILES} files, {Math.round(MAX_BATCH_SIZE / 1024 / 1024)}MB total */}
                  </p>
                  <p className="mt-1 text-xs text-surface-soft/50">
                    For batch uploads: Maximum {MAX_BATCH_FILES} files,{' '}
                    {Math.round(MAX_BATCH_SIZE / 1024 / 1024)}MB total size
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
            ) : selectedFile ? (
              // File Selected - Show Preview
              <div className="border border-white/20 rounded-2xl p-4 bg-deep-900/20">
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
                          className="rounded-xl object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 bg-deep-900/40 rounded-xl flex items-center justify-center">
                        <FileImage className="w-8 h-8 text-surface-soft" />
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-surface-soft/70 mt-1">
                      {formatFileSize(selectedFile.size)}
                    </p>
                    <div className="mt-2">
                      <div className="text-xs text-palm-400 bg-palm-900/30 px-2 py-1 rounded inline-block">
                        ✓ Valid file
                      </div>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={removeSelectedFile}
                    className="flex-shrink-0 p-1 text-surface-soft hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Progress Bar */}
                {uploadMutation.isPending && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-surface-soft mb-1">
                      <span>Uploading...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-deep-900/40 rounded-full h-2">
                      <div
                        className="bg-pacific-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Batch Files Display */}
            {selectedFiles.length > 0 && (
              <div className="border border-white/20 rounded-2xl p-4 bg-deep-900/20">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-white">
                    {selectedFiles.length} file
                    {selectedFiles.length !== 1 ? 's' : ''} ready for batch
                    upload
                  </h4>
                  <button
                    type="button"
                    onClick={clearBatch}
                    className="text-xs text-surface-soft hover:text-white transition-colors"
                  >
                    Clear all
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedFiles.map((file, index: any) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2 rounded-lg bg-deep-900/40"
                    >
                      <FileImage className="w-5 h-5 text-surface-soft flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-surface-soft/70">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromBatch(index)}
                        className="flex-shrink-0 p-1 text-surface-soft hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {batchUploadMutation.isPending && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-surface-soft mb-1">
                      <span>Starting batch upload...</span>
                    </div>
                    <div className="w-full bg-deep-900/40 rounded-full h-2">
                      <div className="bg-pacific-500 h-2 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Validation Error Display */}
            {validationError && (
              <div className="mt-4 bg-coral-900/30 border border-coral-500/30 rounded-xl p-4">
                <p className="text-coral-300 text-sm">{validationError}</p>
              </div>
            )}

            {errors.file && (
              <p className="mt-1 text-sm text-coral-300">
                {errors.file.message}
              </p>
            )}
          </div>

          {/* Template Picker & Manager - Only for batch uploads */}
          {selectedFiles.length > 0 &&
            (templatesData as any)?.templates?.length > 0 && (
              <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-900/20 to-deep-900/40 backdrop-blur p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Batch Templates
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowTemplateManager(true)}
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Manage Templates
                  </button>
                </div>
                <div className="space-y-3">
                  <FormField label="Load Template" htmlFor="template-picker">
                    <select
                      id="template-picker"
                      className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-deep-900/40 text-white appearance-none backdrop-blur"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a1a1aa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.5rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                      }}
                      value={selectedTemplateId || ''}
                      onChange={(
                        e: React.ChangeEvent<
                          HTMLSelectElement | HTMLInputElement
                        >
                      ) => {
                        const templateId = e.target.value;
                        setSelectedTemplateId(templateId || null);
                        if (templateId) {
                          loadTemplateMutation.mutate(templateId);
                        }
                      }}
                    >
                      <option
                        value=""
                        style={{ backgroundColor: '#0c1222', color: '#ffffff' }}
                      >
                        Select a template...
                      </option>
                      {(templatesData as any).templates.map((template: any) => (
                        <option
                          key={template.id}
                          value={template.id}
                          style={{
                            backgroundColor: '#0c1222',
                            color: '#ffffff',
                          }}
                        >
                          {template.name}{' '}
                          {template.use_count > 0
                            ? `(used ${template.use_count}×)`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <button
                    type="button"
                    onClick={() => setShowTemplateManager(true)}
                    className="w-full px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Save Current Settings as Template
                  </button>
                </div>
              </div>
            )}

          {/* Required Fields */}
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur p-6">
            <h3 className="text-lg font-medium text-white mb-4">
              Required Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Hazard Type"
                htmlFor="upload-hazard-type"
                required
                error={errors.hazard_type?.message}
              >
                <select
                  id="upload-hazard-type"
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white appearance-none backdrop-blur"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a1a1aa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: 'right 0.5rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1.5em 1.5em',
                  }}
                  {...register('hazard_type', {
                    required: 'Hazard type is required',
                  })}
                  disabled={isLoading}
                >
                  <option
                    value=""
                    style={{ backgroundColor: '#0c1222', color: '#ffffff' }}
                  >
                    {isLoading
                      ? 'Loading hazard types...'
                      : 'Select hazard type'}
                  </option>
                  {(vocabData as any)?.hazard_types?.map(
                    (type: {
                      id: string;
                      label: string;
                      description: string;
                    }) => (
                      <option
                        key={type.id}
                        value={type.id}
                        style={{ backgroundColor: '#0c1222', color: '#ffffff' }}
                      >
                        {type.label}
                      </option>
                    )
                  )}
                </select>
              </FormField>

              <FormField
                label="Country"
                htmlFor="upload-country"
                required
                error={errors.country?.message}
                hint="Auto-detected from GPS if available"
              >
                <select
                  id="upload-country"
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white appearance-none backdrop-blur"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a1a1aa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: 'right 0.5rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1.5em 1.5em',
                  }}
                  {...register('country', {
                    required: 'Country is required for geographic analysis',
                  })}
                  disabled={isLoading}
                >
                  <option
                    value=""
                    style={{ backgroundColor: '#0c1222', color: '#ffffff' }}
                  >
                    {isLoading ? 'Loading countries...' : 'Select country'}
                  </option>
                  {(vocabData as any)?.countries?.map(
                    (country: { id: string; label: string }) => (
                      <option
                        key={country.id}
                        value={country.id}
                        style={{ backgroundColor: '#0c1222', color: '#ffffff' }}
                      >
                        {country.label}
                      </option>
                    )
                  )}
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
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50 backdrop-blur"
                  placeholder="e.g., Port Vila, Vanuatu"
                  {...registerSanitizedField('location', {
                    required: 'Location is required',
                  })}
                />
              </FormField>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur p-6">
            <h3 className="text-lg font-medium text-white mb-4">
              Additional Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Title"
                htmlFor="upload-title"
                hint="Optional - we'll fill this from the filename if you leave it blank"
              >
                <input
                  id="upload-title"
                  type="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50 backdrop-blur"
                  placeholder="Descriptive title for the image"
                  {...registerSanitizedField('title')}
                />
              </FormField>

              <div className="md:col-span-2">
                <FormField
                  label="Coordinates"
                  hint="Optional - helps locate incident on map"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="upload-latitude"
                        className="block text-xs text-surface-soft mb-1"
                      >
                        Latitude
                      </label>
                      <input
                        id="upload-latitude"
                        type="number"
                        step="any"
                        className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50 backdrop-blur"
                        placeholder="e.g., -17.7334"
                        {...register('latitude', { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="upload-longitude"
                        className="block text-xs text-surface-soft mb-1"
                      >
                        Longitude
                      </label>
                      <input
                        id="upload-longitude"
                        type="number"
                        step="any"
                        className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50 backdrop-blur"
                        placeholder="e.g., 168.3273"
                        {...register('longitude', { valueAsNumber: true })}
                      />
                    </div>
                  </div>

                  {/* Altitude field (optional) */}
                  <div className="mt-3">
                    <label
                      htmlFor="upload-altitude"
                      className="block text-xs text-surface-soft mb-1"
                    >
                      Altitude (meters){' '}
                      <span className="text-surface-soft/50">• Optional</span>
                    </label>
                    <input
                      id="upload-altitude"
                      type="number"
                      step="0.1"
                      className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50 backdrop-blur"
                      placeholder="e.g., 15.5 (positive=above sea level, negative=below)"
                      {...register('altitude', { valueAsNumber: true })}
                    />
                  </div>

                  {/* Display extracted EXIF metadata */}
                  {exifMetadata &&
                    (exifMetadata.camera ||
                      exifMetadata.orientation ||
                      exifMetadata.altitude) && (
                      <div className="mt-3 p-3 bg-pacific-900/20 border border-pacific-500/30 rounded-lg">
                        <p className="text-xs font-medium text-pacific-300 mb-2">
                          📷 Camera Metadata
                        </p>
                        <div className="space-y-1">
                          {exifMetadata.camera && (
                            <p className="text-xs text-surface-soft">
                              <span className="text-white">Camera:</span>{' '}
                              {exifMetadata.camera}
                            </p>
                          )}
                          {exifMetadata.orientation && (
                            <p className="text-xs text-surface-soft">
                              <span className="text-white">Orientation:</span>{' '}
                              {exifMetadata.orientation}
                            </p>
                          )}
                          {exifMetadata.altitude && (
                            <p className="text-xs text-surface-soft">
                              <span className="text-white">Altitude:</span>{' '}
                              {exifMetadata.altitude.toFixed(1)}m
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Chrome Location Permission Hint */}
                  {isChrome && (
                    <div className="mt-2 p-2 bg-pacific-900/20 border border-pacific-500/30 rounded-lg">
                      <p className="text-xs text-pacific-300">
                        💡 <strong>Chrome users:</strong> If &quot;Use My
                        Location&quot; doesn&apos;t work, click the lock icon in
                        your address bar → Site settings → Allow Location
                      </p>
                    </div>
                  )}

                  {/* Quick Action Buttons */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        // Detect Chrome browser
                        const isChrome =
                          typeof window !== 'undefined' &&
                          /Chrome/.test(navigator.userAgent) &&
                          /Google Inc/.test(navigator.vendor);

                        const isSecureContext =
                          typeof window !== 'undefined' &&
                          (window.isSecureContext ||
                            ['localhost', '127.0.0.1', '::1'].includes(
                              window.location.hostname
                            ));

                        if (!isSecureContext) {
                          toast.error('Secure connection required', {
                            description:
                              'Location access only works over HTTPS or localhost. Please switch to a secure connection or pick a location on the map.',
                          });
                          return;
                        }

                        if (!navigator.geolocation) {
                          toast.error('Geolocation not supported', {
                            description:
                              'Your browser does not support location services.',
                          });
                          return;
                        }

                        // Check permissions API (Chrome-specific)
                        if (isChrome && 'permissions' in navigator) {
                          try {
                            const permissionStatus =
                              await navigator.permissions.query({
                                name: 'geolocation' as PermissionName,
                              });

                            if (permissionStatus.state === 'denied') {
                              toast.error('Location permission blocked', {
                                description:
                                  'Chrome has blocked location access. Click the lock icon in the address bar, go to Site Settings, and allow Location. Or use "Select on Map" instead.',
                              });
                              return;
                            }

                            // Permission state checked
                          } catch (e) {
                            // Could not check permissions API
                          }
                        }

                        toast.loading('Getting your location...');
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setValue('latitude', position.coords.latitude);
                            setValue('longitude', position.coords.longitude);
                            toast.dismiss();
                            toast.success('Location detected', {
                              description: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`,
                            });
                          },
                          (error) => {
                            const errorCode = error?.code;
                            const errorMessage = error?.message;
                            toast.dismiss();

                            // Provide specific error messages based on error code
                            const PERMISSION_DENIED = 1;
                            const POSITION_UNAVAILABLE = 2;
                            const TIMEOUT = 3;
                            const BLOCKED_ERROR_NAMES = [
                              'SecurityError',
                              'NotAllowedError',
                              'PermissionDeniedError',
                            ];

                            let userMessage = 'Could not get your location';
                            let userDescription = '';

                            // Detect Chrome browser
                            const isChrome =
                              typeof window !== 'undefined' &&
                              /Chrome/.test(navigator.userAgent) &&
                              /Google Inc/.test(navigator.vendor);

                            // Handle case where error object is null, undefined, or empty
                            const hasValidError =
                              error &&
                              (errorCode !== undefined || errorMessage);

                            if (!hasValidError) {
                              // Empty or invalid error object - common in Chrome with blocked permissions
                              if (isChrome) {
                                userDescription =
                                  'Chrome blocked location access. To fix: Click the lock icon in the address bar → Site settings → Allow Location. Or use "Select on Map" instead.';
                              } else {
                                userDescription =
                                  'Unable to access location. This may be due to browser settings, extensions, or security policies. Please use the "Select on Map" option instead.';
                              }
                            } else if (errorCode !== undefined) {
                              // Standard GeolocationPositionError with code
                              switch (errorCode) {
                                case PERMISSION_DENIED:
                                  userDescription =
                                    'Location permission denied. Please enable location access in your browser settings.';
                                  break;
                                case POSITION_UNAVAILABLE:
                                  userDescription =
                                    'Location information unavailable. Please try selecting location on map instead.';
                                  break;
                                case TIMEOUT:
                                  userDescription =
                                    'Location request timed out after 30 seconds. This can happen indoors or in areas with poor GPS signal. Try moving closer to a window or use "Select on Map" instead.';
                                  break;
                                default:
                                  userDescription =
                                    errorMessage ||
                                    'Please check your browser permissions or select location on map.';
                              }
                            } else {
                              // Other error type (e.g., network issues)
                              userDescription =
                                errorMessage ||
                                'Please check your browser permissions or select location on map.';
                            }

                            toast.error(userMessage, {
                              description: userDescription,
                            });
                          },
                          {
                            enableHighAccuracy: true,
                            timeout: 30000, // 30 seconds - GPS can be slow indoors
                            maximumAge: 0,
                          }
                        );
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm bg-pacific-600/20 hover:bg-pacific-600/30 text-pacific-300 rounded-lg transition-colors border border-pacific-500/30"
                    >
                      <MapPin className="w-4 h-4" />
                      Use My Location
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      className="flex items-center gap-2 px-3 py-2 text-sm bg-palm-600/20 hover:bg-palm-600/30 text-palm-300 rounded-lg transition-colors border border-palm-500/30"
                    >
                      <MapPin className="w-4 h-4" />
                      Select on Map
                    </button>
                  </div>
                </FormField>
              </div>

              <FormField
                label="Abstract"
                htmlFor="upload-abstract"
                className="md:col-span-2"
              >
                <textarea
                  id="upload-abstract"
                  rows={3}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50 backdrop-blur"
                  placeholder="Brief description of the image content"
                  {...registerSanitizedField('abstract')}
                />
              </FormField>

              <FormField
                label="Keywords"
                htmlFor="upload-keywords"
                hint="Comma-separated terms"
                className="md:col-span-2"
              >
                <input
                  id="upload-keywords"
                  type="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50 backdrop-blur"
                  placeholder="Comma-separated keywords (e.g., flooding, damage, infrastructure)"
                  {...registerSanitizedField('keywords')}
                />
                <p className="mt-1 text-xs text-surface-soft/70">
                  Add descriptive keywords separated by commas to help others
                  find your image.
                </p>
              </FormField>
            </div>
          </div>

          {/* Map Picker Modal */}
          {showMapPicker && (
            <MapPicker
              initialPosition={
                latitude && longitude ? [latitude, longitude] : undefined
              }
              onConfirm={(data) => {
                // Set coordinates
                setValue('latitude', data.lat);
                setValue('longitude', data.lng);

                // Auto-fill location if empty
                if (!location) {
                  setSanitizedFieldValue('location', data.placeName, {
                    shouldDirty: true,
                  });
                }

                // Auto-fill country if available and empty
                if (data.countryCode && !country) {
                  setValue('country', data.countryCode);
                }

                setShowMapPicker(false);

                // Show success notification
                toast.success('Location selected', {
                  description: `${data.placeName} (${data.lat.toFixed(6)}, ${data.lng.toFixed(6)})`,
                });
              }}
              onCancel={() => setShowMapPicker(false)}
            />
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              leftIcon={
                !(uploadMutation.isPending || batchUploadMutation.isPending) ? (
                  <Upload className="w-4 h-4" />
                ) : undefined
              }
              isLoading={
                uploadMutation.isPending || batchUploadMutation.isPending
              }
            >
              {batchUploadMutation.isPending
                ? 'Starting batch...'
                : uploadMutation.isPending
                  ? 'Uploading...'
                  : batchMode && selectedFiles.length > 0
                    ? `Upload ${selectedFiles.length} Images`
                    : 'Upload Image'}
            </Button>
          </div>

          {/* Upload Progress */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="bg-pacific-900/30 border border-pacific-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-pacific-200">
                  Uploading...
                </span>
                <span className="text-sm text-pacific-300">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full bg-deep-900/40 rounded-full h-2">
                <div
                  className="bg-pacific-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {uploadProgress === 100 && (
            <div className="bg-palm-900/30 border border-palm-500/30 rounded-xl p-4">
              <p className="text-palm-300 text-sm">
                ✅ Upload completed successfully! Redirecting...
              </p>
            </div>
          )}

          {uploadMutation.isError && (
            <div className="bg-coral-900/30 border border-coral-500/30 rounded-xl p-4">
              <p className="text-coral-300">
                Error uploading image:{' '}
                {(uploadMutation as any).error?.message || 'Unknown error'}
              </p>
            </div>
          )}
        </form>

        {/* Analytics Display */}
        {analyticsData && (analyticsData as any).total_batches > 0 && (
          <div className="mt-8 rounded-3xl border border-pacific-500/30 bg-gradient-to-br from-pacific-900/40 to-deep-900/40 backdrop-blur p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Batch Upload Analytics (Last 30 Days)
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-deep-900/40 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">
                  {(analyticsData as any).total_batches}
                </div>
                <div className="text-xs text-surface-soft mt-1">
                  Total Batches
                </div>
              </div>
              <div className="bg-deep-900/40 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">
                  {(analyticsData as any).success_rate.toFixed(1)}%
                </div>
                <div className="text-xs text-surface-soft mt-1">
                  Success Rate
                </div>
              </div>
              <div className="bg-deep-900/40 rounded-lg p-4">
                <div className="text-2xl font-bold text-pacific-400">
                  {(analyticsData as any).total_files_processed}
                </div>
                <div className="text-xs text-surface-soft mt-1">
                  Files Processed
                </div>
              </div>
              <div className="bg-deep-900/40 rounded-lg p-4">
                <div className="text-2xl font-bold text-amber-400">
                  {(
                    analyticsData as any
                  ).average_processing_time_seconds.toFixed(0)}
                  s
                </div>
                <div className="text-xs text-surface-soft mt-1">
                  Avg Processing Time
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-surface-soft">
                  Completed: {(analyticsData as any).completed_batches}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                <span className="text-surface-soft">
                  Partial: {(analyticsData as any).partial_batches}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                <span className="text-surface-soft">
                  Failed: {(analyticsData as any).failed_batches}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Template Manager Dialog */}
      {showTemplateManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-deep-900 to-pacific-900/50 border border-white/20 rounded-3xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Batch Templates</h2>
              <button
                onClick={() => setShowTemplateManager(false)}
                className="p-2 text-surface-soft hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Save New Template */}
            <div className="bg-deep-900/40 rounded-2xl p-4 mb-6">
              <h3 className="text-sm font-medium text-white mb-3">
                Save Current Settings
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Template name (e.g., Hurricane Reports)"
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50"
                  id="new-template-name"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-pacific-500 bg-deep-900/40 text-white placeholder-surface-soft/50"
                  id="new-template-description"
                />
                <button
                  onClick={() => {
                    const name = (
                      document.getElementById(
                        'new-template-name'
                      ) as HTMLInputElement
                    )?.value;
                    const description = (
                      document.getElementById(
                        'new-template-description'
                      ) as HTMLInputElement
                    )?.value;
                    if (!name) {
                      toast.error('Please enter a template name');
                      return;
                    }
                    const formData = getValues();
                    saveTemplateMutation.mutate({
                      name,
                      description: description || '',
                      template_data: {
                        hazard_type: formData.hazard_type,
                        source_type: (formData as any).source_type,
                        event_id: (formData as any).eventId,
                        title_template: (formData as any).titleTemplate,
                        abstract: formData.abstract,
                        location: formData.location,
                        country: formData.country,
                        keywords: formData.keywords,
                      },
                    });
                    setShowTemplateManager(false);
                  }}
                  disabled={saveTemplateMutation.isPending}
                  className="w-full px-4 py-2 bg-pacific-600 hover:bg-pacific-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {saveTemplateMutation.isPending
                    ? 'Saving...'
                    : 'Save Template'}
                </button>
              </div>
            </div>

            {/* Existing Templates */}
            <div>
              <h3 className="text-sm font-medium text-white mb-3">
                Saved Templates
              </h3>
              {(templatesData as any)?.templates?.length === 0 ? (
                <p className="text-sm text-surface-soft text-center py-8">
                  No templates saved yet. Create your first template above!
                </p>
              ) : (
                <div className="space-y-3">
                  {(templatesData as any)?.templates?.map((template: any) => (
                    <div
                      key={template.id}
                      className="bg-deep-900/40 rounded-lg p-4 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1">
                        <h4 className="text-white font-medium">
                          {template.name}
                        </h4>
                        {template.description && (
                          <p className="text-sm text-surface-soft/70 mt-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-surface-soft">
                          <span>Used {template.use_count}×</span>
                          {template.last_used_at && (
                            <span>
                              Last used:{' '}
                              {new Date(
                                template.last_used_at
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            loadTemplateMutation.mutate(template.id);
                            setShowTemplateManager(false);
                          }}
                          className="px-3 py-1.5 text-xs bg-pacific-600/20 hover:bg-pacific-600/30 text-pacific-400 rounded transition-colors"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(`Delete template "${template.name}"?`)
                            ) {
                              deleteTemplateMutation.mutate(template.id);
                            }
                          }}
                          disabled={deleteTemplateMutation.isPending}
                          className="p-1.5 text-coral-400 hover:bg-coral-900/20 rounded transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
