'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { HAZARD_TYPE_LABELS, UserUpload } from '@/lib/types';
import { Button, Card, Select } from '@/components/design-system';
import { Loader2, Grid, List, Filter, RefreshCcw, Search, AlertTriangle, Trash2, MapPin, PenLine } from 'lucide-react';

type ViewMode = 'grid' | 'list';
type SortOption = 'newest' | 'oldest' | 'status' | 'hazard';

interface MyUploadsProps {
  uploads: UserUpload[];
  isLoading?: boolean;
  hazardOptions?: { id: string; label: string }[];
  onRefresh?: () => void;
  onUpdateMetadata: (id: string, updates: Partial<UserUpload>) => Promise<void> | void;
  onDelete: (ids: string[]) => Promise<void> | void;
  onExportMetadata?: (ids: string[]) => void;
  onUndoDelete?: (ids: string[]) => Promise<void> | void;
}

interface EditForm {
  title?: string;
  abstract?: string;
  keywords?: string;
  latitude?: string;
  longitude?: string;
}

const statusClasses: Record<UserUpload['approval_status'], string> = {
  approved: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20',
  pending_review: 'bg-amber-500/15 text-amber-100 border border-amber-400/20',
  rejected: 'bg-coral-500/15 text-coral-200 border border-coral-400/20',
  flagged: 'bg-rose-500/15 text-rose-200 border border-rose-400/20',
};

const glassCard = 'rounded-3xl border border-white/10 bg-white/5 backdrop-blur shadow-xl';

export default function MyUploads({
  uploads,
  isLoading,
  hazardOptions,
  onRefresh,
  onUpdateMetadata,
  onDelete,
  onExportMetadata,
  onUndoDelete,
}: MyUploadsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    query: '',
    hazard: 'all',
    status: 'all',
  });
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const filteredUploads = useMemo(() => {
    const query = filters.query.toLowerCase();
    let data = uploads.filter((upload) => {
      const matchesQuery =
        upload.title?.toLowerCase().includes(query) ||
        upload.filename.toLowerCase().includes(query) ||
        upload.location?.toLowerCase().includes(query) ||
        upload.hazard_type.toLowerCase().includes(query);

      const matchesHazard = filters.hazard === 'all' || upload.hazard_type === filters.hazard;
      const matchesStatus = filters.status === 'all' || upload.approval_status === filters.status;
      return matchesQuery && matchesHazard && matchesStatus;
    });

    data = data.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
        case 'status':
          return a.approval_status.localeCompare(b.approval_status);
        case 'hazard':
          return a.hazard_type.localeCompare(b.hazard_type);
        case 'newest':
        default:
          return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
      }
    });

    return data;
  }, [uploads, filters, sortBy]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUploads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUploads.map((upload) => upload.id)));
    }
  };

  const beginEdit = (upload: UserUpload) => {
    setEditingId(upload.id);
    setEditForm({
      title: upload.title || '',
      abstract: upload.abstract || '',
      keywords: upload.keywords?.join(', ') || '',
      latitude: upload.latitude?.toString() || '',
      longitude: upload.longitude?.toString() || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (upload: UserUpload) => {
    const payload: Partial<UserUpload> = {
      title: editForm.title?.trim(),
      abstract: editForm.abstract?.trim(),
      keywords: editForm.keywords
        ? editForm.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean)
        : [],
      latitude: editForm.latitude ? parseFloat(editForm.latitude) : undefined,
      longitude: editForm.longitude ? parseFloat(editForm.longitude) : undefined,
    };
    await onUpdateMetadata(upload.id, payload);
    toast.success('Metadata updated');
    cancelEdit();
  };

  const handleDelete = async () => {
    await onDelete(Array.from(selectedIds));
    setShowDeleteModal(false);
    toast.success('Uploads scheduled for deletion', {
      description: 'Files will remain recoverable for 7 days.',
      action: onUndoDelete
        ? {
            label: 'Undo',
            onClick: () => onUndoDelete(Array.from(selectedIds)),
          }
        : undefined,
    });
    setSelectedIds(new Set());
  };

  const renderToolbar = () => (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={clsx('text-white/70', viewMode === 'grid' && 'bg-white/15 text-white')}
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={clsx('text-white/70', viewMode === 'list' && 'bg-white/15 text-white')}
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          <Search className="h-4 w-4" />
          <input
            type="text"
            placeholder="Search uploads"
            value={filters.query}
            onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
            className="bg-transparent text-white placeholder-white/40 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          <Filter className="h-4 w-4" aria-hidden="true" />
          <Select
            value={filters.hazard}
            onChange={(event) => setFilters((prev) => ({ ...prev, hazard: event.target.value }))}
            variant="dark"
            size="sm"
            fullWidth={false}
            aria-label="Filter by hazard type"
            className="bg-transparent border-0 h-auto px-0 py-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          >
            <option value="all">All hazards</option>
            {hazardOptions?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <Select
          value={filters.status}
          onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          variant="dark"
          size="sm"
          fullWidth={false}
          aria-label="Filter by approval status"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending review</option>
          <option value="rejected">Rejected</option>
          <option value="flagged">Flagged</option>
        </Select>

        <Select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortOption)}
          variant="dark"
          size="sm"
          fullWidth={false}
          aria-label="Sort uploads by"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="status">Status</option>
          <option value="hazard">Hazard type</option>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="bg-white/10 text-white hover:bg-white/20"
          onClick={onRefresh}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={selectedIds.size === 0}
          onClick={() => onExportMetadata?.(Array.from(selectedIds))}
          className="bg-white/10 text-white hover:bg-white/20 disabled:bg-white/5 disabled:text-white/40"
        >
          Export Metadata
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={selectedIds.size === 0}
          className="bg-white/10 text-white hover:bg-white/20 disabled:bg-white/5 disabled:text-white/40"
        >
          Change Hazard Type
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={selectedIds.size === 0}
          onClick={() => setShowDeleteModal(true)}
          className="bg-coral-500/20 text-coral-200 hover:bg-coral-500/30 disabled:bg-white/5 disabled:text-white/40"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );

  const renderGridCard = (upload: UserUpload) => (
    <Card key={upload.id} className={`${glassCard} border-white/5`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selectedIds.has(upload.id)}
          onChange={() => toggleSelect(upload.id)}
          className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-pacific-400 focus:ring-pacific-400"
          aria-label={`Select ${upload.title || upload.filename}`}
        />
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-white/60">{format(new Date(upload.uploaded_at), 'PPpp')}</p>
              <h3 className="text-lg font-semibold text-white">{upload.title || upload.filename}</h3>
              <p className="text-sm text-white/60">
                {HAZARD_TYPE_LABELS[upload.hazard_type] || upload.hazard_type} • {upload.location || 'Unknown location'}
              </p>
            </div>
            <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold', statusClasses[upload.approval_status])}>
              {upload.approval_status.replace('_', ' ')}
            </span>
          </div>

          {editingId === upload.id ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs uppercase tracking-wide text-white/50">
                  Title
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pacific-400"
                  />
                </label>
                <label className="text-xs uppercase tracking-wide text-white/50">
                  Keywords
                  <input
                    type="text"
                    value={editForm.keywords}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, keywords: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pacific-400"
                    placeholder="Comma separated"
                  />
                </label>
              </div>
              <label className="text-xs uppercase tracking-wide text-white/50">
                Description
                <textarea
                  value={editForm.abstract}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, abstract: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pacific-400"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs uppercase tracking-wide text-white/50">
                  Latitude
                  <input
                    type="number"
                    value={editForm.latitude}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, latitude: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pacific-400"
                  />
                </label>
                <label className="text-xs uppercase tracking-wide text-white/50">
                  Longitude
                  <input
                    type="number"
                    value={editForm.longitude}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, longitude: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pacific-400"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 text-sm">
                <Button type="button" variant="secondary" size="sm" className="bg-white/10 text-white" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="bg-pacific-500 text-white hover:bg-pacific-400" onClick={() => saveEdit(upload)}>
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-white/70 line-clamp-3">{upload.abstract || 'No description provided.'}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                {upload.keywords?.slice(0, 4).map((keyword) => (
                  <span key={keyword} className="rounded-full bg-white/10 px-3 py-1">
                    #{keyword}
                  </span>
                ))}
                {upload.latitude && upload.longitude && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-pacific-300" />
                    {upload.latitude.toFixed(2)}, {upload.longitude.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex justify-end gap-2 text-sm">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="bg-white/10 text-white"
                  onClick={() => beginEdit(upload)}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  Edit Metadata
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );

  const renderListRow = (upload: UserUpload) => (
    <tr key={upload.id} className="border-b border-white/5">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selectedIds.has(upload.id)}
          onChange={() => toggleSelect(upload.id)}
          className="h-4 w-4 rounded border-white/20 bg-transparent text-pacific-400 focus:ring-pacific-400"
          aria-label={`Select ${upload.title || upload.filename}`}
        />
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-white">{upload.title || upload.filename}</p>
          <p className="text-xs text-white/60">{format(new Date(upload.uploaded_at), 'PPpp')}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-white/70">{upload.location || '—'}</td>
      <td className="px-4 py-3 text-sm text-white/70">{HAZARD_TYPE_LABELS[upload.hazard_type] || upload.hazard_type}</td>
      <td className="px-4 py-3">
        <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold', statusClasses[upload.approval_status])}>
          {upload.approval_status.replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-sm">
        {editingId === upload.id ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" className="bg-white/10 text-white" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="bg-pacific-500 text-white hover:bg-pacific-400" onClick={() => saveEdit(upload)}>
              Save
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="bg-white/10 text-white"
            onClick={() => beginEdit(upload)}
          >
            Edit
          </Button>
        )}
      </td>
    </tr>
  );

  return (
    <section className="space-y-4">
      {renderToolbar()}

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-pacific-500/30 bg-pacific-900/20 px-4 py-2 text-sm text-white">
          <div>
            <strong>{selectedIds.size}</strong> uploads selected
          </div>
          <button className="text-white/80 underline" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin text-pacific-300" />
          Loading uploads…
        </div>
      ) : filteredUploads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/20 bg-white/5 p-10 text-center text-white/70">
          <AlertTriangle className="h-8 w-8 text-amber-300" />
          <p>No uploads match the current filters.</p>
          <Button
            type="button"
            variant="secondary"
            className="bg-white/10 text-white hover:bg-white/20"
            onClick={() => setFilters({ query: '', hazard: 'all', status: 'all' })}
          >
            Reset Filters
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2">{filteredUploads.map(renderGridCard)}</div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full text-sm text-white/80">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/50">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredUploads.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-white/20 bg-transparent text-pacific-400 focus:ring-pacific-400"
                    aria-label="Select all uploads"
                  />
                </th>
                <th className="px-4 py-3">Upload</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Hazard</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>{filteredUploads.map(renderListRow)}</tbody>
          </table>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md space-y-4 rounded-3xl border border-white/10 bg-deep-950 p-6 text-white shadow-2xl">
            <h3 className="text-2xl font-semibold text-white">Confirm deletion</h3>
            <p className="text-sm text-white/70">
              {selectedIds.size} upload{selectedIds.size > 1 ? 's' : ''} will be moved to the recycle bin for 7 days. You
              can undo this action during that period.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="bg-white/10 text-white"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-coral-500 text-white hover:bg-coral-400"
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
