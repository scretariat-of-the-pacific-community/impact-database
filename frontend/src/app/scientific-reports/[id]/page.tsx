"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, ChevronLeft } from "lucide-react";
import { scientificReportsApi } from "@/lib/scientific-reports-api";
import { ScientificReport } from "@/lib/scientific-report-types";

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const [report, setReport] = useState<ScientificReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setIsLoading(true);
        const data = await scientificReportsApi.getReport(reportId);
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch report");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this report?")) return;

    try {
      setIsDeleting(true);
      await scientificReportsApi.deleteReport(reportId);
      router.push("/scientific-reports");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete report");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-white p-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-red-800">{error || "Report not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900 mb-3">{report.title}</h1>

              <div className="flex items-center gap-4 text-gray-600 mb-4">
                {report.authorOrganization && (
                  <span>
                    <strong>Organization:</strong> {report.authorOrganization}
                  </span>
                )}
                <span>
                  <strong>Published:</strong> {new Date(report.datePublished).toLocaleDateString()}
                </span>
              </div>

              <div className="flex gap-2 flex-wrap">
                {report.peerReviewed && (
                  <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                    Peer Reviewed
                  </span>
                )}
                <span
                  className={`px-3 py-1 text-sm font-medium rounded-full ${
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
                <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm font-medium rounded-full">
                  Confidence: {report.confidenceLevel.charAt(0).toUpperCase() + report.confidenceLevel.slice(1)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 ml-4 flex-shrink-0">
              <button
                onClick={() => router.push(`/scientific-reports/${reportId}/edit`)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
              >
                ✏️ Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition"
              >
                🗑️ {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Description */}
          <section className="bg-white p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{report.description}</p>

            {(report.dateStart || report.dateEnd) && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Event Timeframe:</strong>{" "}
                  {report.dateStart && new Date(report.dateStart).toLocaleDateString()}
                  {report.dateEnd && ` to ${new Date(report.dateEnd).toLocaleDateString()}`}
                </p>
              </div>
            )}
          </section>

          {/* Impact Metrics */}
          {report.impactMetrics && (
            <section className="bg-white p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Impact Metrics</h2>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {Object.entries(report.impactMetrics).map(
                  ([key, value]) =>
                    value !== null && value !== undefined && (
                      <div key={key} className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600 capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {typeof value === "number" ? value.toLocaleString() : String(value)}
                        </p>
                      </div>
                    )
                )}
              </div>
            </section>
          )}

          {/* Linked Citizen Data */}
          {report.linkedDataCount > 0 && (
            <section className="bg-white p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Linked Citizen Data ({report.linkedDataCount})
              </h2>

              <div className="grid gap-3">
                {report.linkedCitizenData?.map((link, idx) => (
                  <div key={idx} className="p-4 border rounded-lg hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Upload #{link.contentId.slice(0, 8)}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="capitalize">{link.contentType}</span>
                          {" • "}
                          <span className="capitalize">{link.citationType}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">{(link.relevanceScore * 100).toFixed(0)}%</p>
                        <p className="text-xs text-gray-500">Relevance</p>
                      </div>
                    </div>
                    {link.notes && (
                      <p className="text-sm text-gray-700 mt-2 italic">"{link.notes}"</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Report Details */}
          <section className="bg-white p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Report Details</h2>

            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-700">Status</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {report.isPublished ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                      Published
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                      Draft
                    </span>
                  )}
                </dd>
              </div>

              {report.authorContact && (
                <div>
                  <dt className="text-sm font-medium text-gray-700">Contact</dt>
                  <dd className="mt-1 text-sm text-gray-900">{report.authorContact}</dd>
                </div>
              )}

              <div>
                <dt className="text-sm font-medium text-gray-700">Created</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(report.createdAt).toLocaleDateString()}
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-700">Report ID</dt>
                <dd className="mt-1 text-xs text-gray-500 font-mono">{report.id}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
