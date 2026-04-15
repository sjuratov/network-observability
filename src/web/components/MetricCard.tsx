interface MetricCardProps {
  metric: string;
  label: string;
  value: string | number;
  sub?: string;
  colorClass?: string;
  badge?: { label: string; colorClass: string };
}

const sizeClass = (metric: string) =>
  metric === 'last-scan' ? 'text-xl' : 'text-[2rem]';

export function MetricCard({
  metric,
  label,
  value,
  sub,
  colorClass = 'text-[#58a6ff]',
  badge,
}: MetricCardProps) {
  return (
    <div
      data-testid={`metric-card-${metric}`}
      className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 hover:bg-[#30363d] transition-colors duration-150 cursor-pointer"
    >
      <div
        data-testid={`metric-card-${metric}-label`}
        className="text-xs uppercase tracking-wide text-[#8b949e] mb-1"
      >
        {label}
      </div>
      <div
        data-testid={`metric-card-${metric}-value`}
        className={`${sizeClass(metric)} font-bold leading-tight ${colorClass}`}
      >
        {value}
      </div>
      {(sub || badge) && (
        <div
          data-testid={`metric-card-${metric}-trend`}
          className="text-xs text-[#6e7681] mt-1 flex items-center gap-2"
        >
          {badge && (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[0.7rem] font-semibold uppercase ${badge.colorClass}`}
            >
              {badge.label}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}
