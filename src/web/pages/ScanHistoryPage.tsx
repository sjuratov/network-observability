import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import type { Scan } from '@shared/types/device.js';

type ScanPageSizeOption = '10' | '25' | '50' | '100' | 'All';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'pending', label: 'Pending' },
];

function formatDuration(startedAt: string, completedAt?: string): string {
  if (!completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const statusStyles: Record<string, string> = {
  completed: 'bg-[#0d3117] text-[#3fb950]',
  failed: 'bg-[#3d1116] text-[#f85149]',
  'in-progress': 'bg-[#0d2645] text-[#58a6ff]',
  pending: 'bg-[#3d2e00] text-[#d29922]',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium uppercase ${statusStyles[status] ?? statusStyles.pending}`}>
      {status === 'in-progress' && (
        <span className="inline-block w-3 h-3 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
      )}
      {status === 'in-progress' ? 'In Progress' : status}
    </span>
  );
}

function buildPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | '...')[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

export function ScanHistoryPage() {
  const api = useApi();
  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState(false);

  // Pagination & filtering
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ScanPageSizeOption>('10');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchAllScans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const scans = await api.getAllScans();
      setAllScans(scans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scans');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getAllScans()
      .then((scans) => {
        if (!cancelled) setAllScans(scans);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [api]);

  const filteredScans = useMemo(() => {
    if (statusFilter === 'all') return allScans;
    return allScans.filter((s) => s.status === statusFilter);
  }, [allScans, statusFilter]);

  const resolvedPageSize = pageSize === 'All'
    ? Math.max(filteredScans.length, 1)
    : Number.parseInt(pageSize, 10);

  const totalPages = Math.max(1, Math.ceil(filteredScans.length / resolvedPageSize));

  // Clamp page when filtered results or pageSize changes
  const clampedPage = Math.min(page, totalPages);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedScans = useMemo(() => {
    const start = (clampedPage - 1) * resolvedPageSize;
    return filteredScans.slice(start, start + resolvedPageSize);
  }, [filteredScans, clampedPage, resolvedPageSize]);

  const from = filteredScans.length === 0 ? 0 : (clampedPage - 1) * resolvedPageSize + 1;
  const to = filteredScans.length === 0 ? 0 : Math.min(clampedPage * resolvedPageSize, filteredScans.length);

  const handleScanNow = async () => {
    try {
      setTriggering(true);
      await api.triggerScan();
      await fetchAllScans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger scan');
    } finally {
      setTriggering(false);
    }
  };

  const toggleRow = (scanId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(scanId)) next.delete(scanId);
      else next.add(scanId);
      return next;
    });
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: ScanPageSizeOption) => {
    setPageSize(value);
    setPage(1);
  };

  return (
    <div data-testid="page-scan-history">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-[#e6edf3]">Scan History</h1>
        <button
          data-testid="btn-scan-now"
          onClick={handleScanNow}
          disabled={triggering}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1f6feb] text-white text-sm font-medium rounded-md hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
        >
          ⟳ {triggering ? 'Starting…' : 'Scan Now'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div data-testid="alert-banner" className="bg-[#3d1116] border border-[#f85149] text-[#f85149] text-sm rounded-md px-4 py-2 mb-4">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div data-testid="scan-history-loading" className="text-center text-[#8b949e] py-12">
          Loading scans…
        </div>
      )}

      {/* Empty state — no scans at all */}
      {!loading && allScans.length === 0 && !error && (
        <div data-testid="empty-state" className="text-center py-16">
          <div data-testid="empty-state-icon" className="text-4xl mb-3">📡</div>
          <h3 data-testid="empty-state-title" className="text-lg font-semibold text-[#e6edf3] mb-1">No Scans Yet</h3>
          <p data-testid="empty-state-message" className="text-sm text-[#8b949e] mb-4">
            Run your first network scan to discover devices.
          </p>
          <button
            data-testid="empty-state-action"
            onClick={handleScanNow}
            className="px-4 py-2 bg-[#1f6feb] text-white text-sm font-medium rounded-md hover:bg-[#388bfd] transition-colors"
          >
            ⟳ Scan Now
          </button>
        </div>
      )}

      {/* Main content — scans exist */}
      {!loading && allScans.length > 0 && (
        <>
          {/* Status filter */}
          <div className="flex items-center gap-3 mb-4">
            <label htmlFor="scan-status-filter" className="text-xs uppercase tracking-wider text-[#6e7681]">
              Status
            </label>
            <select
              id="scan-status-filter"
              data-testid="scan-status-filter"
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="px-2 py-1 rounded-md border border-[#30363d] bg-[#1c2128] text-sm text-[#e6edf3] cursor-pointer focus:outline-none focus:border-[#1f6feb]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Filtered empty state */}
          {filteredScans.length === 0 && (
            <div data-testid="filtered-empty-state" className="text-center py-12">
              <p className="text-sm text-[#8b949e]">No scans match the selected status filter.</p>
            </div>
          )}

          {/* Scan table */}
          {filteredScans.length > 0 && (
            <>
              <table data-testid="scan-history-table" className="w-full border-collapse text-sm">
                <thead>
                  <tr data-testid="scan-history-table-header">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d] w-8" />
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d]">Scan ID</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d]">Start Time</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d]">End Time</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d]">Duration</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d]">Status</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d]">Devices Found</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#8b949e] uppercase tracking-wider border-b border-[#30363d]">New Devices</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedScans.map((scan, idx) => {
                    const isExpanded = expandedRows.has(scan.id);
                    return (
                      <ScanRow
                        key={scan.id}
                        scan={scan}
                        index={idx}
                        isExpanded={isExpanded}
                        onToggle={() => toggleRow(scan.id)}
                      />
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              <div data-testid="pagination" className="mt-4 space-y-2 text-sm text-[#8b949e]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="pagination-page-size" className="text-xs uppercase tracking-wider text-[#6e7681]">
                      Rows per page
                    </label>
                    <select
                      id="pagination-page-size"
                      data-testid="pagination-page-size"
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(e.target.value as ScanPageSizeOption)}
                      className="rounded-md border border-[#30363d] bg-[#1c2128] px-2 py-1 text-sm text-[#e6edf3] focus:border-[#1f6feb] focus:outline-none"
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="All">All</option>
                    </select>
                  </div>
                  <span data-testid="pagination-info">
                    Showing {from}–{to} of {filteredScans.length} scans
                  </span>
                </div>
                {pageSize !== 'All' && totalPages > 1 && (
                  <div className="flex gap-1">
                    <button
                      data-testid="pagination-prev"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={clampedPage <= 1}
                      className="px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    {buildPageNumbers(clampedPage, totalPages).map((p, idx) =>
                      p === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 py-1 text-[#6e7681]">…</span>
                      ) : (
                        <button
                          key={p}
                          data-testid={`pagination-page-${p}`}
                          onClick={() => setPage(p)}
                          className={`px-2 py-1 rounded border text-sm ${
                            clampedPage === p
                              ? 'bg-[#1f6feb] text-white border-[#1f6feb]'
                              : 'border-[#30363d] text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3]'
                          }`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                    <button
                      data-testid="pagination-next"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={clampedPage >= totalPages}
                      className="px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>

              {/* Export actions */}
              <div data-testid="export-actions" className="flex gap-2 justify-end mt-4">
                <button data-testid="export-scans-csv" className="px-3 py-1.5 text-sm border border-[#30363d] rounded-md text-[#e6edf3] hover:border-[#1f6feb] hover:text-[#58a6ff] transition-colors">
                  ↓ Export CSV
                </button>
                <button data-testid="export-scans-json" className="px-3 py-1.5 text-sm border border-[#30363d] rounded-md text-[#e6edf3] hover:border-[#1f6feb] hover:text-[#58a6ff] transition-colors">
                  ↓ Export JSON
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ScanRow({ scan, index, isExpanded, onToggle }: {
  scan: Scan;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const rowBg = index % 2 === 0 ? '' : 'bg-[#161b22]';

  return (
    <>
      <tr
        data-testid={`scan-history-table-row-${scan.id}`}
        onClick={onToggle}
        className={`cursor-pointer hover:bg-[#30363d] ${rowBg}`}
      >
        <td data-testid={`scan-history-table-row-${scan.id}-expand`} className="px-3 py-2 border-b border-[#21262d] text-[#8b949e]">
          {isExpanded ? '▾' : '▸'}
        </td>
        <td className="px-3 py-2 border-b border-[#21262d] font-mono text-xs">{scan.id.slice(0, 8)}</td>
        <td data-testid={`scan-history-table-row-${scan.id}-time`} className="px-3 py-2 border-b border-[#21262d]">{formatTime(scan.startedAt)}</td>
        <td className="px-3 py-2 border-b border-[#21262d]">{scan.completedAt ? formatTime(scan.completedAt) : '—'}</td>
        <td data-testid={`scan-history-table-row-${scan.id}-duration`} className="px-3 py-2 border-b border-[#21262d]">{formatDuration(scan.startedAt, scan.completedAt)}</td>
        <td data-testid={`scan-history-table-row-${scan.id}-status`} className="px-3 py-2 border-b border-[#21262d]">
          <StatusBadge status={scan.status} />
        </td>
        <td data-testid={`scan-history-table-row-${scan.id}-devices`} className="px-3 py-2 border-b border-[#21262d]">{scan.devicesFound}</td>
        <td data-testid={`scan-history-table-row-${scan.id}-new`} className="px-3 py-2 border-b border-[#21262d]">{scan.newDevices}</td>
      </tr>

      {isExpanded && (
        <tr data-testid={`scan-history-table-row-${scan.id}-details`}>
          <td colSpan={8} className="bg-[#0d1117] px-6 py-4 border-b border-[#21262d]">
            {scan.status === 'in-progress' && (
              <div className="text-sm text-[#8b949e]">
                Scan in progress… {scan.devicesFound} devices discovered so far.
              </div>
            )}
            {scan.status === 'failed' && scan.errors.length > 0 && (
              <div className="text-sm text-[#f85149]">
                Error: {scan.errors.join('; ')}
              </div>
            )}
            {scan.status === 'completed' && scan.newDevices === 0 && (
              <div className="text-sm text-[#8b949e]">No new devices or changes detected.</div>
            )}
            {scan.status === 'completed' && scan.newDevices > 0 && (
              <div className="text-sm text-[#8b949e]">
                {scan.newDevices} new device{scan.newDevices !== 1 ? 's' : ''} found. {scan.devicesFound} total.
              </div>
            )}
            {scan.subnetsScanned.length > 0 && (
              <div className="mt-2 text-xs text-[#6e7681]">
                Subnets: {scan.subnetsScanned.join(', ')} · Intensity: {scan.scanIntensity}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
