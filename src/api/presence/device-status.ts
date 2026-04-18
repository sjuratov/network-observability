import type BetterSqlite3 from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { PresenceStatus } from './tracker.js';

export const DEFAULT_PRESENCE_OFFLINE_THRESHOLD = 2;

export interface DevicePresenceSnapshot {
  is_online: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_scan_count?: number | null;
  missed_scan_count?: number | null;
}

function hasColumn(raw: BetterSqlite3.Database, columnName: string): boolean {
  const columns = raw.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

export function buildDeviceSelectClause(
  raw: BetterSqlite3.Database,
  offlineThreshold = DEFAULT_PRESENCE_OFFLINE_THRESHOLD,
): string {
  const seenScanCountExpr = hasColumn(raw, 'seen_scan_count')
    ? 'devices.seen_scan_count AS seen_scan_count'
    : "CASE WHEN devices.first_seen_at IS NOT NULL AND devices.last_seen_at IS NOT NULL AND devices.first_seen_at = devices.last_seen_at THEN 1 ELSE 2 END AS seen_scan_count";
  const missedScanCountExpr = hasColumn(raw, 'missed_scan_count')
    ? 'devices.missed_scan_count AS missed_scan_count'
    : `CASE
         WHEN devices.is_online = 1 THEN 0
         WHEN devices.first_seen_at IS NOT NULL AND devices.last_seen_at IS NOT NULL AND devices.first_seen_at = devices.last_seen_at THEN 0
         ELSE ${offlineThreshold}
       END AS missed_scan_count`;

  return `devices.*, ${seenScanCountExpr}, ${missedScanCountExpr}`;
}

export function getPresenceOfflineThreshold(fastify: FastifyInstance): number {
  const configured = (fastify as FastifyInstance & {
    appConfig?: { presenceOfflineThreshold?: number };
  }).appConfig?.presenceOfflineThreshold;

  return typeof configured === 'number' && Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_PRESENCE_OFFLINE_THRESHOLD;
}

export function derivePresenceStatus(
  snapshot: DevicePresenceSnapshot,
  offlineThreshold = DEFAULT_PRESENCE_OFFLINE_THRESHOLD,
): PresenceStatus {
  const seenScanCount = snapshot.seen_scan_count
    ?? (
      snapshot.first_seen_at
      && snapshot.last_seen_at
      && snapshot.first_seen_at === snapshot.last_seen_at
        ? 1
        : 2
    );
  const missedScanCount = snapshot.missed_scan_count
    ?? (
      snapshot.is_online === 1
        ? 0
        : seenScanCount <= 1
          ? 0
          : offlineThreshold
    );

  if (missedScanCount >= offlineThreshold) {
    return 'offline';
  }

  if (seenScanCount <= 1) {
    return 'unknown';
  }

  return snapshot.is_online === 1 ? 'online' : 'unknown';
}

export function toLegacyIsOnline(status: PresenceStatus): boolean {
  return status === 'online';
}

export function isSupportedStatusFilter(value: string | undefined): value is 'online' | 'offline' {
  return value === 'online' || value === 'offline';
}
