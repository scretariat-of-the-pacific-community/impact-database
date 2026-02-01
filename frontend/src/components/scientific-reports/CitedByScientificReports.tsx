"use client";

import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle, BookOpen } from "lucide-react";
import { scientificReportsApi } from "@/lib/scientific-reports-api";
import { ScientificReport } from "@/lib/scientific-report-types";

interface CitedByScientificReportsProps {
  contentId: string;
}

export function CitedByScientificReports({ contentId }: CitedByScientificReportsProps) {
  const [reports, setReports] = useState<ScientificReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCitations = async () => {
      try {
        setIsLoading(true);
        const data = await scientificReportsApi.getCitationsForContent(contentId);
        setReports(data.reports || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load citations");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCitations();
  }, [contentId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
        <p className="text-red-800 text-sm">{error}</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-lg">
        <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>This upload hasn't been cited in any scientific reports yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Cited By Scientific Reports ({reports.length})</h3>

      <div className="space-y-3">
        {reports.map((report) => (
          <div
            key={report.id}
            className="p-4 border rounded-lg hover:shadow-md transition"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 hover:text-blue-600">
                  {report.title}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  {report.authorOrganization && (
                    <>
                      <span>{report.authorOrganization}</span>
                      <span className="mx-2">•</span>
                    </>
                  )}
                  <span>{new Date(report.datePublished).toLocaleDateString()}</span>
                </p>
              </div>

              <div className="flex gap-2 ml-4 flex-shrink-0">
                {report.peerReviewed && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                    Peer Reviewed
                  </span>
                )}
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  report.reportType === "scientific"
                    ? "bg-blue-100 text-blue-800"
                    : report.reportType === "assessment"
                    ? "bg-orange-100 text-orange-800"
                    : report.reportType === "policy"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  {report.reportType.charAt(0).toUpperCase() + report.reportType.slice(1)}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-700 line-clamp-2">{report.description}</p>

            {report.linkedDataCount > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Linked to {report.linkedDataCount} citizen upload{report.linkedDataCount !== 1 ? "s" : ""}
              </p>
            )}

            <a
              href={`/scientific-reports/${report.id}`}
              className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View Full Report →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
