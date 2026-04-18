interface StatusBadgeProps {
  status: 'online' | 'offline' | 'unknown';
  showLabel?: boolean;
}

const statusConfig = {
  online: { dot: 'bg-[#3fb950]', bg: 'bg-[#0d3117]', text: 'text-[#3fb950]', label: 'Online' },
  offline: { dot: 'bg-[#f85149]', bg: 'bg-[#3d1116]', text: 'text-[#f85149]', label: 'Offline' },
  unknown: { dot: 'bg-[#d29922]', bg: 'bg-[#3d2e00]', text: 'text-[#d29922]', label: 'Unknown' },
} as const;

export function StatusBadge({ status, showLabel = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span
        data-testid={`status-badge-${status}-dot`}
        className={`inline-block h-1.5 w-1.5 rounded-full ${config.dot}`}
      />
      {showLabel && (
        <span data-testid={`status-badge-${status}-label`}>{config.label}</span>
      )}
    </span>
  );
}
