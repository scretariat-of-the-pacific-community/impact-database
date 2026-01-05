'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth-utils';
import {
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  MapPinIcon,
  CalendarIcon,
  TagIcon,
  DocumentTextIcon,
  PhotoIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import dompurify, { type Config as DOMPurifyConfig } from 'dompurify';

const DOMPurify = typeof window !== 'undefined' ? dompurify(window) : null;

const INPUT_SANITIZE_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
};

const sanitizeMetadataValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return DOMPurify ? DOMPurify.sanitize(value, INPUT_SANITIZE_CONFIG) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, val]) => {
      acc[key] = sanitizeMetadataValue(val);
      return acc;
    }, {});
  }

  return value;
};

interface MetadataField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'coordinates' | 'tags';
  required: boolean;
  options?: string[];
  validation?: RegExp;
  description?: string;
}

interface MetadataEditorProps {
  imageId: string;
  onSave?: (metadata: any) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

const METADATA_FIELDS: MetadataField[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    required: true,
    description: 'Brief descriptive title for the image'
  },
  {
    key: 'description',
    label: 'Description',
    type: 'textarea',
    required: true,
    description: 'Detailed description of what is shown in the image'
  },
  {
    key: 'hazardType',
    label: 'Hazard Type',
    type: 'select',
    required: true,
    options: ['flood', 'earthquake', 'tsunami', 'landslide', 'cyclone', 'drought', 'wildfire', 'volcanic', 'coastal_erosion'],
    description: 'Primary type of natural hazard depicted'
  },
  {
    key: 'captureDate',
    label: 'Capture Date',
    type: 'date',
    required: true,
    description: 'Date when the image was captured'
  },
  {
    key: 'location',
    label: 'Location',
    type: 'coordinates',
    required: true,
    description: 'Geographic coordinates and address'
  },
  {
    key: 'severity',
    label: 'Impact Severity',
    type: 'select',
    required: false,
    options: ['low', 'moderate', 'high', 'extreme'],
    description: 'Assessed severity of the impact shown'
  },
  {
    key: 'tags',
    label: 'Tags',
    type: 'tags',
    required: false,
    description: 'Additional descriptive tags (comma-separated)'
  },
  {
    key: 'source',
    label: 'Source',
    type: 'text',
    required: false,
    description: 'Source or origin of the image'
  },
  {
    key: 'rights',
    label: 'Rights/License',
    type: 'select',
    required: false,
    options: ['CC BY', 'CC BY-SA', 'CC BY-NC', 'CC BY-NC-SA', 'All Rights Reserved', 'Public Domain'],
    description: 'Copyright or license information'
  }
];

const MetadataEditor: React.FC<MetadataEditorProps> = ({ imageId, onSave, onCancel, readOnly = false }) => {
  const [metadata, setMetadata] = useState<any>({});
  const [originalMetadata, setOriginalMetadata] = useState<any>({});
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const queryClient = useQueryClient();

  const { data: imageData, isLoading } = useQuery({
    queryKey: ['image-metadata', imageId],
    queryFn: async () => {
      const response = await authFetch(`/api/images/${imageId}/metadata`);
      if (!response.ok) throw new Error('Failed to fetch metadata');
      return response.json();
    },
    enabled: !!imageId
  });

  const saveMutation = useMutation({
    mutationFn: async (updatedMetadata: any) => {
      const response = await authFetch(`/api/admin/curation/metadata/${imageId}`, {
        method: 'PUT',
        body: JSON.stringify({
          metadata: updatedMetadata,
          change_notes: 'Metadata updated via admin interface'
        })
      });
      if (!response.ok) throw new Error('Failed to save metadata');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['image-metadata', imageId] });
      setHasChanges(false);
      setOriginalMetadata(metadata);
      onSave?.(data);
    }
  });

  useEffect(() => {
    if (imageData) {
      const meta = imageData.metadata || {};
      setMetadata(meta);
      setOriginalMetadata(meta);
      setHasChanges(false);
    }
  }, [imageData]);

  useEffect(() => {
    const changed = JSON.stringify(metadata) !== JSON.stringify(originalMetadata);
    setHasChanges(changed);
  }, [metadata, originalMetadata]);

  const validateField = (field: MetadataField, value: any): string | null => {
    if (field.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
      return `${field.label} is required`;
    }
    
    if (field.validation && value && !field.validation.test(value)) {
      return `${field.label} format is invalid`;
    }
    
    return null;
  };

  const validateAll = (): boolean => {
    const errors: { [key: string]: string } = {};
    let isValid = true;

    METADATA_FIELDS.forEach(field => {
      const error = validateField(field, metadata[field.key]);
      if (error) {
        errors[field.key] = error;
        isValid = false;
      }
    });

    setValidationErrors(errors);
    return isValid;
  };

  const handleFieldChange = (key: string, value: any) => {
    const sanitizedValue = sanitizeMetadataValue(value);
    const newMetadata = { ...metadata, [key]: sanitizedValue };
    setMetadata(newMetadata);

    // Clear validation error for this field
    if (validationErrors[key]) {
      setValidationErrors({ ...validationErrors, [key]: '' });
    }
  };

  const handleSave = () => {
    setShowValidation(true);
    if (validateAll()) {
      saveMutation.mutate(metadata);
    }
  };

  const handleCancel = () => {
    setMetadata(originalMetadata);
    setValidationErrors({});
    setShowValidation(false);
    setHasChanges(false);
    onCancel?.();
  };

  const renderField = (field: MetadataField) => {
    const value = metadata[field.key] || '';
    const error = showValidation ? validationErrors[field.key] : '';
    const fieldId = `field-${field.key}`;

    const baseInputClasses = `w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
      error ? 'border-red-300' : 'border-gray-300'
    } ${readOnly ? 'bg-gray-50' : ''}`;

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            id={fieldId}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={readOnly}
            className={`${baseInputClasses} h-24 resize-none`}
            placeholder={field.description}
          />
        );

      case 'select':
        return (
          <select
            id={fieldId}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={readOnly}
            className={baseInputClasses}
          >
            <option value="">Select {field.label}</option>
            {field.options?.map(option => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        );

      case 'date':
        return (
          <input
            id={fieldId}
            type="date"
            value={value ? new Date(value).toISOString().split('T')[0] : ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={readOnly}
            className={baseInputClasses}
          />
        );

      case 'number':
        return (
          <input
            id={fieldId}
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value))}
            disabled={readOnly}
            className={baseInputClasses}
            placeholder={field.description}
          />
        );

      case 'coordinates':
        const location = metadata.location || {};
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={location.latitude || ''}
                onChange={(e) => handleFieldChange('location', {
                  ...location,
                  latitude: parseFloat(e.target.value)
                })}
                disabled={readOnly}
                className={baseInputClasses}
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={location.longitude || ''}
                onChange={(e) => handleFieldChange('location', {
                  ...location,
                  longitude: parseFloat(e.target.value)
                })}
                disabled={readOnly}
                className={baseInputClasses}
              />
            </div>
            <input
              type="text"
              placeholder="Address or place name"
              value={location.address || ''}
              onChange={(e) => handleFieldChange('location', {
                ...location,
                address: e.target.value
              })}
              disabled={readOnly}
              className={baseInputClasses}
            />
          </div>
        );

      case 'tags':
        return (
          <input
            id={fieldId}
            type="text"
            value={Array.isArray(value) ? value.join(', ') : value}
            onChange={(e) => handleFieldChange(field.key, e.target.value.split(',').map(tag => tag.trim()))}
            disabled={readOnly}
            className={baseInputClasses}
            placeholder="Enter tags separated by commas"
          />
        );

      default:
        return (
          <input
            id={fieldId}
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={readOnly}
            className={baseInputClasses}
            placeholder={field.description}
          />
        );
    }
  };

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'coordinates': return MapPinIcon;
      case 'date': return CalendarIcon;
      case 'tags': return TagIcon;
      case 'textarea': return DocumentTextIcon;
      default: return DocumentTextIcon;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <PhotoIcon className="h-6 w-6 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900">
              {readOnly ? 'View Metadata' : 'Edit Metadata'}
            </h3>
            {hasChanges && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                <ClockIcon className="h-3 w-3 mr-1" />
                Unsaved changes
              </span>
            )}
          </div>
          
          {!readOnly && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleCancel}
                disabled={!hasChanges}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <XMarkIcon className="h-4 w-4 inline mr-1" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4 inline mr-1" />
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {METADATA_FIELDS.map((field) => {
            const Icon = getFieldIcon(field.type);
            const error = showValidation ? validationErrors[field.key] : '';
            
            return (
              <motion.div
                key={field.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={field.type === 'textarea' ? 'md:col-span-2' : ''}
              >
                <label htmlFor={`field-${field.key}`} className="block text-sm font-medium text-gray-700 mb-2">
                  <div className="flex items-center space-x-2">
                    <Icon className="h-4 w-4 text-gray-400" />
                    <span>{field.label}</span>
                    {field.required && <span className="text-red-500">*</span>}
                  </div>
                </label>
                
                {renderField(field)}
                
                {field.description && (
                  <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                )}
                
                {error && (
                  <p className="mt-1 text-xs text-red-600 flex items-center">
                    <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                    {error}
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Change History Preview */}
        {hasChanges && !readOnly && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Pending Changes</h4>
            <div className="space-y-2">
              {Object.keys(metadata).filter(key => 
                JSON.stringify(metadata[key]) !== JSON.stringify(originalMetadata[key])
              ).map(key => {
                const field = METADATA_FIELDS.find(f => f.key === key);
                return (
                  <div key={key} className="text-xs text-blue-800">
                    <span className="font-medium">{field?.label || key}:</span>
                    <span className="text-gray-600 line-through ml-2">
                      {JSON.stringify(originalMetadata[key])}
                    </span>
                    <span className="text-blue-900 ml-2">
                      → {JSON.stringify(metadata[key])}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Validation Summary */}
        {showValidation && Object.keys(validationErrors).length > 0 && (
          <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-2" />
              <h4 className="text-sm font-medium text-red-900">Please fix the following errors:</h4>
            </div>
            <ul className="mt-2 text-xs text-red-800 list-disc list-inside">
              {Object.values(validationErrors).filter(Boolean).map((error, idx) => (
                <li key={`${error}-${idx}`}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetadataEditor;
