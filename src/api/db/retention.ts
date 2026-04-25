import type BetterSqlite3 from 'better-sqlite3';
import type { CleanupResult } from '@shared/types/retention.js';

const BATCH_SIZE = 1000;

/**
 * Run retention cleanup — delete scan data older than the configured retention period.
 * Deletes in order: device_history → scan_results → scans (respects FK constraints).
 * Device records are NEVER deleted (permanent identity).
 * Uses batch ID subquery pattern for SQLite compatibility.
 */
export function runRetentionCleanup(
  db: BetterSqlite3.Database,
  retentionDays: number,
): CleanupResult {
  const start = Date.now();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffIso = cutoff.toISOString();

  let scansDeleted = 0;
  let scanResultsDeleted = 0;
  let historyDeleted = 0;

  // 1. Delete expired scans and their scan_results in batches
  let batch: Array<{ id: string }>;
  do {
    batch = db
      .prepare(
        `SELECT id FROM scans
         WHERE COALESCE(completed_at, started_at) < ?
         LIMIT ?`,
      )
      .all(cutoffIso, BATCH_SIZE) as Array<{ id: string }>;

    if (batch.length === 0) break;

    const ids = batch.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');

    // Delete scan_results first (child rows)
    const srResult = db
      .prepare(`DELETE FROM scan_results WHERE scan_id IN (${placeholders})`)
      .run(...ids);
    scanResultsDeleted += srResult.changes;

    // Delete the scans
    const scanResult = db
      .prepare(`DELETE FROM scans WHERE id IN (${placeholders})`)
      .run(...ids);
    scansDeleted += scanResult.changes;
  } while (batch.length === BATCH_SIZE);

  // 2. Delete old device_history by changed_at (age-based, not scan-linked)
  let deletedInBatch: number;
  do {
    const result = db
      .prepare(
        `DELETE FROM device_history WHERE id IN (
           SELECT id FROM device_history WHERE changed_at < ? LIMIT ?
         )`,
      )
      .run(cutoffIso, BATCH_SIZE);
    deletedInBatch = result.changes;
    historyDeleted += deletedInBatch;
  } while (deletedInBatch === BATCH_SIZE);

  return {
    scansDeleted,
    scanResultsDeleted,
    historyDeleted,
    durationMs: Date.now() - start,
  };
}
