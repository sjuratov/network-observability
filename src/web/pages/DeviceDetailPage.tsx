import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router';
import type { Device } from '@shared/types/device.js';
import type { DeviceActivityHistory } from '@shared/types/device-detail-activity.js';
import type { DevicePortsSnapshotEntry } from '@shared/types/device-detail-ports.js';
import { useApi } from '../hooks/useApi';
import { StatusBadge } from '../components/StatusBadge';
import { TagPill } from '../components/TagPill';

type TabId = 'overview' | 'activity' | 'ports' | 'tags';

const TABS: { id: TabId; label: string; testId: string }[] = [
  { id: 'overview', label: 'Overview', testId: 'tab-bar-tab-overview' },
  { id: 'activity', label: 'Activity', testId: 'tab-bar-tab-activity' },
  { id: 'ports', label: 'Ports & Services', testId: 'tab-bar-tab-ports' },
  { id: 'tags', label: 'Tags & Notes', testId: 'tab-bar-tab-tags' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function durationBetween(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  const minutes = Math.floor(ms / (1000 * 60));
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

type DevicePortRow = {
  port: number;
  protocol: 'tcp' | 'udp';
  service: string;
  version: string;
  timestamp: string;
};

function renderPortService(entry: DevicePortRow) {
  const serviceName = entry.service || '—';
  if (!entry.version) {
    return serviceName;
  }

  return (
    <div className="space-y-0.5">
      <div>{serviceName}</div>
      <div className="text-xs text-[#8b949e]">{entry.version}</div>
    </div>
  );
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();

  const [device, setDevice] = useState<Device | null>(null);
  const [history, setHistory] = useState<DeviceActivityHistory | null>(null);
  const [portData, setPortData] = useState<DevicePortsSnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Editable fields
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [newTag, setNewTag] = useState('');
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.getDevice(id)
      .then((dev) => {
        if (cancelled) return;
        setDevice(dev);
        setNameValue(dev.displayName ?? dev.hostname ?? dev.macAddress);
        setNotes(dev.notes ?? '');
        fetch(`/api/v1/devices/${id}/ports`, {
          headers: { 'X-API-Key': localStorage.getItem('netobserver-api-key') || '' },
        })
          .then(r => r.json())
          .then(r => { if (!cancelled) setPortData(r.data || []); })
          .catch(() => {});
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, api]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);
    setShowAllActivity(false);

    api.getDeviceHistory(id)
      .then((hist) => {
        if (!cancelled) {
          setHistory(hist);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setHistory(null);
          setActivityError(err.message || 'Unable to load activity history.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setActivityLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [id, api]);

  const saveDevice = useCallback(async (data: Partial<Pick<Device, 'displayName' | 'tags' | 'notes'>>) => {
    if (!id || !device) return;
    try {
      const updated = await api.updateDevice(id, data);
      setDevice(updated);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Save failed');
    }
  }, [id, device, api]);

  const handleNameSave = useCallback(() => {
    setEditingName(false);
    if (nameValue !== (device?.displayName ?? device?.hostname ?? device?.macAddress)) {
      saveDevice({ displayName: nameValue });
    }
  }, [nameValue, device, saveDevice]);

  const handleAddTag = useCallback(() => {
    if (!newTag.trim() || !device) return;
    const updatedTags = [...device.tags, newTag.trim()];
    saveDevice({ tags: updatedTags });
    setNewTag('');
  }, [newTag, device, saveDevice]);

  const handleRemoveTag = useCallback((tag: string) => {
    if (!device) return;
    const updatedTags = device.tags.filter((t) => t !== tag);
    saveDevice({ tags: updatedTags });
  }, [device, saveDevice]);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      saveDevice({ notes: value });
    }, 1500);
  }, [saveDevice]);

  const handleSaveNotes = useCallback(() => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    saveDevice({ notes });
  }, [notes, saveDevice]);

  if (loading) {
    return (
      <div data-testid="page-device-detail" className="flex items-center justify-center py-20">
        <p className="text-[#8b949e]">Loading device…</p>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div data-testid="page-device-detail" className="flex items-center justify-center py-20">
        <p className="text-[#f85149]">Failed to load device: {error ?? 'Not found'}</p>
      </div>
    );
  }

  const deviceName = device.displayName ?? device.hostname ?? device.macAddress;
  const deviceStatus = device.status ?? (device.isOnline ? 'online' : 'offline');
  const activityEvents = history?.activityEvents ?? [];
  const visibleActivityEvents = showAllActivity ? activityEvents : activityEvents.slice(0, 20);
  const hasMoreActivity = activityEvents.length > visibleActivityEvents.length;
  const ipHistory = history?.ipHistory ?? (device.ipAddress ? [{
    ipAddress: device.ipAddress,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
  }] : []);
  const presenceSummary = history?.presenceSummary ?? {
    status: deviceStatus,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    lastChangedAt: null,
    summaryLabel: 'No additional activity recorded yet.',
  };

  // Use port data from dedicated ports endpoint, fallback to history
  const openPorts: DevicePortRow[] = (() => {
    if (portData.length > 0) {
      return portData.filter((p) => p.state === 'open').map((p) => ({
        port: p.port,
        protocol: p.protocol || 'tcp',
        service: p.service || '',
        version: p.version || '',
        timestamp: '',
      }));
    }
    if (!history?.portHistory || history.portHistory.length === 0) return [];
    const portMap = new Map<string, typeof history.portHistory[0]>();
    for (const entry of history.portHistory) {
      const key = `${entry.port}/${entry.protocol}`;
      const existing = portMap.get(key);
      if (!existing || new Date(entry.timestamp) > new Date(existing.timestamp)) {
        portMap.set(key, entry);
      }
    }
    return Array.from(portMap.values())
      .filter((entry) => entry.event === 'opened')
      .map((entry) => ({
        port: entry.port,
        protocol: entry.protocol,
        service: entry.service || '',
        version: '',
        timestamp: entry.timestamp,
      }));
  })();

  return (
    <div data-testid="page-device-detail">
      {/* Breadcrumb */}
      <div data-testid="breadcrumb" className="text-sm text-[#6e7681] mb-4">
        <Link to="/devices" data-testid="breadcrumb-devices" className="text-[#58a6ff] hover:underline">
          Devices
        </Link>
        <span className="mx-1">›</span>
        <span data-testid="breadcrumb-current">{deviceName}</span>
      </div>

      {/* Identity Card */}
      <div
        data-testid="device-identity-card"
        className="rounded-lg border border-[#30363d] bg-[#161b22] p-6 mb-6 flex flex-wrap gap-8 justify-between items-start"
      >
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-3 mb-3">
            {editingName ? (
              <input
                data-testid="device-identity-card-name"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                autoFocus
                className="text-2xl font-bold bg-transparent border-b border-[#1f6feb] text-[#e6edf3] outline-none"
              />
            ) : (
              <h1
                data-testid="device-identity-card-name"
                className="text-2xl font-bold text-[#e6edf3] cursor-pointer hover:text-[#58a6ff]"
                onClick={() => setEditingName(true)}
              >
                {deviceName}
              </h1>
            )}
            <span data-testid="device-identity-card-status">
              <StatusBadge status={deviceStatus} />
            </span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-[#6e7681]">MAC Address</dt>
            <dd data-testid="device-identity-card-mac" className="font-mono text-[#e6edf3]">{device.macAddress}</dd>
            <dt className="text-[#6e7681]">IP Address</dt>
            <dd className="font-mono text-[#e6edf3]">{device.ipAddress}</dd>
            <dt className="text-[#6e7681]">Vendor</dt>
            <dd data-testid="device-identity-card-vendor" className="text-[#e6edf3]">{device.vendor ?? 'Unknown'}</dd>
            {device.hostname && (
              <>
                <dt className="text-[#6e7681]">Hostname</dt>
                <dd data-testid="device-identity-card-hostname" className="font-mono text-[#e6edf3]">{device.hostname}</dd>
              </>
            )}
            <dt className="text-[#6e7681]">Known Device</dt>
            <dd data-testid="device-identity-card-known-flag" className={device.isKnown ? 'text-[#3fb950]' : 'text-[#d29922]'}>
              {device.isKnown ? 'Yes' : 'No'}
            </dd>
            <dt className="text-[#6e7681]">First Seen</dt>
            <dd className="text-[#e6edf3]">{formatDateTime(device.firstSeenAt)}</dd>
            <dt className="text-[#6e7681]">Last Seen</dt>
            <dd className="text-[#e6edf3]">{formatDateTime(device.lastSeenAt)}</dd>
          </dl>
        </div>

        <div className="flex gap-2">
          <button
            data-testid="btn-edit-device"
            onClick={() => setEditingName(true)}
            className="px-3 py-1.5 rounded-md bg-[#1f6feb] text-white text-sm font-medium cursor-pointer hover:bg-[#388bfd]"
          >
            ✎ Edit
          </button>
        </div>
      </div>

      {saveStatus && (
        <p className="text-xs text-[#3fb950] mb-2">{saveStatus}</p>
      )}

      {/* Tabs */}
      <div data-testid="tab-bar" className="flex border-b border-[#30363d] mb-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-testid={tab.testId}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 text-sm cursor-pointer border-b-2 transition-colors duration-150 ${
              activeTab === tab.id
                ? 'text-[#1f6feb] border-[#1f6feb]'
                : 'text-[#8b949e] border-transparent hover:text-[#e6edf3]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}

      {/* Overview */}
      {activeTab === 'overview' && (
        <div data-testid="panel-overview">
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 mb-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Device Identity</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[#6e7681]">Display Name</dt>
              <dd className="text-[#e6edf3]">{deviceName}</dd>
              <dt className="text-[#6e7681]">MAC Address</dt>
              <dd className="font-mono text-[#e6edf3]">{device.macAddress}</dd>
              <dt className="text-[#6e7681]">Current IP</dt>
              <dd className="font-mono text-[#e6edf3]">{device.ipAddress}</dd>
              <dt className="text-[#6e7681]">Vendor / OUI</dt>
              <dd className="text-[#e6edf3]">{device.vendor ?? 'Unknown'}</dd>
              {device.hostname && (
                <>
                  <dt className="text-[#6e7681]">Hostname</dt>
                  <dd className="font-mono text-[#e6edf3]">{device.hostname}</dd>
                </>
              )}
              <dt className="text-[#6e7681]">Known Device</dt>
              <dd className={device.isKnown ? 'text-[#3fb950]' : 'text-[#d29922]'}>{device.isKnown ? 'Yes' : 'No'}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Current State</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[#6e7681]">Status</dt>
              <dd><StatusBadge status={deviceStatus} /></dd>
              <dt className="text-[#6e7681]">First Seen</dt>
              <dd className="text-[#e6edf3]">{formatDateTime(device.firstSeenAt)}</dd>
              <dt className="text-[#6e7681]">Last Seen</dt>
              <dd className="text-[#e6edf3]">{formatDateTime(device.lastSeenAt)}</dd>
              <dt className="text-[#6e7681]">Open Ports</dt>
              <dd className="font-mono text-[#e6edf3]">
                {openPorts.length > 0 ? openPorts.map((p) => p.port).join(', ') : '—'}
              </dd>
              <dt className="text-[#6e7681]">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {device.tags.length > 0
                  ? device.tags.map((t) => <TagPill key={t} tag={t} />)
                  : <span className="text-[#6e7681]">—</span>}
              </dd>
            </dl>
          </div>
        </div>
      )}

      {/* Activity */}
      {activeTab === 'activity' && (
        <div data-testid="panel-activity" className="space-y-5">
          <div data-testid="activity-presence-summary" className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Current Presence</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[#6e7681]">Status</dt>
              <dd><StatusBadge status={presenceSummary.status} /></dd>
              <dt className="text-[#6e7681]">First seen</dt>
              <dd className="text-[#e6edf3]">{formatDateTime(presenceSummary.firstSeenAt)}</dd>
              <dt className="text-[#6e7681]">Last seen</dt>
              <dd className="text-[#e6edf3]">{formatDateTime(presenceSummary.lastSeenAt)}</dd>
              {presenceSummary.lastChangedAt && (
                <>
                  <dt className="text-[#6e7681]">Last status change</dt>
                  <dd className="text-[#e6edf3]">{formatDateTime(presenceSummary.lastChangedAt)}</dd>
                </>
              )}
            </dl>
            {presenceSummary.summaryLabel && (
              <p className="mt-3 text-xs text-[#8b949e]">{presenceSummary.summaryLabel}</p>
            )}
          </div>

          {activityError && (
            <div className="rounded-lg border border-[#f85149] bg-[#2d1117] p-4 text-sm text-[#f85149]">
              Unable to load activity history.
            </div>
          )}

          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">IP Address History</h3>
            <table data-testid="ip-history-table" className="w-full text-sm border-collapse">
              <thead>
                <tr data-testid="ip-history-table-header">
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-[#8b949e] border-b border-[#30363d]">IP Address</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-[#8b949e] border-b border-[#30363d]">First Seen</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-[#8b949e] border-b border-[#30363d]">Last Seen</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-[#8b949e] border-b border-[#30363d]">Duration</th>
                </tr>
              </thead>
              <tbody>
                {ipHistory.length > 0 ? (
                  ipHistory.map((entry, idx) => (
                    <tr
                      key={idx}
                      data-testid={`ip-history-table-row-${idx}`}
                      className={`border-b border-[#21262d] ${idx % 2 === 1 ? 'bg-[#1c2128]' : ''}`}
                    >
                      <td data-testid={`ip-history-table-ip-${idx}`} className="px-3 py-2 font-mono">{entry.ipAddress}</td>
                      <td data-testid={`ip-history-table-first-seen-${idx}`} className="px-3 py-2">{formatDate(entry.firstSeenAt)}</td>
                      <td data-testid={`ip-history-table-last-seen-${idx}`} className="px-3 py-2">{formatDate(entry.lastSeenAt)}</td>
                      <td className="px-3 py-2">{durationBetween(entry.firstSeenAt, entry.lastSeenAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-[#6e7681]">No IP history available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div data-testid="activity-event-feed" className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Recent Activity</h3>
            {activityLoading ? (
              <p className="text-sm text-[#8b949e]">Loading activity…</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {visibleActivityEvents.map((event, index) => (
                    <li key={`${event.timestamp}-${index}`} className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
                      <div className="text-sm text-[#e6edf3]">{event.label}</div>
                      <div className="mt-1 text-xs text-[#8b949e]">{formatDateTime(event.timestamp)}</div>
                    </li>
                  ))}
                </ul>
                {!activityError && visibleActivityEvents.length === 0 && (
                  <div data-testid="activity-empty-state" className="text-sm text-[#8b949e]">
                    No additional activity has been recorded yet.
                  </div>
                )}
                {hasMoreActivity && (
                  <button
                    type="button"
                    onClick={() => setShowAllActivity(true)}
                    className="mt-4 rounded-md border border-[#30363d] px-3 py-1.5 text-sm text-[#e6edf3] hover:border-[#1f6feb] hover:text-[#58a6ff]"
                  >
                    Load more activity
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Ports & Services */}
      {activeTab === 'ports' && (
        <div data-testid="panel-ports">
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Open Ports & Services</h3>
            <table data-testid="port-table" className="w-full text-sm border-collapse">
              <thead>
                <tr data-testid="port-table-header">
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-[#8b949e] border-b border-[#30363d]">Port</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-[#8b949e] border-b border-[#30363d]">Protocol</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-[#8b949e] border-b border-[#30363d]">Service</th>
                </tr>
              </thead>
              <tbody>
                {openPorts.length > 0 ? (
                  openPorts.map((entry, idx) => (
                    <tr
                      key={idx}
                      data-testid={`port-table-row-${idx}`}
                      className={`border-b border-[#21262d] ${idx % 2 === 1 ? 'bg-[#1c2128]' : ''}`}
                    >
                      <td data-testid={`port-table-port-${idx}`} className="px-3 py-2 font-mono">{entry.port}</td>
                      <td data-testid={`port-table-protocol-${idx}`} className="px-3 py-2 uppercase">{entry.protocol}</td>
                      <td data-testid={`port-table-service-${idx}`} className="px-3 py-2">{renderPortService(entry)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-[#6e7681]">No open ports detected</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tags & Notes */}
      {activeTab === 'tags' && (
        <div data-testid="panel-tags">
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 mb-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Tags</h3>
            <div data-testid="device-tags" className="flex flex-wrap gap-2 mb-3">
              {device.tags.map((tag) => (
                <TagPill key={tag} tag={tag} removable onRemove={handleRemoveTag} />
              ))}
              {device.tags.length === 0 && <span className="text-sm text-[#6e7681]">No tags</span>}
            </div>
            <div data-testid="tag-input" className="flex gap-2">
              <input
                data-testid="tag-input-field"
                type="text"
                placeholder="Add tag…"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                className="flex-1 px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#1f6feb]"
              />
              <button
                data-testid="btn-add-tag"
                onClick={handleAddTag}
                className="px-3 py-1.5 rounded-md bg-[#1f6feb] text-white text-sm font-medium cursor-pointer hover:bg-[#388bfd]"
              >
                Add
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Notes</h3>
            <textarea
              data-testid="device-notes"
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add notes about this device…"
              className="w-full min-h-[120px] px-3 py-2 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm placeholder-[#6e7681] resize-y focus:outline-none focus:border-[#1f6feb]"
            />
            <div className="flex justify-end mt-2">
              <button
                data-testid="btn-save-notes"
                onClick={handleSaveNotes}
                className="px-3 py-1.5 rounded-md bg-[#1f6feb] text-white text-sm font-medium cursor-pointer hover:bg-[#388bfd]"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
