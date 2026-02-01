"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Plus, BookOpen } from "lucide-react";
import { scientificReportsApi } from "@/lib/scientific-reports-api";
import { ScientificReport } from "@/lib/scientific-report-types";

export default function ScientificReportsPage() {
  const [reports, setReports] = useState<ScientificReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Fetch reports
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setIsLoading(true);
        const data = await scientificReportsApi.listReports({
          skip,
          limit,
          reportType: selectedType || undefined,
        });
        setReports(data.reports);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch reports");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, [skip, selectedType]);

  // Client-side search filtering
  const filteredReports = reports.filter((report) =>
    searchQuery === ""
      ? true
      : report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (report.authorOrganization?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const currentPage = Math.floor(skip / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Scientific Reports</h1>
            <p className="text-gray-600 mt-2">
              Explore research and assessments linked to citizen-contributed data
            </p>
          </div>
          <Link
            href="/scientific-reports/submit"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Submit Report
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by title, description, or organization..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3">
            <select
              value={selectedType}
              onChange={(e: any) => {
                setSelectedType(e.target.value);
                setSkip(0);
              }}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Report Types</option>
              <option value="scientific">Scientific Research</option>
              <option value="assessment">Impact Assessment</option>
              <option value="policy">Policy Analysis</option>
              <option value="research">Field Research</option>
            </select>
          </div>

          <p className="text-sm text-gray-600">
            Showing {Math.min(skip + 1, total)}-{Math.min(skip + limit, total)} of {total} reports
          </p>
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No scientific reports found</p>
            <p className="text-gray-400 text-sm mt-1">
              Be the first to submit a scientific report linking citizen data!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((report) => (
              <Link
                key={report.id}
                href={`/scientific-reports/${report.id}`}
              >
                <div className="p-6 bg-white border rounded-lg hover:shadow-lg hover:border-blue-300 transition cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 hover:text-blue-600">
                        {report.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {report.authorOrganization && (
                          <>
                            <span className="font-medium">{report.authorOrganization}</span>
                            <span className="mx-2">•</span>
                          </>
                        )}
                        <span>{new Date(report.datePublished).toLocaleDateString()}</span>
                      </p>
                    </div>

                    <div className="flex gap-2 flex-shrink-0 ml-4">
                      {report.peerReviewed && (
                        <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                          Peer Reviewed
                        </span>
                      )}
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${
                          report.reportType === "scientific"
                            ? "bg-blue-100 text-blue-800"
                            : report.reportType === "assessment"
                            ? "bg-orange-100 text-orange-800"
                            : report.reportType === "policy"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {report.reportType.charAt(0).toUpperCase() + report.reportType.slice(1)}
                      </span>
                    </div>
                  </div>

                  <p className="text-gray-700 mb-4 line-clamp-3">{report.description}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-sm text-gray-500">
                      <span>📎 {report.linkedDataCount} citizen upload{report.linkedDataCount !== 1 ? "s" : ""}</span>
                      <span>
                        Confidence:{" "}
                        <span className="font-medium text-gray-700">
                          {report.confidenceLevel.charAt(0).toUpperCase() + report.confidenceLevel.slice(1)}
                        </span>
                      </span>
                    </div>
                    <span className="text-blue-600 hover:text-blue-700 font-medium">
                      Read More →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setSkip(Math.max(0, skip - limit))}
              disabled={skip === 0}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-800 rounded-lg transition font-medium"
            >
              ← Previous
            </button>

            <span className="text-gray-600">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setSkip(skip + limit)}
              disabled={skip + limit >= total}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-800 rounded-lg transition font-medium"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
