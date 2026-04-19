import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  flexRender,
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import type { Device } from '@shared/types/device.js';
import { StatusBadge } from './StatusBadge';
import { TagPill } from './TagPill';
import { isNewLifecycleDevice } from '../utils/deviceLifecycle';

interface DeviceTableProps {
  devices: Device[];
  onRowClick: (device: Device) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  pageSize?: number;
  pageSizeSelection?: '10' | '25' | '50' | '100' | 'All';
  onPageSizeChange?: (value: '10' | '25' | '50' | '100' | 'All') => void;
  pageSizeError?: string | null;
}

function getDeviceStatus(device: Device): 'online' | 'offline' | 'unknown' {
  return device.status ?? (device.isOnline ? 'online' : 'offline');
}

function getDeviceLifecycleLabel(device: Device): string | null {
  return isNewLifecycleDevice(device) ? 'New' : null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getSortHeaderTestId(columnId: string): string | undefined {
  switch (columnId) {
    case 'status':
      return 'device-table-sort-status';
    case 'name':
      return 'device-table-sort-name';
    case 'ip':
      return 'device-table-sort-ip';
    case 'vendor':
      return 'device-table-sort-vendor';
    case 'lastSeen':
      return 'device-table-sort-last-seen';
    default:
      return undefined;
  }
}

export function DeviceTable({
  devices,
  onRowClick,
  onSelectionChange,
  pageSize = 10,
  pageSizeSelection = '10',
  onPageSizeChange,
  pageSizeError = null,
}: DeviceTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize,
  });

  useEffect(() => {
    setPagination(() => ({
      pageIndex: 0,
      pageSize,
    }));
  }, [pageSize, devices.length]);

  const columns = useMemo<ColumnDef<Device, unknown>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          data-testid="device-table-select-all"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          className="accent-[#1f6feb] h-4 w-4 cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          data-testid={`device-row-${row.original.id}-checkbox`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="accent-[#1f6feb] h-4 w-4 cursor-pointer"
        />
      ),
      enableSorting: false,
      size: 40,
    },
    {
      id: 'status',
      accessorFn: (row) => getDeviceStatus(row),
      header: 'Status',
      cell: ({ row }) => (
        <span data-testid={`device-row-${row.original.id}-status`}>
          <StatusBadge status={getDeviceStatus(row.original)} showLabel={false} />
        </span>
      ),
      size: 60,
    },
    {
      id: 'name',
      accessorFn: (row) => row.displayName ?? row.hostname ?? row.macAddress,
      header: 'Name',
      cell: ({ row }) => {
        const lifecycleLabel = getDeviceLifecycleLabel(row.original);
        return (
          <div className="flex items-center gap-2">
            <span
              data-testid={`device-row-${row.original.id}-name`}
              className="text-[#58a6ff] cursor-pointer hover:underline"
            >
              {row.original.displayName ?? row.original.hostname ?? row.original.macAddress}
            </span>
            {lifecycleLabel && (
              <span
                data-testid={`device-row-${row.original.id}-lifecycle-label`}
                className="inline-flex items-center rounded-full border border-[#d29922]/40 bg-[#3d2e00] px-2 py-0.5 text-xs font-medium text-[#d29922]"
              >
                {lifecycleLabel}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'mac',
      accessorKey: 'macAddress',
      header: 'MAC Address',
      cell: ({ row }) => (
        <span data-testid={`device-row-${row.original.id}-mac`} className="font-mono">
          {row.original.macAddress}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'ip',
      accessorKey: 'ipAddress',
      header: 'IP Address',
      cell: ({ row }) => (
        <span data-testid={`device-row-${row.original.id}-ip`} className="font-mono">
          {row.original.ipAddress}
        </span>
      ),
    },
    {
      id: 'vendor',
      accessorKey: 'vendor',
      header: 'Vendor',
      cell: ({ row }) => (
        <span data-testid={`device-row-${row.original.id}-vendor`}>
          {row.original.vendor ?? 'Unknown'}
        </span>
      ),
    },
    {
      id: 'tags',
      accessorFn: (row) => row.tags.join(','),
      header: 'Tags',
      cell: ({ row }) => (
        <span data-testid={`device-row-${row.original.id}-tags`} className="flex flex-wrap gap-1">
          {row.original.tags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'firstSeen',
      accessorKey: 'firstSeenAt',
      header: 'First Seen',
      cell: ({ row }) => formatDate(row.original.firstSeenAt),
    },
    {
      id: 'lastSeen',
      accessorKey: 'lastSeenAt',
      header: 'Last Seen',
      cell: ({ row }) => (
        <span data-testid={`device-row-${row.original.id}-last-seen`}>
          {formatDateTime(row.original.lastSeenAt)}
        </span>
      ),
    },
  ], []);

  const table = useReactTable({
    data: devices,
    columns,
    state: { sorting, rowSelection, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      if (onSelectionChange) {
        const selectedIds = Object.keys(next)
          .filter((k) => next[k])
          .map((idx) => devices[Number(idx)]?.id)
          .filter(Boolean) as string[];
        onSelectionChange(selectedIds);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  const pageCount = table.getPageCount();
  const currentPage = pagination.pageIndex;
  const totalRows = devices.length;
  const from = totalRows === 0 ? 0 : currentPage * pagination.pageSize + 1;
  const to = totalRows === 0 ? 0 : Math.min((currentPage + 1) * pagination.pageSize, totalRows);

  return (
    <div>
      <div className="overflow-x-auto">
        <table data-testid="device-table" className="w-full border-collapse text-sm">
          <thead>
            <tr data-testid="device-table-header">
              {table.getHeaderGroups().map((hg) =>
                hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wider text-[#8b949e] border-b border-[#30363d] cursor-pointer select-none"
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                      <span
                        data-testid={getSortHeaderTestId(header.column.id)}
                        className="inline-flex items-center gap-1"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && ' ▲'}
                        {header.column.getIsSorted() === 'desc' && ' ▼'}
                    </span>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody data-testid="device-table-body">
            {table.getRowModel().rows.length === 0 ? null : (
              table.getRowModel().rows.map((row, idx) => (
                <tr
                  key={row.id}
                  data-testid={`device-row-${row.original.id}`}
                  onClick={() => onRowClick(row.original)}
                  className={`cursor-pointer border-b border-[#21262d] transition-colors duration-150 hover:bg-[#30363d] ${
                    idx % 2 === 1 ? 'bg-[#1c2128]' : ''
                  } ${row.getIsSelected() ? 'bg-[#1b4b91]/30' : ''}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {table.getRowModel().rows.length === 0 && (
        <div data-testid="empty-state" className="px-3 py-12 text-center">
          <p data-testid="empty-state-title" className="text-lg font-semibold text-[#8b949e]">
            No Devices Found
          </p>
          <p data-testid="empty-state-message" className="text-sm text-[#6e7681] mt-1">
            No devices match your current filters. Try adjusting your search or filters.
          </p>
        </div>
      )}

      {totalRows > 0 && (
        <div data-testid="pagination" className="mt-4 space-y-2 text-sm text-[#8b949e]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="pagination-page-size" className="text-xs uppercase tracking-wider text-[#6e7681]">
                Rows per page
              </label>
              <select
                id="pagination-page-size"
                data-testid="pagination-page-size"
                value={pageSizeSelection}
                onChange={(event) => onPageSizeChange?.(event.target.value as '10' | '25' | '50' | '100' | 'All')}
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
              Showing {from}-{to} of {totalRows} devices
            </span>
          </div>
          {pageSizeError && (
            <p data-testid="pagination-page-size-error" className="text-sm text-[#f85149]">
              {pageSizeError}
            </p>
          )}
          <div className="flex gap-1">
            <button
              data-testid="pagination-prev"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                data-testid={`pagination-page-${i + 1}`}
                onClick={() => table.setPageIndex(i)}
                className={`px-2 py-1 rounded border text-sm ${
                  currentPage === i
                    ? 'bg-[#1f6feb] text-white border-[#1f6feb]'
                    : 'border-[#30363d] text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3]'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              data-testid="pagination-next"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
