import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import type { Scan, PaginatedResponse } from '@shared/types/device.js';

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

export function ScanHistoryPage() {
  const api = useApi();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const fetchScans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const cursor = String((page - 1) * pageSize);
      const result: PaginatedResponse<Scan> = await api.getScans({ limit: pageSize, cursor });
      setScans(result.data);
      setTotal(result.meta.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scans');
    } finally {
      setLoading(false);
    }
  }, [api, page, pageSize]);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  const handleScanNow = async () => {
    try {
      setTriggering(true);
      await api.triggerScan();
      await fetchScans();
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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

      {/* Empty state */}
      {!loading && scans.length === 0 && !error && (
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

      {/* Scan table */}
      {!loading && scans.length > 0 && (
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
              {scans.map((scan, idx) => {
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
          <div data-testid="pagination" className="flex items-center justify-between mt-4">
            <span data-testid="pagination-info" className="text-xs text-[#8b949e]">
              Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button
                data-testid="pagination-prev"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 text-sm border border-[#30363d] rounded-md text-[#e6edf3] hover:border-[#1f6feb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  data-testid={`pagination-page-${p}`}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    p === page
                      ? 'bg-[#1f6feb] text-white'
                      : 'border border-[#30363d] text-[#e6edf3] hover:border-[#1f6feb]'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                data-testid="pagination-next"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 text-sm border border-[#30363d] rounded-md text-[#e6edf3] hover:border-[#1f6feb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
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
