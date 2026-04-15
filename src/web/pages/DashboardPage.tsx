import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DashboardStats, Scan, Device, PaginatedResponse } from '@shared/types/device.js';
import { useApi } from '../hooks/useApi';
import { MetricCard } from '../components/MetricCard';
import { ScanButton } from '../components/ScanButton';

const CHART_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39d2c0'];

const placeholderTimeSeries = [
  { date: '6d ago', devices: 38 },
  { date: '5d ago', devices: 40 },
  { date: '4d ago', devices: 41 },
  { date: '3d ago', devices: 43 },
  { date: '2d ago', devices: 44 },
  { date: '1d ago', devices: 45 },
  { date: 'Today', devices: 47 },
];

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

function buildVendorData(devices: Device[]) {
  const counts: Record<string, number> = {};
  for (const d of devices) {
    const vendor = d.vendor || 'Unknown';
    counts[vendor] = (counts[vendor] || 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function ApiKeyPrompt({ onSave }: { onSave: (key: string) => void }) {
  const [key, setKey] = useState('');
  return (
    <div data-testid="api-key-prompt" className="max-w-md mx-auto mt-24 bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <h2 className="text-lg font-semibold text-[#e6edf3] mb-2">API Key Required</h2>
      <p className="text-sm text-[#8b949e] mb-4">Enter your NetObserver API key to connect.</p>
      <input
        data-testid="api-key-input"
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Enter API key"
        className="w-full px-3 py-2 rounded-md bg-[#1c2128] border border-[#30363d] text-[#e6edf3] text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#1f6feb]"
      />
      <button
        data-testid="api-key-save"
        onClick={() => {
          if (key.trim()) {
            localStorage.setItem('netobserver-api-key', key.trim());
            onSave(key.trim());
          }
        }}
        className="w-full px-4 py-2 bg-[#1f6feb] text-white rounded-md text-sm font-medium hover:bg-[#388bfd] transition-colors"
      >
        Save & Connect
      </button>
    </div>
  );
}

export function DashboardPage() {
  const api = useApi();
  const [hasApiKey, setHasApiKey] = useState(() => !!localStorage.getItem('netobserver-api-key'));
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, devicesRes, scansRes] = await Promise.allSettled([
        api.getStats(),
        api.getDevices({ limit: 100 }),
        api.getScans({ limit: 5 }),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (devicesRes.status === 'fulfilled') setDevices((devicesRes.value as PaginatedResponse<Device>).data);
      if (scansRes.status === 'fulfilled') setRecentScans((scansRes.value as PaginatedResponse<Scan>).data);

      if (statsRes.status === 'rejected' && devicesRes.status === 'rejected') {
        setError('Failed to load dashboard data. Check your API key and connection.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (hasApiKey) fetchData();
  }, [hasApiKey, fetchData]);

  if (!hasApiKey) {
    return (
      <div data-testid="page-dashboard">
        <ApiKeyPrompt onSave={() => setHasApiKey(true)} />
      </div>
    );
  }

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await api.triggerScan();
      await fetchData();
    } catch (err: any) {
      if (err?.status === 409) {
        setError('A scan is already in progress. Please wait for it to complete.');
      } else {
        setError(err instanceof Error ? err.message : 'Scan failed');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleExport = () => {
    if (devices.length === 0) return;
    const header = 'Name,MAC,IP,Vendor,Status,Last Seen\n';
    const rows = devices.map((d) =>
      [
        d.displayName || d.hostname || 'Unknown',
        d.macAddress,
        d.ipAddress,
        d.vendor || '',
        d.isOnline ? 'Online' : 'Offline',
        d.lastSeenAt,
      ].join(',')
    );
    const csv = header + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devices.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isEmpty = !loading && stats?.totalDevices === 0 && devices.length === 0;
  const vendorData = buildVendorData(devices);

  return (
    <div data-testid="page-dashboard">
      <h1 className="text-2xl font-bold text-[#e6edf3] mb-6">Dashboard</h1>

      {error && (
        <div
          data-testid="alert-banner"
          className="mb-4 px-4 py-3 bg-[#3d1116] border-l-[3px] border-[#f85149] rounded-md text-sm text-[#f85149] flex items-center justify-between"
        >
          <span data-testid="alert-banner-message">{error}</span>
          <button
            data-testid="alert-banner-dismiss"
            onClick={() => setError(null)}
            className="text-[#f85149] hover:text-[#e6edf3] ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {isEmpty ? (
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <span data-testid="empty-state-icon" className="text-5xl mb-4">🔍</span>
          <h2 data-testid="empty-state-title" className="text-xl font-semibold text-[#e6edf3] mb-2">
            No Devices Yet
          </h2>
          <p data-testid="empty-state-message" className="text-sm text-[#8b949e] mb-6 max-w-sm">
            No devices discovered yet. Run your first scan to discover devices on your network!
          </p>
          <button
            data-testid="empty-state-action"
            onClick={handleScan}
            disabled={scanning}
            className="px-6 py-2 bg-[#1f6feb] text-white rounded-md text-sm font-medium hover:bg-[#388bfd] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scanning ? 'Scanning…' : 'Run First Scan'}
          </button>
        </div>
      ) : (
        <>
          {/* Metric Cards */}
          <div
            data-testid="metrics"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          >
            <MetricCard
              metric="total-devices"
              label="Total Devices"
              value={loading ? '—' : stats?.totalDevices ?? 0}
              sub="across all subnets"
              colorClass="text-[#3fb950]"
            />
            <MetricCard
              metric="new-devices"
              label="New (24h)"
              value={loading ? '—' : stats?.newDevices24h ?? 0}
              sub="since yesterday"
              colorClass="text-[#d29922]"
            />
            <MetricCard
              metric="offline-devices"
              label="Offline"
              value={loading ? '—' : stats?.offlineDevices ?? 0}
              sub="not seen in last scan"
              colorClass="text-[#f85149]"
            />
            <MetricCard
              metric="last-scan"
              label="Last Scan"
              value={loading ? '—' : formatTime(stats?.lastScanAt ?? null)}
              badge={
                stats?.lastScanStatus
                  ? {
                      label: stats.lastScanStatus,
                      colorClass:
                        stats.lastScanStatus === 'completed'
                          ? 'bg-[#0d3117] text-[#3fb950]'
                          : stats.lastScanStatus === 'failed'
                            ? 'bg-[#3d1116] text-[#f85149]'
                            : 'bg-[#0d2645] text-[#58a6ff]',
                    }
                  : undefined
              }
              colorClass="text-[#58a6ff]"
            />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
            {/* Left column */}
            <div className="space-y-6">
              {/* Recent Activity */}
              <div
                data-testid="recent-activity"
                className="bg-[#161b22] border border-[#30363d] rounded-lg p-5"
              >
                <h3 className="text-base font-semibold text-[#e6edf3] mb-3">Recent Activity</h3>
                {recentScans.length === 0 && !loading ? (
                  <p className="text-sm text-[#8b949e]">No recent activity.</p>
                ) : (
                  <ul className="space-y-0">
                    {recentScans.map((scan, i) => (
                      <li
                        key={scan.id}
                        data-testid={`activity-item-${i + 1}`}
                        className="flex items-start gap-3 py-2.5 border-b border-[#30363d] last:border-b-0 text-sm"
                      >
                        <span
                          className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            scan.status === 'completed'
                              ? 'bg-[#3fb950]'
                              : scan.status === 'failed'
                                ? 'bg-[#f85149]'
                                : 'bg-[#58a6ff]'
                          }`}
                        />
                        <span className="text-[#e6edf3]">
                          <strong>Scan {scan.status}</strong> — {scan.devicesFound} devices found
                          {scan.newDevices > 0 && `, ${scan.newDevices} new`}
                        </span>
                        <span className="text-[#6e7681] text-xs ml-auto whitespace-nowrap">
                          {formatTime(scan.startedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Device Trend Chart */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
                <h3 className="text-base font-semibold text-[#e6edf3] mb-3">Device Trend</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={placeholderTimeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="date" tick={{ fill: '#6e7681', fontSize: 12 }} axisLine={false} />
                    <YAxis tick={{ fill: '#6e7681', fontSize: 12 }} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#e6edf3',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="devices"
                      stroke="#58a6ff"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#58a6ff' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div
                data-testid="quick-actions"
                className="bg-[#161b22] border border-[#30363d] rounded-lg p-5"
              >
                <h3 className="text-base font-semibold text-[#e6edf3] mb-3">Quick Actions</h3>
                <div className="flex flex-col gap-3">
                  <ScanButton loading={scanning} onClick={handleScan} />
                  <button
                    data-testid="btn-export-devices"
                    onClick={handleExport}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-[#30363d] text-[#e6edf3] bg-transparent hover:border-[#58a6ff] hover:text-[#58a6ff] transition-colors duration-150 w-full"
                  >
                    ↓ Export Devices
                  </button>
                </div>
              </div>

              {/* Network Summary */}
              <div
                data-testid="network-summary"
                className="bg-[#161b22] border border-[#30363d] rounded-lg p-5"
              >
                <h3 className="text-base font-semibold text-[#e6edf3] mb-3">Network Summary</h3>
                <div className="text-sm text-[#8b949e] space-y-3">
                  <NetworkBar
                    label="Online"
                    count={stats ? stats.totalDevices - stats.offlineDevices : 0}
                    total={stats?.totalDevices ?? 1}
                    color="#3fb950"
                  />
                  <NetworkBar
                    label="Offline"
                    count={stats?.offlineDevices ?? 0}
                    total={stats?.totalDevices ?? 1}
                    color="#f85149"
                  />
                  <NetworkBar
                    label="New (24h)"
                    count={stats?.newDevices24h ?? 0}
                    total={stats?.totalDevices ?? 1}
                    color="#d29922"
                  />
                </div>
              </div>

              {/* Vendor Breakdown */}
              {vendorData.length > 0 && (
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
                  <h3 className="text-base font-semibold text-[#e6edf3] mb-3">By Vendor</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={vendorData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {vendorData.map((_entry, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#21262d',
                          border: '1px solid #30363d',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#e6edf3',
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, color: '#8b949e' }}
                        iconSize={8}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NetworkBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.max((count / total) * 100, 1) : 0;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span>{label}</span>
        <span style={{ color }} className="font-semibold">
          {count}
        </span>
      </div>
      <div className="w-full bg-[#30363d] rounded h-2">
        <div className="rounded h-2" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
