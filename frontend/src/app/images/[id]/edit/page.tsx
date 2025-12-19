'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, RegisterOptions } from 'react-hook-form';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  FileText,
  MapPin,
  Calendar,
  Tag,
  Globe,
  AlertCircle,
  History,
  Sparkles,
  X,
  Check,
  Clock,
} from 'lucide-react';
import { imageApi } from '@/lib/api';
import { FormField, Button, Tag as TagComponent } from '@/components/design-system';
import { toast } from 'sonner';
import dompurify from 'dompurify';

const DOMPurify = typeof window !== 'undefined' ? dompurify(window) : null;

// Dynamic import for MapPicker (Leaflet requires window)
const MapPicker = dynamic(() => import('@/components/MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] bg-deep-800/50 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pacific-400 mx-auto mb-2" />
        <p className="text-sm text-surface-soft/70">Loading map…</p>
      </div>
    </div>
  ),
});

// Loading component
const WaveLoader = () => (
  <div className="rounded-3xl bg-deep-900/40 p-6 backdrop-blur">
    <div className="wave-loader" aria-hidden="true" />
    <p className="mt-4 text-center text-sm text-surface-soft/70">
      Loading metadata…
    </p>
  </div>
);

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

interface EditFormData {
  title: string;
  description: string;
  hazard_type: string;
  country: string;
  location: string;
  keywords: string;
  latitude: number;
  longitude: number;
}

interface VersionHistory {
  id: number;
  field: string;
  old_value: string;
  new_value: string;
  changed_at: string;
  changed_by: string;
  action: string;
}

interface KeywordSuggestion {
  keyword: string;
  relevance: number;
  source: 'hazard' | 'location' | 'ai';
}

export default function EditImagePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const imageId = params.id as string;

  // Auth guard - redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const returnUrl = encodeURIComponent(pathname);
      router.push(`/auth/login?returnUrl=${returnUrl}`);
    }
  }, [isAuthenticated, authLoading, router, pathname]);

  const [showMap, setShowMap] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch vocabularies for dropdowns
  const { data: vocabData } = useQuery({
    queryKey: ['vocabularies'],
    queryFn: () => imageApi.vocabularies(),
  });

  // Fetch image data
  const { data: image, isLoading, error } = useQuery({
    queryKey: ['image', imageId],
    queryFn: () => imageApi.getById(imageId),
  });

  // Fetch version history
  const { data: versionHistory } = useQuery<VersionHistory[]>({
    queryKey: ['image-history', imageId],
    queryFn: async () => {
      try {
        const historyResponse = await imageApi.history(imageId);
        return historyResponse.history || [];
      } catch (error) {
        // History endpoint not yet implemented, return empty array
        return [];
      }
    },
    enabled: showHistory,
    meta: {
      errorMessage: 'Version history not available',
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<EditFormData>();
  const sanitizeInputValue = useCallback(
    (value: string | null | undefined) =>
      DOMPurify.sanitize(value ?? '', INPUT_SANITIZE_CONFIG),
    []
  );

  const registerSanitizedField = useCallback(
    <TFieldName extends keyof EditFormData>(
      name: TFieldName,
      options?: RegisterOptions<EditFormData, TFieldName>
    ) =>
      register(name, {
        ...options,
        onChange: (event) => {
          const inputValue = (event.target.value ?? '') as string;
          const sanitizedValue = sanitizeInputValue(inputValue);
          if (sanitizedValue !== inputValue) {
            event.target.value = sanitizedValue;
          }
          setValue(name, sanitizedValue as EditFormData[TFieldName], {
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
    <TFieldName extends keyof EditFormData>(
      name: TFieldName,
      value: string | null | undefined,
      options?: SanitizeSetValueOptions
    ) => {
      setValue(name, sanitizeInputValue(value) as EditFormData[TFieldName], options);
    },
    [sanitizeInputValue, setValue]
  );

  const watchedValues = watch();

  // Populate form with existing data
  useEffect(() => {
    if (image) {
      setSanitizedFieldValue('title', image.title || '');
      setSanitizedFieldValue('description', image.abstract || '');
      setValue('hazard_type', image.hazard_type || '');
      setValue('country', image.contact?.organisation_name || '');
      setSanitizedFieldValue('location', image.purpose || '');
      setSanitizedFieldValue(
        'keywords',
        Array.isArray(image.keywords) ? image.keywords.join(', ') : ''
      );
      setValue('latitude', image.latitude || 0);
      setValue('longitude', image.longitude || 0);

      if (image.keywords && Array.isArray(image.keywords)) {
        setSelectedKeywords(
          image.keywords
            .filter((keyword): keyword is string => Boolean(keyword))
            .map((keyword) => sanitizeInputValue(keyword))
        );
      }
    }
  }, [image, sanitizeInputValue, setSanitizedFieldValue, setValue]);

  // Track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(isDirty);
  }, [isDirty]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Generate keyword suggestions
  const keywordSuggestions = useMemo((): KeywordSuggestion[] => {
    const suggestions: KeywordSuggestion[] = [];

    // Hazard-based keywords
    const hazardKeywords: Record<string, string[]> = {
      cyclone: ['wind damage', 'storm surge', 'flooding', 'coastal erosion', 'debris'],
      flood: ['water damage', 'inundation', 'infrastructure', 'displacement', 'sanitation'],
      tsunami: ['coastal damage', 'wave impact', 'evacuation', 'warning system', 'reconstruction'],
      earthquake: ['structural damage', 'collapse', 'aftershock', 'rubble', 'rescue operations'],
      drought: ['water scarcity', 'crop failure', 'desertification', 'livestock', 'food security'],
      wildfire: ['fire damage', 'smoke', 'vegetation loss', 'evacuation', 'air quality'],
      landslide: ['slope failure', 'debris flow', 'road blockage', 'erosion', 'displacement'],
      volcano: ['ash fall', 'lava flow', 'pyroclastic', 'evacuation', 'air quality'],
    };

    if (watchedValues.hazard_type && hazardKeywords[watchedValues.hazard_type.toLowerCase()]) {
      hazardKeywords[watchedValues.hazard_type.toLowerCase()].forEach((keyword) => {
        if (!selectedKeywords.includes(keyword)) {
          suggestions.push({ keyword, relevance: 0.9, source: 'hazard' });
        }
      });
    }

    // Location-based keywords
    if (watchedValues.location) {
      const locationKeywords = ['coastal', 'urban', 'rural', 'infrastructure', 'community'];
      locationKeywords.forEach((keyword) => {
        if (!selectedKeywords.includes(keyword)) {
          suggestions.push({ keyword, relevance: 0.7, source: 'location' });
        }
      });
    }

    // Common disaster keywords
    const commonKeywords = [
      'damage assessment',
      'humanitarian',
      'emergency response',
      'recovery',
      'resilience',
      'climate change',
    ];
    commonKeywords.forEach((keyword) => {
      if (!selectedKeywords.includes(keyword)) {
        suggestions.push({ keyword, relevance: 0.6, source: 'ai' });
      }
    });

    return suggestions.sort((a, b) => b.relevance - a.relevance).slice(0, 8);
  }, [watchedValues.hazard_type, watchedValues.location, selectedKeywords]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: EditFormData & { is_draft?: boolean }) => {
      return imageApi.updateImage(imageId, {
        ...data,
        keywords: selectedKeywords.join(', '),
        is_draft: data.is_draft,
      });
    },
    onSuccess: (_, variables) => {
      const wasDraft = variables.is_draft;
      toast.success(wasDraft ? 'Draft saved successfully' : 'Image updated successfully');
      setHasUnsavedChanges(false);
      if (!wasDraft) {
        router.push(`/images/${imageId}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  const handleSaveDraft = () => {
    handleSubmit((data) => {
      updateMutation.mutate({ ...data, is_draft: true });
    })();
  };

  const handlePublish = () => {
    handleSubmit((data) => {
      updateMutation.mutate({ ...data, is_draft: false });
    })();
  };

  const handleCoordinatesChange = (lat: number, lng: number, locationName?: string) => {
    setValue('latitude', lat, { shouldDirty: true });
    setValue('longitude', lng, { shouldDirty: true });
    if (locationName) {
      setSanitizedFieldValue('location', locationName, { shouldDirty: true });
    }
    setShowMap(false);
  };

  const addKeyword = (keyword: string) => {
    const sanitizedKeyword = sanitizeInputValue(keyword).trim();
    if (!sanitizedKeyword) {
      return;
    }
    if (!selectedKeywords.includes(sanitizedKeyword)) {
      setSelectedKeywords([...selectedKeywords, sanitizedKeyword]);
      setHasUnsavedChanges(true);
    }
  };

  const removeKeyword = (keyword: string) => {
    setSelectedKeywords(selectedKeywords.filter((k) => k !== keyword));
    setHasUnsavedChanges(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 flex items-center justify-center">
        <WaveLoader />
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-coral-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white mb-2">Image Not Found</h1>
          <p className="text-white/70 mb-6">The image you're trying to edit doesn't exist.</p>
          <Link href="/search" className="text-pacific-400 hover:text-pacific-300">
            Back to Search
          </Link>
        </div>
      </div>
    );
  }

  // Construct URLs - use thumbnail for preview, full image for download
  const thumbnailUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/images/${encodeURIComponent(image.filename)}/thumbnail`;
  const imageUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/images/${encodeURIComponent(image.filename)}`;

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-deep-900 via-deep-800 to-deep-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pacific-400 mx-auto mb-2" />
          <p className="text-sm text-surface-soft/70">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render edit form if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 pb-24 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (hasUnsavedChanges) {
                  if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
                    router.push(`/images/${imageId}`);
                  }
                } else {
                  router.push(`/images/${imageId}`);
                }
              }}
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Image
            </button>
            {hasUnsavedChanges && (
              <TagComponent className="bg-coral-500/20 text-coral-300 border-coral-500/30">
                <AlertCircle className="h-3 w-3" />
                Unsaved Changes
              </TagComponent>
            )}
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
          >
            <History className="h-4 w-4" />
            Version History
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Image Preview */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/60 to-deep-900/40 p-6 backdrop-blur"
            >
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-pacific-400" />
                Image Preview
              </h2>
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-deep-900 to-deep-950">
                <Image
                  src={thumbnailUrl}
                  alt={image.title || image.filename}
                  fill
                  className="object-contain bg-deep-900"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                  unoptimized
                  onError={(e) => {
                    // Fallback to full image if thumbnail fails
                    const target = e.target as HTMLImageElement;
                    target.src = imageUrl;
                  }}
                />
              </div>
              <div className="mt-4 space-y-2 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Uploaded: {new Date(image.upload_date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Filename: {image.filename}
                </div>
                {image.latitude && image.longitude && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Coordinates: {image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Version History Panel */}
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/60 to-deep-900/40 p-6 backdrop-blur"
              >
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <History className="h-5 w-5 text-pacific-400" />
                  Edit History
                </h3>
                {versionHistory && versionHistory.length > 0 ? (
                  <div className="space-y-3">
                    {versionHistory.map((version) => (
                      <div
                        key={version.id}
                        className="border-l-2 border-pacific-500 pl-4 py-2 text-sm"
                      >
                        <div className="font-medium text-white">
                          {version.field || 'field change'}{' '}
                          <span className="text-xs uppercase tracking-wide text-white/50">
                            {version.action}
                          </span>
                        </div>
                        <div className="text-white/50 line-through">{version.old_value}</div>
                        <div className="text-white/70">{version.new_value}</div>
                        <div className="text-xs text-white/50 mt-1 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {new Date(version.changed_at).toLocaleString()} by {version.changed_by || 'system'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/50 text-sm">No edit history available</p>
                )}
              </motion.div>
            )}
          </div>

          {/* Right: Edit Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <form className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/60 to-deep-900/40 p-6 backdrop-blur">
                <h2 className="text-xl font-semibold text-white mb-6">Edit Metadata</h2>

                {/* Title */}
                <FormField
                  label="Title"
                  htmlFor="edit-title"
                  error={errors.title?.message}
                  required
                >
                  <input
                    {...registerSanitizedField('title', { required: 'Title is required' })}
                    id="edit-title"
                    type="text"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition"
                    placeholder="Descriptive title for this image"
                  />
                </FormField>

                {/* Description */}
                <FormField
                  label="Description"
                  htmlFor="edit-description"
                  hint="Detailed description of what this image shows"
                >
                  <textarea
                    {...registerSanitizedField('description')}
                    id="edit-description"
                    rows={4}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition resize-none"
                    placeholder="Describe the damage, location details, and context..."
                  />
                </FormField>

                {/* Hazard Type */}
                <FormField
                  label="Hazard Type"
                  htmlFor="edit-hazard-type"
                  error={errors.hazard_type?.message}
                  required
                >
                  <select
                    {...register('hazard_type', { required: 'Hazard type is required' })}
                    id="edit-hazard-type"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a1a1aa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 0.5rem center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '1.5em 1.5em'
                    }}
                  >
                    <option value="" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Select hazard type</option>
                    <option value="cyclone" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Cyclone</option>
                    <option value="flood" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Flood</option>
                    <option value="tsunami" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Tsunami</option>
                    <option value="earthquake" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Earthquake</option>
                    <option value="drought" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Drought</option>
                    <option value="wildfire" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Wildfire</option>
                    <option value="landslide" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Landslide</option>
                    <option value="volcano" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Volcanic Eruption</option>
                    <option value="storm" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Storm</option>
                    <option value="other" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Other</option>
                  </select>
                </FormField>

                {/* Location */}
                <FormField label="Location" htmlFor="edit-location">
                  <div className="space-y-2">
                    <input
                      {...registerSanitizedField('location')}
                      id="edit-location"
                      type="text"
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition"
                      placeholder="e.g., Nadi, Fiji"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMap(!showMap)}
                      className="inline-flex items-center gap-2 text-sm text-pacific-400 hover:text-pacific-300 transition"
                    >
                      <MapPin className="h-4 w-4" />
                      {showMap ? 'Hide Map' : 'Adjust Coordinates on Map'}
                    </button>
                  </div>
                </FormField>

                {/* Map Picker */}
                {showMap && (
                  <MapPicker
                    initialPosition={
                      watchedValues.latitude && watchedValues.longitude
                        ? [watchedValues.latitude, watchedValues.longitude]
                        : image.latitude && image.longitude
                        ? [image.latitude, image.longitude]
                        : undefined
                    }
                    onConfirm={(data) => {
                      handleCoordinatesChange(data.lat, data.lng, data.placeName);
                      if (data.countryCode) {
                        setValue('country', data.countryCode.toUpperCase(), { shouldDirty: true });
                      }
                    }}
                    onCancel={() => setShowMap(false)}
                  />
                )}

                {/* Country */}
                <FormField label="Country" htmlFor="edit-country">
                  <select
                    {...register('country')}
                    id="edit-country"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a1a1aa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 0.5rem center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '1.5em 1.5em'
                    }}
                  >
                    <option value="" style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>Select country</option>
                    {vocabData?.countries?.map((country: { id: string; label: string }) => (
                      <option key={country.id} value={country.id} style={{ backgroundColor: '#0c1222', color: '#ffffff' }}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                {/* Keywords */}
                <FormField
                  label="Keywords"
                  htmlFor="edit-keywords"
                  hint="Tags to improve searchability"
                >
                  <div className="space-y-3">
                    {/* Selected Keywords */}
                    {selectedKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedKeywords.map((keyword) => (
                          <button
                            key={keyword}
                            type="button"
                            onClick={() => removeKeyword(keyword)}
                            className="inline-flex items-center gap-1 rounded-full bg-pacific-500/20 px-3 py-1 text-sm text-pacific-300 border border-pacific-500/30 hover:bg-pacific-500/30 transition"
                          >
                            {keyword}
                            <X className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Keyword Suggestions */}
                    {keywordSuggestions.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-palm-400" />
                          <span className="text-sm text-white/70">Suggested Keywords</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {keywordSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.keyword}
                              type="button"
                              onClick={() => addKeyword(suggestion.keyword)}
                              className="inline-flex items-center gap-1 rounded-full bg-palm-500/10 px-3 py-1 text-sm text-palm-300 border border-palm-500/20 hover:bg-palm-500/20 transition"
                            >
                              <Tag className="h-3 w-3" />
                              {suggestion.keyword}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Manual Keyword Input */}
                    <input
                      type="text"
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition"
                      placeholder="Type and press Enter to add custom keywords"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            addKeyword(input.value.trim());
                            input.value = '';
                          }
                        }
                      }}
                    />
                  </div>
                </FormField>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!hasUnsavedChanges || updateMutation.isPending}
                  variant="secondary"
                  className="flex-1"
                >
                  <Save className="h-5 w-5" />
                  Save Draft
                </Button>
                <Button
                  type="button"
                  onClick={handlePublish}
                  disabled={!hasUnsavedChanges || updateMutation.isPending}
                  className="flex-1 bg-palm-600 hover:bg-palm-500"
                >
                  <Check className="h-5 w-5" />
                  Publish Changes
                </Button>
              </div>

              {updateMutation.isPending && (
                <div className="text-center text-sm text-white/70">
                  <WaveLoader />
                  <p className="mt-2">Saving changes...</p>
                </div>
              )}
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
