import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { Device, FilterParams } from '@shared/types/device.js';
import { useApi } from '../hooks/useApi';
import { searchDevices, filterDevices } from '../utils/filters';
import { isNewLifecycleDevice } from '../utils/deviceLifecycle';
import { DeviceTable } from '../components/DeviceTable';

const STATUS_OPTIONS = ['all', 'online', 'offline', 'new'] as const;
type PageSizeOption = '10' | '25' | '50' | '100' | 'All';

function getUniqueVendors(devices: Device[]): string[] {
  const set = new Set(devices.map((d) => d.vendor ?? 'Unknown'));
  return Array.from(set).sort();
}

function getUniqueTags(devices: Device[]): string[] {
  const set = new Set(devices.flatMap((d) => d.tags));
  return Array.from(set).sort();
}

function exportData(devices: Device[], format: 'csv' | 'json') {
  let content: string;
  let mime: string;
  let ext: string;

  if (format === 'json') {
    content = JSON.stringify(devices, null, 2);
    mime = 'application/json';
    ext = 'json';
  } else {
      const headers = ['ID', 'Name', 'MAC', 'IP', 'Vendor', 'Status', 'Tags', 'First Seen', 'Last Seen'];
      const rows = devices.map((d) => [
        d.id, d.displayName ?? '', d.macAddress, d.ipAddress,
        d.vendor ?? '', (d.status ?? (d.isOnline ? 'online' : 'offline')).replace(/^./, (char) => char.toUpperCase()),
        d.tags.join(';'), d.firstSeenAt, d.lastSeenAt,
      ]);
    content = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    mime = 'text/csv';
    ext = 'csv';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `devices.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeviceListPage() {
  const navigate = useNavigate();
  const api = useApi();

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeOption>('10');
  const [pageSizeError, setPageSizeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getAllDevices()
      .then((res) => {
        if (!cancelled) setDevices(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [api]);

  const refreshAllDevices = useCallback(async () => {
    const refreshedDevices = await api.getAllDevices();
    setDevices(refreshedDevices);
  }, [api]);

  const filteredDevices = useMemo(() => {
    let result = devices;

    if (searchQuery) {
      result = searchDevices(result, searchQuery);
    }

    const filters: FilterParams = {};
    if (statusFilter === 'online') filters.status = 'online';
    if (statusFilter === 'offline') filters.status = 'offline';
    if (tagFilter) filters.tag = tagFilter;
    if (vendorFilter) filters.vendor = vendorFilter;

    result = filterDevices(result, filters);

    // "New" status filter — devices that are not known
    if (statusFilter === 'new') {
      result = result.filter((d) => isNewLifecycleDevice(d));
    }

    return result;
  }, [devices, searchQuery, statusFilter, tagFilter, vendorFilter]);

  const vendors = useMemo(() => getUniqueVendors(devices), [devices]);
  const tags = useMemo(() => getUniqueTags(devices), [devices]);

  const handleRowClick = useCallback((device: Device) => {
    navigate(`/devices/${device.id}`);
  }, [navigate]);

  const handlePageSizeChange = useCallback(async (nextPageSize: PageSizeOption) => {
    if (nextPageSize === pageSize) {
      return;
    }

    const previousPageSize = pageSize;
    setPageSizeError(null);

    if (nextPageSize !== 'All') {
      setPageSize(nextPageSize);
      return;
    }

    try {
      await refreshAllDevices();
      setPageSize('All');
    } catch {
      setPageSize(previousPageSize);
      setPageSizeError('Unable to load all devices right now. Try again in a moment.');
    }
  }, [pageSize, refreshAllDevices]);

  const resolvedPageSize = pageSize === 'All'
    ? Math.max(filteredDevices.length, 1)
    : Number.parseInt(pageSize, 10);

  if (loading) {
    return (
      <div data-testid="page-device-list" className="flex items-center justify-center py-20">
        <p className="text-[#8b949e]">Loading devices…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="page-device-list" className="flex items-center justify-center py-20">
        <p className="text-[#f85149]">Failed to load devices: {error}</p>
      </div>
    );
  }

  return (
    <div data-testid="page-device-list">
      {/* Header + Search */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <h2 className="text-xl font-bold text-[#e6edf3]">Devices</h2>
        <div data-testid="search-bar" className="flex-1 min-w-[220px] relative">
          <input
            type="text"
            data-testid="search-bar-input"
            placeholder="Search by name, MAC, IP, vendor, tag…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-[#30363d] bg-[#1c2128] text-[#e6edf3] text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#1f6feb]"
          />
          {searchQuery && (
            <button
              data-testid="search-bar-clear"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-[#e6edf3] cursor-pointer"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div data-testid="filter-chips" className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs text-[#6e7681]">Status:</span>
        <div data-testid="filter-chips-status" className="flex gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              data-testid={`filter-chips-status-${s}`}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs border cursor-pointer transition-colors duration-150 ${
                statusFilter === s
                  ? 'bg-[#1f6feb] text-white border-[#1f6feb]'
                  : 'border-[#30363d] text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3]'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <select
          data-testid="filter-chips-tag"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="px-2 py-1 rounded-md border border-[#30363d] bg-[#1c2128] text-xs text-[#8b949e] cursor-pointer focus:outline-none focus:border-[#1f6feb]"
        >
          <option value="">Tags ▾</option>
          {tags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          data-testid="filter-chips-vendor"
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="px-2 py-1 rounded-md border border-[#30363d] bg-[#1c2128] text-xs text-[#8b949e] cursor-pointer focus:outline-none focus:border-[#1f6feb]"
        >
          <option value="">Vendor ▾</option>
          {vendors.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        {(statusFilter !== 'all' || tagFilter || vendorFilter) && (
          <button
            data-testid="filter-chips-clear"
            onClick={() => { setStatusFilter('all'); setTagFilter(''); setVendorFilter(''); }}
            className="px-2 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3] cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div
          data-testid="bulk-action-bar"
          className="flex items-center gap-3 mb-4 px-4 py-2 rounded-lg border border-[#1f6feb] bg-[#161b22] text-sm"
        >
          <span data-testid="bulk-action-bar-count" className="text-[#1f6feb] font-semibold">
            {selectedIds.length} selected
          </span>
          <button
            data-testid="bulk-action-bar-tag"
            className="px-3 py-1 rounded-md bg-[#1f6feb] text-white text-xs font-medium cursor-pointer hover:bg-[#388bfd]"
          >
            Tag Selected
          </button>
          <button
            data-testid="bulk-action-bar-export"
            className="px-3 py-1 rounded-md border border-[#30363d] text-[#e6edf3] text-xs font-medium cursor-pointer hover:border-[#1f6feb] hover:text-[#1f6feb]"
          >
            Export Selected
          </button>
          <button
            data-testid="bulk-action-bar-clear"
            onClick={() => setSelectedIds([])}
            className="px-3 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3] cursor-pointer"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Device count */}
      <p data-testid="device-table-row-count" className="text-xs text-[#8b949e] mb-2">
        {filteredDevices.length} devices
      </p>

      {/* Table */}
      <DeviceTable
        devices={filteredDevices}
        onRowClick={handleRowClick}
        onSelectionChange={setSelectedIds}
        pageSize={resolvedPageSize}
        pageSizeSelection={pageSize}
        onPageSizeChange={handlePageSizeChange}
        pageSizeError={pageSizeError}
      />

      {/* Export */}
      <div data-testid="export-actions" className="flex justify-end gap-2 mt-4">
        <button
          data-testid="export-button-csv"
          onClick={() => exportData(filteredDevices, 'csv')}
          className="px-3 py-1.5 rounded-md border border-[#30363d] text-[#e6edf3] text-xs font-medium cursor-pointer hover:border-[#1f6feb] hover:text-[#1f6feb]"
        >
          ↓ Export CSV
        </button>
        <button
          data-testid="export-button-json"
          onClick={() => exportData(filteredDevices, 'json')}
          className="px-3 py-1.5 rounded-md border border-[#30363d] text-[#e6edf3] text-xs font-medium cursor-pointer hover:border-[#1f6feb] hover:text-[#1f6feb]"
        >
          ↓ Export JSON
        </button>
      </div>
    </div>
  );
}
