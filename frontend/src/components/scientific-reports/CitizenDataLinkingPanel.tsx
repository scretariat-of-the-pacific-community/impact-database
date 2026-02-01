"use client";

import React, { useState, useEffect } from "react";
import { Search, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { CitizenDataLink } from "@/lib/scientific-report-types";
import { imageApi } from "@/lib/api";

interface CitizenDataLinkingPanelProps {
  onLinksSelected: (links: CitizenDataLink[]) => void;
  selectedLinks?: CitizenDataLink[];
  maxSelections?: number;
}

interface CitizenUpload {
  id: string;
  filename: string;
  title?: string;
  hazardType?: string;
  location?: string;
  createdAt: string;
}

export function CitizenDataLinkingPanel({
  onLinksSelected,
  selectedLinks = [],
  maxSelections = 50,
}: CitizenDataLinkingPanelProps) {
  const [uploads, setUploads] = useState<CitizenUpload[]>([]);
  const [filteredUploads, setFilteredUploads] = useState<CitizenUpload[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHazard, setSelectedHazard] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(selectedLinks.map((l) => l.contentId))
  );
  const [hazards, setHazards] = useState<string[]>([]);

  // Fetch citizen uploads
  useEffect(() => {
    const fetchUploads = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/images", {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          const uploadList = (data.images || []).map((img: any) => ({
            id: img.id,
            filename: img.filename,
            title: img.title,
            hazardType: img.hazard_type,
            location: img.location,
            createdAt: img.created_at,
          }));

          setUploads(uploadList);
          setFilteredUploads(uploadList);

          // Extract unique hazard types
          const uniqueHazards = Array.from(
            new Set(uploadList.map((u) => u.hazardType).filter(Boolean))
          ) as string[];
          setHazards(uniqueHazards.sort());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch uploads");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUploads();
  }, []);

  // Filter uploads
  useEffect(() => {
    let filtered = uploads;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.filename.toLowerCase().includes(query) ||
          u.title?.toLowerCase().includes(query) ||
          u.location?.toLowerCase().includes(query)
      );
    }

    if (selectedHazard) {
      filtered = filtered.filter((u) => u.hazardType === selectedHazard);
    }

    setFilteredUploads(filtered);
  }, [searchQuery, selectedHazard, uploads]);

  // Handle selection toggle
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      if (newSelected.size >= maxSelections) {
        setError(`Maximum ${maxSelections} selections allowed`);
        return;
      }
      newSelected.add(id);
    }

    setSelectedIds(newSelected);
    setError(null);

    // Update selected links
    const links: CitizenDataLink[] = Array.from(newSelected).map((id) => ({
      contentId: id,
      contentType: "image", // Could be image or video
      citationType: "evidence",
      relevanceScore: 0.7,
    }));

    onLinksSelected(links);
  };

  const isSelected = (id: string) => selectedIds.has(id);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">Link Citizen Data</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Search and Filters */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by filename, title, or location..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={selectedHazard}
            onChange={(e: any) => setSelectedHazard(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Hazard Types</option>
            {hazards.map((hazard) => (
              <option key={hazard} value={hazard}>
                {hazard}
              </option>
            ))}
          </select>

          <p className="text-sm text-gray-600">
            Selected: {selectedIds.size} / {maxSelections}
          </p>
        </div>

        {/* Upload List */}
        <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filteredUploads.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              {uploads.length === 0 ? "No uploads available" : "No uploads match your filters"}
            </div>
          ) : (
            filteredUploads.map((upload) => (
              <label
                key={upload.id}
                className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer transition"
              >
                <input
                  type="checkbox"
                  checked={isSelected(upload.id)}
                  onChange={() => toggleSelection(upload.id)}
                  className="w-4 h-4 rounded mt-1 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{upload.title || upload.filename}</p>
                  <p className="text-xs text-gray-600 truncate">{upload.filename}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {upload.hazardType && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                        {upload.hazardType}
                      </span>
                    )}
                    {upload.location && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">
                        {upload.location}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Selected Items Summary */}
      {selectedIds.size > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-2">
            {selectedIds.size} citizen upload{selectedIds.size !== 1 ? "s" : ""} selected as evidence
          </p>
          <p className="text-xs text-blue-700">
            These uploads will be linked to your scientific report and cited as evidence.
          </p>
        </div>
      )}
    </div>
  );
}
