import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DashboardStats, Scan, Device, PaginatedResponse } from '@shared/types/device.js';
import { buildBreakdownData } from '../utils/filters';
import type { BreakdownGroupBy } from '../utils/filters';
import { useApi } from '../hooks/useApi';
import { MetricCard } from '../components/MetricCard';
import { ScanButton } from '../components/ScanButton';

const CHART_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39d2c0', '#f97316', '#ec4899'];

const BREAKDOWN_OPTIONS: { value: BreakdownGroupBy; label: string }[] = [
  { value: 'vendor', label: 'By Vendor' },
  { value: 'tag', label: 'By Tag' },
  { value: 'status', label: 'By Status' },
  { value: 'method', label: 'By Discovery Method' },
  { value: 'age', label: 'By Device Age' },
  { value: 'known', label: 'By Known / Unknown' },
];

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
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
  const [breakdownGroupBy, setBreakdownGroupBy] = useState<BreakdownGroupBy>('vendor');

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
        const isAuthError = [statsRes, devicesRes].some(
          (r) => r.status === 'rejected' && (r.reason as any)?.status === 401
        );
        if (isAuthError) {
          localStorage.removeItem('netobserver-api-key');
          setHasApiKey(false);
        } else {
          setError('Failed to load dashboard data. Check your connection.');
        }
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
          (d.status ?? (d.isOnline ? 'online' : 'offline')).replace(/^./, (char) => char.toUpperCase()),
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
  const breakdownData = buildBreakdownData(devices, breakdownGroupBy);

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
          {/* Metric Cards — 5 cards: Total, New, Online, Offline, Last Scan */}
          <div
            data-testid="metrics"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8"
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
              metric="online-devices"
              label="Online"
              value={loading ? '—' : stats?.onlineDevices ?? 0}
              sub="currently online"
              colorClass="text-[#3fb950]"
            />
            <MetricCard
              metric="offline-devices"
              label="Offline"
              value={loading ? '—' : stats?.offlineDevices ?? 0}
              sub="currently offline"
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

          {/* Device Breakdown — full-width bar chart with dropdown */}
          {devices.length > 0 && (
            <div
              data-testid="device-breakdown"
              className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 mb-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-[#e6edf3]">Device Breakdown</h3>
                <select
                  data-testid="breakdown-select"
                  value={breakdownGroupBy}
                  onChange={(e) => setBreakdownGroupBy(e.target.value as BreakdownGroupBy)}
                  className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-[#1f6feb] cursor-pointer"
                >
                  {BREAKDOWN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div data-testid="breakdown-chart">
                <ResponsiveContainer width="100%" height={Math.max(breakdownData.length * 36, 80)}>
                  <BarChart data={breakdownData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fill: '#6e7681', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fill: '#8b949e', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#e6edf3',
                      }}
                      cursor={{ fill: 'rgba(48, 54, 61, 0.3)' }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {breakdownData.map((_entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Two-column layout: Recent Activity + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
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
          </div>
        </>
      )}
    </div>
  );
}
