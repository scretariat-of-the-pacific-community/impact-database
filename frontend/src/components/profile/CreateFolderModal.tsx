'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/design-system';
import type { CreateSharedFolderRequest } from '@/lib/types';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSharedFolderRequest) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function CreateFolderModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isLoading = false,
  error = null 
}: CreateFolderModalProps) {
  const [formData, setFormData] = useState<CreateSharedFolderRequest>({
    name: '',
    description: '',
    is_public: false,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; description?: string }>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasUnsavedChanges = formData.name.trim() || formData.description?.trim();

  const validateName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Folder name is required';
    }
    if (trimmed.length > 255) {
      return 'Folder name must be less than 255 characters';
    }
    return null;
  };

  const validateDescription = (value: string) => {
    if (value && value.trim().length > 1000) {
      return 'Description must be less than 1000 characters';
    }
    return null;
  };

  const handleNameBlur = () => {
    const error = validateName(formData.name);
    setFieldErrors(prev => ({ ...prev, name: error || undefined }));
  };

  const handleDescriptionBlur = () => {
    const error = validateDescription(formData.description || '');
    setFieldErrors(prev => ({ ...prev, description: error || undefined }));
  };

  const handleClose = () => {
    if (!isLoading) {
      // Warn about unsaved changes
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to close this form?'
        );
        if (!confirmed) return;
      }
      
      setFormData({ name: '', description: '', is_public: false });
      setValidationError(null);
      setFieldErrors({});
      onClose();
    }
  };

  // Store previous focus and handle escape key
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isLoading) {
          handleClose();
        }
      };
      
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    } else if (previousFocusRef.current) {
      // Return focus when modal closes
      previousFocusRef.current.focus();
    }
  }, [isOpen, isLoading]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTab);
    return () => modal.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = formData.name.trim();
    const trimmedDescription = formData.description?.trim() || '';

    // Validation
    if (!trimmedName) {
      setValidationError('Folder name is required');
      return;
    }

    if (trimmedName.length > 255) {
      setValidationError('Folder name must be less than 255 characters');
      return;
    }

    if (trimmedDescription && trimmedDescription.length > 1000) {
      setValidationError('Description must be less than 1000 characters');
      return;
    }

    setValidationError(null);
    setFieldErrors({});
    
    // Send undefined for empty description instead of empty string
    const submitData: CreateSharedFolderRequest = {
      name: trimmedName,
      is_public: formData.is_public,
    };
    
    if (trimmedDescription) {
      submitData.description = trimmedDescription;
    }
    
    onSubmit(submitData);
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="bg-deep-900 border border-white/20 rounded-3xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
            <h2 id="modal-title" className="text-xl font-semibold text-white">Create Shared Folder</h2>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="text-white/60 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Folder Name */}
            <div>
              <label htmlFor="folder-name" className="block text-sm font-medium text-white/90 mb-2">
                Folder Name <span className="text-coral-400">*</span>
              </label>
              <input
                id="folder-name"
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  // Clear field error on change
                  if (fieldErrors.name) {
                    setFieldErrors(prev => ({ ...prev, name: undefined }));
                  }
                }}
                onBlur={handleNameBlur}
                placeholder="e.g., Tsunami Evidence 2025"
                disabled={isLoading}
                autoFocus
                className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  fieldErrors.name 
                    ? 'border-rose-500/50 focus:ring-rose-400/40 focus:border-rose-400' 
                    : 'border-white/15 focus:ring-pacific-400/40 focus:border-pacific-300'
                }`}
                maxLength={255}
                required
                aria-invalid={Boolean(fieldErrors.name || validationError)}
                aria-describedby={fieldErrors.name ? "folder-name-error folder-name-helper" : "folder-name-helper"}
              />
              {fieldErrors.name && (
                <p id="folder-name-error" className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                  <span>⚠</span>
                  {fieldErrors.name}
                </p>
              )}
              <p 
                id="folder-name-helper" 
                className={`text-xs mt-1.5 transition-colors ${formData.name.length > 230 ? 'text-amber-400 font-medium' : 'text-white/50'}`}
                aria-live="polite"
              >
                {formData.name.length}/255 characters
                {formData.name.length > 240 && <span className="ml-2 text-amber-300">⚠ Approaching limit</span>}
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="folder-description" className="block text-sm font-medium text-white/90 mb-2">
                Description
              </label>
              <textarea
                id="folder-description"
                value={formData.description}
                onChange={(e) => {
                  setFormData({ ...formData, description: e.target.value });
                  // Clear field error on change
                  if (fieldErrors.description) {
                    setFieldErrors(prev => ({ ...prev, description: undefined }));
                  }
                }}
                onBlur={handleDescriptionBlur}
                placeholder="Describe the purpose and contents of this folder..."
                disabled={isLoading}
                rows={3}
                className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors resize-none ${
                  fieldErrors.description
                    ? 'border-rose-500/50 focus:ring-rose-400/40 focus:border-rose-400'
                    : 'border-white/15 focus:ring-pacific-400/40 focus:border-pacific-300'
                }`}
                maxLength={1000}
                aria-describedby={fieldErrors.description ? "folder-description-error folder-description-helper" : "folder-description-helper"}
              />
              {fieldErrors.description && (
                <p id="folder-description-error" className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                  <span>⚠</span>
                  {fieldErrors.description}
                </p>
              )}
              <p 
                id="folder-description-helper" 
                className={`text-xs mt-1.5 transition-colors ${(formData.description?.length || 0) > 900 ? 'text-amber-400 font-medium' : 'text-white/50'}`}
                aria-live="polite"
              >
                {formData.description?.length || 0}/1000 characters
                {(formData.description?.length || 0) > 950 && <span className="ml-2 text-amber-300">⚠ Approaching limit</span>}
              </p>
            </div>

            {/* Visibility */}
            <div>
              <label id="visibility-label" className="block text-sm font-medium text-white/90 mb-3">
                Visibility
              </label>
              <div role="radiogroup" aria-labelledby="visibility-label" className="space-y-2.5">
                <label 
                  htmlFor="visibility-private" 
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    !formData.is_public 
                      ? 'border-pacific-400 bg-pacific-400/10' 
                      : 'border-white/15 bg-white/5 hover:border-white/25'
                  }`}
                >
                  <input
                    id="visibility-private"
                    type="radio"
                    name="folder-visibility"
                    checked={!formData.is_public}
                    onChange={() => setFormData({ ...formData, is_public: false })}
                    disabled={isLoading}
                    className="mt-0.5 h-4 w-4 text-pacific-400 focus:ring-pacific-400/40"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">Private</p>
                    <p className="text-xs text-white/60">Only you can view and edit this folder</p>
                  </div>
                </label>
                <label 
                  htmlFor="visibility-public" 
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    formData.is_public 
                      ? 'border-pacific-400 bg-pacific-400/10' 
                      : 'border-white/15 bg-white/5 hover:border-white/25'
                  }`}
                >
                  <input
                    id="visibility-public"
                    type="radio"
                    name="folder-visibility"
                    checked={formData.is_public}
                    onChange={() => setFormData({ ...formData, is_public: true })}
                    disabled={isLoading}
                    className="mt-0.5 h-4 w-4 text-pacific-400 focus:ring-pacific-400/40"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">Public</p>
                    <p className="text-xs text-white/60">Anyone can view this folder</p>
                    <div className="flex items-start gap-1.5 mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <span className="text-amber-400 text-xs shrink-0 mt-0.5">⚠️</span>
                      <p className="text-xs text-amber-200 font-medium leading-snug">
                        Public folders are discoverable. Avoid sensitive data.
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Error Messages */}
            {(validationError || error) && (
              <div 
                role="alert" 
                aria-live="assertive"
                id="folder-name-error"
                className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 flex items-start gap-2"
              >
                <span className="text-rose-400 shrink-0 mt-0.5">⚠</span>
                <p className="text-sm text-rose-200 font-medium">{validationError || error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1 text-white hover:text-white hover:bg-white/10"
                aria-label="Cancel folder creation"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !formData.name.trim()}
                className="flex-1 relative"
                aria-label={isLoading ? 'Creating folder, please wait' : 'Create folder'}
                aria-busy={isLoading}
              >
                {isLoading && (
                  <svg 
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {isLoading ? 'Creating...' : 'Create Folder'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
