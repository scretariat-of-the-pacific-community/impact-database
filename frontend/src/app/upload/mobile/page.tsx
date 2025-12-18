'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, MapPin, Upload, X, Check, Loader2 } from 'lucide-react';
import { Button, Card } from '@/components/design-system';
import { imageApi } from '@/lib/api';
import { queuePendingUpload } from '@/lib/offline-storage';
import { HAZARD_TYPES } from '@/lib/types';

interface CapturedImage {
  file: File | null;
  preview: string;
  location: { latitude: number; longitude: number } | null;
  timestamp: Date;
}

export default function MobileUploadPage() {
  const router = useRouter();
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    hazard_type: '',
    description: '',
    location: '',
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup blob URL when captured image changes
  useEffect(() => {
    return () => {
      if (captured?.preview) {
        URL.revokeObjectURL(captured.preview);
      }
    };
  }, [captured?.preview]);

  // Request GPS location immediately on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // GPS acquired successfully
        },
        (error) => {
          setLocationError(`GPS Error: ${error.message}`);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    }

    // Cleanup camera stream on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Open camera
  const openCamera = async () => {
    try {
      setIsCapturing(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error('[MobileUpload] Camera access error:', error);
      alert('Camera access denied. Please enable camera permissions.');
      setIsCapturing(false);
    }
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });

          // Get current GPS location
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                setCaptured({
                  file,
                  preview: URL.createObjectURL(blob),
                  location: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                  },
                  timestamp: new Date(),
                });
                closeCamera();
              },
              () => {
                // Still capture image even without GPS
                setCaptured({
                  file,
                  preview: URL.createObjectURL(blob),
                  location: null,
                  timestamp: new Date(),
                });
                closeCamera();
              }
            );
          } else {
            setCaptured({
              file,
              preview: URL.createObjectURL(blob),
              location: null,
              timestamp: new Date(),
            });
            closeCamera();
          }
        }
      }, 'image/jpeg', 0.92);
    }
  };

  // Close camera
  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  // Handle file input (fallback for devices without camera API)
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);

    // Get GPS location
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCaptured({
            file,
            preview,
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            timestamp: new Date(),
          });
        },
        () => {
          setCaptured({
            file,
            preview,
            location: null,
            timestamp: new Date(),
          });
        }
      );
    } else {
      setCaptured({
        file,
        preview,
        location: null,
        timestamp: new Date(),
      });
    }
  };

  // Upload image
  const handleUpload = async () => {
    if (!captured?.file) return;

    setIsUploading(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', captured.file);
      uploadFormData.append('hazard_type', formData.hazard_type || 'other');
      uploadFormData.append('description', formData.description || 'Mobile upload');
      if (captured.location?.latitude) {
        uploadFormData.append('latitude', captured.location.latitude.toString());
      }
      if (captured.location?.longitude) {
        uploadFormData.append('longitude', captured.location.longitude.toString());
      }
      uploadFormData.append('captured_at', captured.timestamp.toISOString());

      // Try online upload first
      if (navigator.onLine) {
        await imageApi.upload(uploadFormData);
        alert('Upload successful! Your image is being reviewed.');
        router.push('/profile?tab=uploads');
      } else {
        // Queue for background sync if offline
        const metadata = {
          hazard_type: formData.hazard_type || 'other',
          description: formData.description || 'Mobile upload',
          latitude: captured.location?.latitude,
          longitude: captured.location?.longitude,
          captured_at: captured.timestamp.toISOString(),
        };
        await queuePendingUpload(captured.file, metadata);
        alert('Offline mode: Upload queued. Will sync when online.');
        router.push('/profile?tab=uploads');
      }
    } catch (error) {
      // Queue for background sync on error
      try {
        const metadata = {
          hazard_type: formData.hazard_type || 'other',
          description: formData.description || 'Mobile upload',
          latitude: captured.location?.latitude,
          longitude: captured.location?.longitude,
          captured_at: captured.timestamp.toISOString(),
        };
        await queuePendingUpload(captured.file, metadata);
        alert('Upload queued. Will retry automatically when connection improves.');
        router.push('/profile?tab=uploads');
      } catch (queueError) {
        console.error('[MobileUpload] Failed to queue upload:', queueError);
        alert('Upload failed. Please try again later.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Retake photo
  const retake = () => {
    if (captured?.preview) {
      URL.revokeObjectURL(captured.preview);
    }
    setCaptured(null);
    openCamera();
  };

  return (
    <div className="fixed inset-0 bg-deep-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-deep-900/95 px-4 py-3 backdrop-blur-lg">
        <Button
          variant="ghost"
          size="sm"
          className="text-white"
          onClick={() => router.back()}
        >
          <X className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Quick Upload</h1>
        <div className="w-8" />
      </div>

      {/* Camera view */}
      {isCapturing && (
        <div className="relative h-[calc(100vh-60px)]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <button
              onClick={capturePhoto}
              className="h-20 w-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm transition hover:bg-white/30"
            >
              <Camera className="mx-auto h-8 w-8 text-white" />
            </button>
          </div>
          <button
            onClick={closeCamera}
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 backdrop-blur-sm"
          >
            <X className="h-6 w-6 text-white" />
          </button>
        </div>
      )}

      {/* Preview and form */}
      {captured && !isCapturing && (
        <div className="h-[calc(100vh-60px)] overflow-y-auto p-4">
          <div className="space-y-4">
            {/* Image preview */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
              <img
                src={captured.preview}
                alt="Captured"
                className="h-full w-full object-cover"
              />
              {captured.location && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs backdrop-blur-sm">
                  <MapPin className="h-3 w-3 text-emerald-300" />
                  <span className="text-white">GPS: {captured.location.latitude.toFixed(4)}, {captured.location.longitude.toFixed(4)}</span>
                </div>
              )}
            </div>

            {locationError && (
              <Card className="border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-200">{locationError}</p>
                <p className="mt-1 text-xs text-amber-300/70">
                  Uploads without GPS require manual location entry.
                </p>
              </Card>
            )}

            {/* Form */}
            <Card className="border-white/10 bg-deep-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">
                Image Details
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-white/80">
                    Hazard Type *
                  </label>
                  <select
                    value={formData.hazard_type}
                    onChange={(e) =>
                      setFormData({ ...formData, hazard_type: e.target.value })
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-400 focus:outline-none focus:ring-2 focus:ring-pacific-400/50"
                  >
                    <option value="">Select type...</option>
                    {HAZARD_TYPES.map((type: { value: string; label: string }) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-white/80">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-400 focus:outline-none focus:ring-2 focus:ring-pacific-400/50"
                    placeholder="Brief description of what you're documenting..."
                  />
                </div>

                {!captured.location && (
                  <div>
                    <label className="mb-1 block text-sm text-white/80">
                      Location (manual)
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) =>
                        setFormData({ ...formData, location: e.target.value })
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-pacific-400 focus:outline-none focus:ring-2 focus:ring-pacific-400/50"
                      placeholder="City, Country"
                    />
                  </div>
                )}
              </div>
            </Card>

            {/* Action buttons */}
            <div className="flex gap-3 pb-safe">
              <Button
                variant="secondary"
                className="flex-1 bg-white/10 text-white hover:bg-white/20"
                onClick={retake}
                disabled={isUploading}
              >
                Retake
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-pacific-500 text-white hover:bg-pacific-400"
                onClick={handleUpload}
                disabled={!formData.hazard_type || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Initial state - choose input method */}
      {!captured && !isCapturing && (
        <div className="flex h-[calc(100vh-60px)] flex-col items-center justify-center p-8">
          <div className="mb-8 text-center">
            <Camera className="mx-auto mb-4 h-16 w-16 text-pacific-300" />
            <h2 className="mb-2 text-2xl font-bold text-white">
              Document an Impact
            </h2>
            <p className="text-white/70">
              Capture or select an image with automatic GPS tagging
            </p>
          </div>

          <div className="w-full max-w-sm space-y-3">
            <Button
              variant="primary"
              className="w-full bg-pacific-500 text-white hover:bg-pacific-400"
              onClick={openCamera}
            >
              <Camera className="mr-2 h-5 w-5" />
              Open Camera
            </Button>

            <Button
              variant="secondary"
              className="w-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-5 w-5" />
              Choose from Gallery
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {!navigator.onLine && (
            <Card className="mt-6 border-amber-500/30 bg-amber-500/10 p-3 text-center">
              <p className="text-sm text-amber-200">
                📴 Offline Mode: Uploads will sync automatically when online
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
