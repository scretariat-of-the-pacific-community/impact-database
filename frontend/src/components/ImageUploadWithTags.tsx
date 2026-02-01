"use client";

import { useState } from "react";
import { Upload, X, Tag, Plus } from "lucide-react";

interface ImageUploadWithTagsProps {
  onUploadComplete?: (imageData: {
    file: File;
    tags: string[];
    title: string;
    description: string;
  }) => void;
  allowedFormats?: string[];
  maxFileSize?: number; // in MB
}

export function ImageUploadWithTags({
  onUploadComplete,
  allowedFormats = ["image/jpeg", "image/png", "image/webp"],
  maxFileSize = 50,
}: ImageUploadWithTagsProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateFile = (f: File): boolean => {
    if (!allowedFormats.includes(f.type)) {
      setError(`Invalid format. Allowed: ${allowedFormats.join(", ")}`);
      return false;
    }
    if (f.size > maxFileSize * 1024 * 1024) {
      setError(`File too large. Maximum: ${maxFileSize}MB`);
      return false;
    }
    setError(null);
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const processFile = (f: File) => {
    if (validateFile(f)) {
      setFile(f);

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(f);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const addTag = (tag: string) => {
    if (tag.trim() && !tags.includes(tag.trim())) {
      setTags([...tags, tag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    onUploadComplete?.({
      file,
      tags,
      title,
      description,
    });

    // Reset form
    setFile(null);
    setPreview(null);
    setTags([]);
    setTitle("");
    setDescription("");
    setNewTag("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-gray-50 rounded-lg p-6 border border-gray-200">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Upload className="w-5 h-5" />
        Upload Image with Tags
      </h3>

      {/* File Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"
        } ${file ? "hidden" : ""}`}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-gray-700 font-medium mb-2">Drag and drop your image here</p>
        <p className="text-sm text-gray-600 mb-4">or</p>
        <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition">
          Browse Files
          <input
            type="file"
            onChange={handleFileInput}
            accept={allowedFormats.join(",")}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-500 mt-4">
          {allowedFormats.join(", ")} • Max {maxFileSize}MB
        </p>
      </div>

      {/* File Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="relative inline-block">
            <img
              src={preview}
              alt="Preview"
              className="max-h-48 rounded-lg border border-gray-300"
            />
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
              }}
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Image Metadata */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                placeholder="E.g., Tropical Storm Impact - Coastal Erosion"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e: any) => setDescription(e.target.value)}
                placeholder="Additional details about this image..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Tags Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Tag className="w-4 h-4" />
                Tags (Optional)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e: any) => setNewTag(e.target.value)}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(newTag);
                    }
                  }}
                  placeholder="Add tag (e.g., 'aerial', 'structural-damage')"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => addTag(newTag)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* Tags Display */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit Button */}
      {file && (
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            Upload Image
          </button>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setPreview(null);
            }}
            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium py-2 px-4 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}
