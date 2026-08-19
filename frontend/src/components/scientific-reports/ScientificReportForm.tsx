'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import {
  CitizenDataLink,
  ScientificReportSubmission,
} from '@/lib/scientific-report-types';
import { scientificReportsApi } from '@/lib/scientific-reports-api';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { ImageTaggingPanel } from '@/components/ImageTaggingPanel';

interface ImageTag {
  imageId: string;
  tags: string[];
  reportId?: string;
}

interface ScientificReportFormProps {
  onSuccess?: () => void;
  initialData?: Partial<ScientificReportSubmission>;
  editingReportId?: string;
  linkedUploads?: CitizenDataLink[];
}

export function ScientificReportForm({
  onSuccess,
  initialData,
  editingReportId,
  linkedUploads,
}: ScientificReportFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [linkedImages, setLinkedImages] = useState<ImageTag[]>([]);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const defaultValues: Partial<ScientificReportSubmission> = {
    confidenceLevel: 'medium',
    peerReviewed: false,
    ...initialData,
    linkedUploads: linkedUploads ?? initialData?.linkedUploads,
  };

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ScientificReportSubmission>({
    defaultValues,
    mode: 'onChange',
  });

  const readinessValues = watch([
    'title',
    'description',
    'reportType',
    'datePublished',
  ]);
  const readinessFields = [
    { label: 'Report title', value: readinessValues[0] },
    { label: 'Description', value: readinessValues[1] },
    { label: 'Report type', value: readinessValues[2] },
    { label: 'Publication date', value: readinessValues[3] },
  ];
  const filledCount = readinessFields.filter((field) => {
    if (typeof field.value === 'string') return field.value.trim().length > 0;
    return Boolean(field.value);
  }).length;
  const readinessPercent = Math.round(
    (filledCount / readinessFields.length) * 100
  );
  const linkedUploadsCount = linkedUploads?.length ?? 0;
  const previewValues = watch([
    'title',
    'description',
    'reportType',
    'datePublished',
    'authorOrganization',
    'authorContact',
    'confidenceLevel',
    'peerReviewed',
    'dateStart',
    'dateEnd',
  ]);
  const metricsValues = watch('metrics');
  const qualityChecklist = useMemo(
    () => [
      {
        label: 'DOI or report identifier',
        required: false,
      },
      {
        label: 'Methodology summary',
        required: true,
      },
      {
        label: 'Data sources listed',
        required: true,
      },
      {
        label: 'Evidence linked (citizen uploads or images)',
        required: false,
      },
    ],
    []
  );
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(
    {}
  );
  const checklistFilled = qualityChecklist.filter(
    (item) => checklistState[item.label]
  ).length;
  const checklistPercent = Math.round(
    (checklistFilled / qualityChecklist.length) * 100
  );

  const onSubmit = async (data: ScientificReportSubmission) => {
    try {
      setError(null);
      setIsLoading(true);
      const payload = {
        ...data,
        linkedUploads,
      };

      if (editingReportId) {
        await scientificReportsApi.updateReport(editingReportId, payload);
        setCreatedReportId(null);
      } else {
        const response = await scientificReportsApi.createReport(payload);
        setCreatedReportId(response.report_id);
      }

      setSuccess(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        else router.push('/scientific-reports');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow-xl border border-slate-100">
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
          Scientific Reports
        </p>
        <h1 className="text-3xl font-semibold mt-2">
          {editingReportId
            ? 'Edit Scientific Report'
            : 'Submit Scientific Report'}
        </h1>
        <p className="text-sm text-slate-200 mt-2">
          Clear, well-sourced submissions move faster through review.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Submission readiness
            </p>
            <p className="text-sm text-blue-800">
              Complete the required fields and attach evidence to speed review.
            </p>
          </div>
          <div className="text-sm font-semibold text-blue-900">
            {readinessPercent}%
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full bg-blue-600"
            style={{ width: `${readinessPercent}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-blue-900 sm:grid-cols-2">
          {readinessFields.map((field) => (
            <div
              key={field.label}
              className="flex items-center justify-between"
            >
              <span>{field.label}</span>
              <span className="font-medium">
                {typeof field.value === 'string'
                  ? field.value.trim()
                    ? 'Done'
                    : 'Missing'
                  : field.value
                    ? 'Done'
                    : 'Missing'}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span>Evidence attached</span>
            <span className="font-medium">
              {linkedUploadsCount + linkedImages.length} linked
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <p className="text-green-800">
            {editingReportId
              ? 'Report updated successfully. Review updates typically process within 3-5 business days.'
              : 'Report submitted successfully. You will receive a confirmation and review update within 3-5 business days.'}
            {!editingReportId && createdReportId
              ? ` Report ID: ${createdReportId}.`
              : ''}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">
              Quality checklist
            </p>
            <span className="text-xs font-semibold text-slate-700">
              {checklistPercent}%
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Mark what you have ready. This helps reviewers validate the
            submission faster.
          </p>
          <div className="mt-3 space-y-2">
            {qualityChecklist.map((item) => (
              <label
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <span>
                  {item.label}
                  {item.required ? ' *' : ''}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(checklistState[item.label])}
                  onChange={(event) => {
                    setChecklistState((prev) => ({
                      ...prev,
                      [item.label]: event.target.checked,
                    }));
                  }}
                  className="h-4 w-4 rounded"
                />
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            Preview & handoff
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Preview your submission summary before sending it to review.
          </p>
          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Submission preview
          </h2>
          <div className="grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Title
              </p>
              <p className="font-medium">
                {previewValues[0] || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Type
              </p>
              <p className="font-medium">
                {previewValues[2] || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Published
              </p>
              <p className="font-medium">
                {previewValues[3] || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Confidence
              </p>
              <p className="font-medium">
                {previewValues[6] || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Organization
              </p>
              <p className="font-medium">
                {previewValues[4] || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Contact
              </p>
              <p className="font-medium">
                {previewValues[5] || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Time window
              </p>
              <p className="font-medium">
                {previewValues[8] || 'Not provided'}{' '}
                {previewValues[9] ? `to ${previewValues[9]}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Peer reviewed
              </p>
              <p className="font-medium">{previewValues[7] ? 'Yes' : 'No'}</p>
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-700">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Summary
            </p>
            <p className="mt-1 whitespace-pre-wrap">
              {previewValues[1] || 'Not provided'}
            </p>
          </div>
          {metricsValues && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Impact metrics snapshot
              </p>
              <p className="mt-1">
                {metricsValues.peopleAffected
                  ? `${metricsValues.peopleAffected} affected`
                  : 'No metrics provided yet'}
                {metricsValues.peopleDisplaced
                  ? ` · ${metricsValues.peopleDisplaced} displaced`
                  : ''}
                {metricsValues.economicLossUsd
                  ? ` · $${metricsValues.economicLossUsd} loss`
                  : ''}
              </p>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Information */}
        <section className="border-t border-slate-200 pt-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
              1
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Basic Information
              </h2>
              <p className="text-sm text-slate-600">
                Provide the core details reviewers will use to verify the
                report.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="report-title"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Report Title *
              </label>
              <input
                id="report-title"
                {...register('title', { required: 'Title is required' })}
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter report title"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use a concise, descriptive title that matches the publication.
              </p>
              {errors.title && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="report-description"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Description *
              </label>
              <textarea
                id="report-description"
                {...register('description', {
                  required: 'Description is required',
                })}
                rows={5}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Describe your scientific report"
              />
              <p className="text-xs text-gray-500 mt-1">
                Include scope, methods, and key findings in 2-4 sentences.
              </p>
              {errors.description && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="report-type"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Report Type *
                </label>
                <select
                  id="report-type"
                  {...register('reportType', {
                    required: 'Report type is required',
                  })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select type</option>
                  <option value="scientific">Scientific Research</option>
                  <option value="assessment">Impact Assessment</option>
                  <option value="policy">Policy Analysis</option>
                  <option value="research">Field Research</option>
                </select>
                {errors.reportType && (
                  <p className="text-red-600 text-sm mt-1">
                    {errors.reportType.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Choose the category that best matches the publication.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confidence-level"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Confidence Level
                </label>
                <select
                  id="confidence-level"
                  {...register('confidenceLevel')}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="very_high">Very High</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="date-published"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Publication Date *
                </label>
                <input
                  id="date-published"
                  {...register('datePublished', {
                    required: 'Publication date is required',
                  })}
                  type="date"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use the official publication date.
                </p>
                {errors.datePublished && (
                  <p className="text-red-600 text-sm mt-1">
                    {errors.datePublished.message}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 mt-8 text-sm font-medium text-gray-700">
                  <input
                    {...register('peerReviewed')}
                    type="checkbox"
                    className="w-4 h-4 rounded"
                  />
                  Peer Reviewed
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="author-organization"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Author Organization
                </label>
                <input
                  id="author-organization"
                  {...register('authorOrganization')}
                  type="text"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="University, Research Institute, etc."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional, but improves credibility and attribution.
                </p>
              </div>

              <div>
                <label
                  htmlFor="author-contact"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Contact Information
                </label>
                <input
                  id="author-contact"
                  {...register('authorContact')}
                  type="email"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Email or phone number"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional for follow-up questions from reviewers.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Temporal Extent */}
        <section className="border-t border-slate-200 pt-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
              2
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Temporal Extent
              </h2>
              <p className="text-sm text-slate-600">
                Anchor the report in time so evidence can be cross-checked.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="date-start"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Event Start Date
              </label>
              <input
                id="date-start"
                {...register('dateStart')}
                type="date"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use if the report covers a time-bounded event.
              </p>
            </div>

            <div>
              <label
                htmlFor="date-end"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Event End Date
              </label>
              <input
                id="date-end"
                {...register('dateEnd')}
                type="date"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank if ongoing.
              </p>
            </div>
          </div>
        </section>

        {/* Impact Metrics Toggle */}
        <section className="border-t border-slate-200 pt-6">
          <button
            type="button"
            onClick={() => setShowMetrics(!showMetrics)}
            className="flex items-center justify-between w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition"
          >
            <div className="text-left">
              <h2 className="text-xl font-semibold text-slate-900">
                Impact Metrics (Optional)
              </h2>
              <p className="text-sm text-slate-600">
                Add measurable impact to strengthen review confidence.
              </p>
            </div>
            <span className="text-slate-600">{showMetrics ? '▼' : '▶'}</span>
          </button>

          {showMetrics && (
            <div className="mt-4 space-y-6">
              {/* Human Impact */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3">
                  Human Impact
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="people-affected"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      People Affected
                    </label>
                    <input
                      id="people-affected"
                      {...register('metrics.peopleAffected', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Count of people impacted.
                    </p>
                    {errors.metrics?.peopleAffected && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.peopleAffected.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="fatalities"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Fatalities
                    </label>
                    <input
                      id="fatalities"
                      {...register('metrics.fatalities', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Confirmed deaths only.
                    </p>
                    {errors.metrics?.fatalities && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.fatalities.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="people-injured"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Injured
                    </label>
                    <input
                      id="people-injured"
                      {...register('metrics.peopleInjured', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Reported injuries.
                    </p>
                    {errors.metrics?.peopleInjured && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.peopleInjured.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="people-displaced"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Displaced
                    </label>
                    <input
                      id="people-displaced"
                      {...register('metrics.peopleDisplaced', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Temporary or permanent displacement.
                    </p>
                    {errors.metrics?.peopleDisplaced && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.peopleDisplaced.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Infrastructure Impact */}
              <div className="bg-orange-50 p-4 rounded-lg">
                <h3 className="font-semibold text-orange-900 mb-3">
                  Infrastructure Impact
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="buildings-damaged"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Buildings Damaged
                    </label>
                    <input
                      id="buildings-damaged"
                      {...register('metrics.buildingsDamaged', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Structures with partial damage.
                    </p>
                    {errors.metrics?.buildingsDamaged && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.buildingsDamaged.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="buildings-destroyed"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Buildings Destroyed
                    </label>
                    <input
                      id="buildings-destroyed"
                      {...register('metrics.buildingsDestroyed', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Structures beyond repair.
                    </p>
                    {errors.metrics?.buildingsDestroyed && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.buildingsDestroyed.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Economic Impact */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-3">
                  Economic Impact (USD)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="economic-loss"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Economic Loss
                    </label>
                    <input
                      id="economic-loss"
                      {...register('metrics.economicLossUsd', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1000}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Total estimated loss (USD).
                    </p>
                    {errors.metrics?.economicLossUsd && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.economicLossUsd.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="insured-loss"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Insured Loss
                    </label>
                    <input
                      id="insured-loss"
                      {...register('metrics.insuredLossUsd', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1000}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Insured portion only (USD).
                    </p>
                    {errors.metrics?.insuredLossUsd && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.insuredLossUsd.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Environmental Impact */}
              <div className="bg-emerald-50 p-4 rounded-lg">
                <h3 className="font-semibold text-emerald-900 mb-3">
                  Environmental Impact
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="area-affected"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Area Affected (km²)
                    </label>
                    <input
                      id="area-affected"
                      {...register('metrics.areaAffectedKm2', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Approximate area impacted.
                    </p>
                    {errors.metrics?.areaAffectedKm2 && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.areaAffectedKm2.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recovery */}
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-900 mb-3">Recovery</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="recovery-time"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Recovery Time (months)
                    </label>
                    <input
                      id="recovery-time"
                      {...register('metrics.recoveryTimeMonths', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Estimated time to recover.
                    </p>
                    {errors.metrics?.recoveryTimeMonths && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.recoveryTimeMonths.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="recovery-cost"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Recovery Cost (USD)
                    </label>
                    <input
                      id="recovery-cost"
                      {...register('metrics.recoveryCostUsd', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'Must be 0 or greater' },
                      })}
                      type="number"
                      min={0}
                      step={1000}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Projected recovery spend (USD).
                    </p>
                    {errors.metrics?.recoveryCostUsd && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.metrics.recoveryCostUsd.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {linkedUploadsCount > 0 && (
          <section className="border-t border-slate-200 pt-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                4
              </span>
              <h2 className="text-xl font-semibold text-slate-900">
                Linked Citizen Evidence
              </h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {linkedUploadsCount} upload{linkedUploadsCount === 1 ? '' : 's'}{' '}
              linked from the sidebar.
            </p>
            <div className="space-y-2">
              {linkedUploads?.slice(0, 5).map((link, index) => (
                <div
                  key={`${link.contentId}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                >
                  <span>
                    {link.contentType.toUpperCase()} · {link.citationType}
                  </span>
                  <span className="text-gray-500">
                    Relevance {link.relevanceScore}/5
                  </span>
                </div>
              ))}
            </div>
            {linkedUploadsCount > 5 && (
              <p className="text-xs text-gray-500 mt-2">
                Showing 5 of {linkedUploadsCount}. Manage evidence in the
                sidebar.
              </p>
            )}
          </section>
        )}

        {/* Image Tagging Section */}
        <section className="border-t border-slate-200 pt-6">
          <ImageTaggingPanel
            reportId={editingReportId}
            selectedImages={linkedImages}
            onTagsChange={setLinkedImages}
            allowNewTags={true}
          />
        </section>

        {/* Submit Button */}
        <div className="flex gap-4 border-t pt-6">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : editingReportId ? (
              'Save Changes'
            ) : (
              'Submit Report'
            )}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
