"use client";

import { useState, useEffect } from "react";
import { Search, X, Tag, Plus } from "lucide-react";
import { ImageMetadata } from "@/lib/types";

interface ImageTag {
  imageId: string;
  tags: string[];
  reportId?: string;
}

interface ImageTaggingPanelProps {
  onTagsChange: (tags: ImageTag[]) => void;
  selectedImages?: ImageTag[];
  reportId?: string;
  allowNewTags?: boolean;
}

export function ImageTaggingPanel({
  onTagsChange,
  selectedImages = [],
  reportId,
  allowNewTags = true,
}: ImageTaggingPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [availableImages, setAvailableImages] = useState<ImageMetadata[]>([]);
  const [selectedImageTags, setSelectedImageTags] = useState<ImageTag[]>(selectedImages);
  const [isLoading, setIsLoading] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  // Fetch available images
  useEffect(() => {
    const fetchImages = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/images/content/search?limit=100&sort_by=upload_date&sort_order=desc`);
        if (response.ok) {
          const data = await response.json();
          setAvailableImages(data.items || []);
        }
      } catch (error) {
        console.error("Failed to fetch images:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImages();
  }, []);

  // Filter images based on search
  const filteredImages = availableImages.filter((img) =>
    img.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    img.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    img.abstract?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add image with empty tags
  const handleAddImage = (image: ImageMetadata) => {
    if (!selectedImageTags.find((tag) => tag.imageId === image.id)) {
      const newTag: ImageTag = {
        imageId: image.id,
        tags: [],
        reportId: reportId,
      };
      const updated = [...selectedImageTags, newTag];
      setSelectedImageTags(updated);
      onTagsChange(updated);
      setSelectedImageId(image.id);
    }
  };

  // Remove image
  const handleRemoveImage = (imageId: string) => {
    const updated = selectedImageTags.filter((tag) => tag.imageId !== imageId);
    setSelectedImageTags(updated);
    onTagsChange(updated);
    if (selectedImageId === imageId) {
      setSelectedImageId(null);
    }
  };

  // Add tag to image
  const handleAddTag = (imageId: string, tag: string) => {
    if (!tag.trim()) return;

    const updated = selectedImageTags.map((item) => {
      if (item.imageId === imageId) {
        if (!item.tags.includes(tag.trim())) {
          return { ...item, tags: [...item.tags, tag.trim()] };
        }
      }
      return item;
    });
    setSelectedImageTags(updated);
    onTagsChange(updated);
    setNewTag("");
  };

  // Remove tag from image
  const handleRemoveTag = (imageId: string, tagToRemove: string) => {
    const updated = selectedImageTags.map((item) => {
      if (item.imageId === imageId) {
        return {
          ...item,
          tags: item.tags.filter((tag) => tag !== tagToRemove),
        };
      }
      return item;
    });
    setSelectedImageTags(updated);
    onTagsChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Tag className="w-5 h-5" />
          Link & Tag Images for This Report
        </h3>

        {/* Search Images */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search images by title, filename, or description..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Available Images Grid */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-600">Loading images...</div>
        ) : filteredImages.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4 max-h-48 overflow-y-auto">
            {filteredImages.map((image) => {
              const isSelected = selectedImageTags.some((tag) => tag.imageId === image.id);
              return (
                <button
                  key={image.id}
                  onClick={() => {
                    if (isSelected) {
                      handleRemoveImage(image.id);
                    } else {
                      handleAddImage(image);
                    }
                  }}
                  className={`relative group rounded-lg overflow-hidden border-2 transition ${
                    isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {image.thumbnail_url && (
                    <img
                      src={image.thumbnail_url}
                      alt={image.title}
                      className="w-full h-20 object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition" />
                  {isSelected && (
                    <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                  <div className="p-2 text-xs text-gray-700 line-clamp-2 bg-white">
                    {image.title || image.filename}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600">
            {searchQuery ? "No images found matching your search" : "No images available"}
          </div>
        )}

        {/* Selected Images with Tags */}
        {selectedImageTags.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium text-gray-700">Selected Images & Tags</h4>

            {selectedImageTags.map((imageTag) => {
              const image = availableImages.find((img) => img.id === imageTag.imageId);
              const isActive = selectedImageId === imageTag.imageId;

              return (
                <div
                  key={imageTag.imageId}
                  className={`border rounded-lg p-3 transition ${
                    isActive ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <button
                      onClick={() => setSelectedImageId(isActive ? null : imageTag.imageId)}
                      className="flex-1 text-left"
                    >
                      <p className="font-medium text-sm text-gray-900 line-clamp-1">
                        {image?.title || image?.filename}
                      </p>
                    </button>
                    <button
                      onClick={() => handleRemoveImage(imageTag.imageId)}
                      className="text-gray-400 hover:text-red-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Tags Display */}
                  {imageTag.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {imageTag.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(imageTag.imageId, tag)}
                            className="hover:text-blue-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add Tags (when selected) */}
                  {isActive && allowNewTags && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add tag (e.g., 'field-survey', 'aerial-view')"
                        value={newTag}
                        onChange={(e: any) => setNewTag(e.target.value)}
                        onKeyDown={(e: any) => {
                          if (e.key === "Enter") {
                            handleAddTag(imageTag.imageId, newTag);
                          }
                        }}
                        className="flex-1 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-400 focus:border-transparent"
                      />
                      <button
                        onClick={() => handleAddTag(imageTag.imageId, newTag)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1 transition"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <strong>Note:</strong> You can link multiple images to this report and tag them for better organization. Images can exist independently of reports.
      </div>
    </div>
  );
}
