'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Image from 'next/image';
import Link from 'next/link';
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
import { FormField, Button, Tag as TagComponent, WaveLoader } from '@/components/design-system';
import MapPicker from '@/components/MapPicker';
import { toast } from 'sonner';

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
  const imageId = params.id as string;

  const [showMap, setShowMap] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch image data
  const { data: image, isLoading, error } = useQuery({
    queryKey: ['image', imageId],
    queryFn: () => imageApi.getById(imageId),
  });

  // Fetch version history
  const { data: versionHistory } = useQuery<VersionHistory[]>({
    queryKey: ['image-history', imageId],
    queryFn: async () => {
      const historyResponse = await imageApi.history(imageId);
      return historyResponse.history || [];
    },
    enabled: showHistory,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<EditFormData>();

  const watchedValues = watch();

  // Populate form with existing data
  useEffect(() => {
    if (image) {
      setValue('title', image.title || '');
      setValue('description', image.description || '');
      setValue('hazard_type', image.hazard_type || '');
      setValue('country', image.country || '');
      setValue('location', image.location || '');
      setValue('keywords', Array.isArray(image.keywords) ? image.keywords.join(', ') : image.keywords || '');
      setValue('latitude', image.latitude || 0);
      setValue('longitude', image.longitude || 0);

      if (image.keywords) {
        const keywordsArray = Array.isArray(image.keywords)
          ? image.keywords
          : image.keywords.split(',').map((k: string) => k.trim());
        setSelectedKeywords(keywordsArray.filter(Boolean));
      }
    }
  }, [image, setValue]);

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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/images/${imageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          keywords: selectedKeywords.join(', '),
          is_draft: isDraft,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update image');
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success(isDraft ? 'Draft saved successfully' : 'Image updated successfully');
      setHasUnsavedChanges(false);
      if (!isDraft) {
        router.push(`/images/${imageId}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  const onSubmit = (data: EditFormData) => {
    updateMutation.mutate(data);
  };

  const handleSaveDraft = () => {
    setIsDraft(true);
    handleSubmit(onSubmit)();
  };

  const handlePublish = () => {
    setIsDraft(false);
    handleSubmit(onSubmit)();
  };

  const handleCoordinatesChange = (lat: number, lng: number, locationName?: string) => {
    setValue('latitude', lat, { shouldDirty: true });
    setValue('longitude', lng, { shouldDirty: true });
    if (locationName) {
      setValue('location', locationName, { shouldDirty: true });
    }
    setShowMap(false);
  };

  const addKeyword = (keyword: string) => {
    if (!selectedKeywords.includes(keyword)) {
      setSelectedKeywords([...selectedKeywords, keyword]);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 pb-24 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href={`/images/${imageId}`}
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Image
            </Link>
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
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-deep-900">
                <Image
                  src={image.thumbnail_url || image.url}
                  alt={image.title || image.filename}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
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
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                    {...register('title', { required: 'Title is required' })}
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
                    {...register('description')}
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
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition"
                  >
                    <option value="">Select hazard type</option>
                    <option value="cyclone">Cyclone</option>
                    <option value="flood">Flood</option>
                    <option value="tsunami">Tsunami</option>
                    <option value="earthquake">Earthquake</option>
                    <option value="drought">Drought</option>
                    <option value="wildfire">Wildfire</option>
                    <option value="landslide">Landslide</option>
                    <option value="volcano">Volcanic Eruption</option>
                    <option value="storm">Storm</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>

                {/* Location */}
                <FormField label="Location" htmlFor="edit-location">
                  <div className="space-y-2">
                    <input
                      {...register('location')}
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
                  <input
                    {...register('country')}
                    id="edit-country"
                    type="text"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-500 focus:ring-1 focus:ring-pacific-500 transition"
                    placeholder="e.g., Fiji"
                  />
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
