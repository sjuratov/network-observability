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
import { useState, useMemo } from 'react';
import type { Device } from '@shared/types/device.js';
import { StatusBadge } from './StatusBadge';
import { TagPill } from './TagPill';

interface DeviceTableProps {
  devices: Device[];
  onRowClick: (device: Device) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  pageSize?: number;
}

function getDeviceStatus(device: Device): 'online' | 'offline' | 'new' {
  if (!device.isKnown) return 'new';
  return device.isOnline ? 'online' : 'offline';
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

export function DeviceTable({ devices, onRowClick, onSelectionChange, pageSize = 10 }: DeviceTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
      header: () => (
        <span data-testid="device-table-sort-status">Status</span>
      ),
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
      header: () => (
        <span data-testid="device-table-sort-name">Name</span>
      ),
      cell: ({ row }) => (
        <span
          data-testid={`device-row-${row.original.id}-name`}
          className="text-[#58a6ff] cursor-pointer hover:underline"
        >
          {row.original.displayName ?? row.original.hostname ?? row.original.macAddress}
        </span>
      ),
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
      header: () => (
        <span data-testid="device-table-sort-ip">IP Address</span>
      ),
      cell: ({ row }) => (
        <span data-testid={`device-row-${row.original.id}-ip`} className="font-mono">
          {row.original.ipAddress}
        </span>
      ),
    },
    {
      id: 'vendor',
      accessorKey: 'vendor',
      header: () => (
        <span data-testid="device-table-sort-vendor">Vendor</span>
      ),
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
      header: () => (
        <span data-testid="device-table-sort-last-seen">Last Seen</span>
      ),
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
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
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
    initialState: {
      pagination: { pageSize },
    },
  });

  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;
  const totalRows = devices.length;
  const from = currentPage * pageSize + 1;
  const to = Math.min((currentPage + 1) * pageSize, totalRows);

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
                    <span className="inline-flex items-center gap-1">
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
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center">
                  <div data-testid="empty-state">
                    <p data-testid="empty-state-title" className="text-lg font-semibold text-[#8b949e]">
                      No Devices Found
                    </p>
                    <p data-testid="empty-state-message" className="text-sm text-[#6e7681] mt-1">
                      No devices match your current filters. Try adjusting your search or filters.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
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

      {totalRows > 0 && (
        <div data-testid="pagination" className="flex items-center justify-between mt-4 text-sm text-[#8b949e]">
          <span data-testid="pagination-info">
            Showing {from}–{to} of {totalRows} devices
          </span>
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
