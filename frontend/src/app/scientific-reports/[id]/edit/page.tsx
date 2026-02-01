"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { ScientificReportForm } from "@/components/scientific-reports/ScientificReportForm";
import { scientificReportsApi } from "@/lib/scientific-reports-api";
import { ScientificReportSubmission } from "@/lib/scientific-report-types";

export default function EditReportPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const [initialData, setInitialData] = useState<Partial<ScientificReportSubmission> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setIsLoading(true);
        const report = await scientificReportsApi.getReport(reportId);

        // Transform to form submission format
        const formData: Partial<ScientificReportSubmission> = {
          title: report.title,
          description: report.description,
          reportType: report.reportType as any,
          datePublished: report.datePublished.split("T")[0],
          authorOrganization: report.authorOrganization,
          authorContact: report.authorContact,
          confidenceLevel: report.confidenceLevel as any,
          peerReviewed: report.peerReviewed,
          dateStart: report.dateStart?.split("T")[0],
          dateEnd: report.dateEnd?.split("T")[0],
          metrics: report.impactMetrics,
        };

        setInitialData(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch report");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Edit Scientific Report</h1>
          <p className="text-gray-600 mt-2">
            Update your research and impact metrics
          </p>
        </div>

        {initialData && (
          <ScientificReportForm
            initialData={initialData}
            editingReportId={reportId}
            onSuccess={() => router.push(`/scientific-reports/${reportId}`)}
          />
        )}
      </div>
    </div>
  );
}
