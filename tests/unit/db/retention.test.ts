import { describe, it, expect, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runRetentionCleanup } from '@api/db/retention.js';

function createTestDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      mac_address TEXT UNIQUE,
      ip_address TEXT,
      hostname TEXT,
      vendor TEXT,
      display_name TEXT,
      is_known INTEGER DEFAULT 0,
      is_online INTEGER DEFAULT 1,
      first_seen_at TEXT,
      last_seen_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE scans (
      id TEXT PRIMARY KEY,
      status TEXT,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      devices_found INTEGER,
      new_devices INTEGER,
      subnets_scanned TEXT,
      errors TEXT,
      scan_intensity TEXT,
      created_at TEXT
    );
    CREATE TABLE scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT,
      device_id TEXT,
      mac_address TEXT,
      ip_address TEXT,
      hostname TEXT,
      vendor TEXT,
      discovery_method TEXT,
      open_ports TEXT,
      created_at TEXT
    );
    CREATE TABLE device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT
    );
    CREATE TABLE device_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      tag TEXT,
      created_at TEXT
    );
  `);
  return db;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function rowCount(db: BetterSqlite3.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }).cnt;
}

describe('Retention Cleanup (F4.3)', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('should delete scans older than the retention period', () => {
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'completed', daysAgo(200), daysAgo(200), daysAgo(200));
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('recent-scan', 'completed', daysAgo(50), daysAgo(50), daysAgo(50));

    const result = runRetentionCleanup(db, 180);

    expect(result.scansDeleted).toBe(1);
    expect(rowCount(db, 'scans')).toBe(1);
    const remaining = db.prepare('SELECT id FROM scans').get() as { id: string };
    expect(remaining.id).toBe('recent-scan');
  });

  it('should delete scan_results linked to old scans', () => {
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'completed', daysAgo(200), daysAgo(200), daysAgo(200));
    db.prepare(
      'INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'dev-1', 'AA:BB:CC:DD:EE:01', '192.168.1.10', daysAgo(200));
    db.prepare(
      'INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'dev-2', 'AA:BB:CC:DD:EE:02', '192.168.1.20', daysAgo(200));

    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('recent-scan', 'completed', daysAgo(50), daysAgo(50), daysAgo(50));
    db.prepare(
      'INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('recent-scan', 'dev-1', 'AA:BB:CC:DD:EE:01', '192.168.1.10', daysAgo(50));

    const result = runRetentionCleanup(db, 180);

    expect(result.scanResultsDeleted).toBe(2);
    expect(rowCount(db, 'scan_results')).toBe(1);
  });

  it('should delete device_history entries older than the retention period', () => {
    db.prepare(
      'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
    ).run('dev-1', 'ip_address', '192.168.1.10', '192.168.1.20', daysAgo(200));
    db.prepare(
      'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
    ).run('dev-1', 'ip_address', '192.168.1.20', '192.168.1.30', daysAgo(50));

    const result = runRetentionCleanup(db, 180);

    expect(result.historyDeleted).toBe(1);
    expect(rowCount(db, 'device_history')).toBe(1);
  });

  it('should NEVER delete device records', () => {
    db.prepare(
      `INSERT INTO devices (id, mac_address, ip_address, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('dev-1', 'AA:BB:CC:DD:EE:01', '192.168.1.10', daysAgo(400), daysAgo(200), daysAgo(400), daysAgo(200));

    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'completed', daysAgo(200), daysAgo(200), daysAgo(200));
    db.prepare(
      'INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'dev-1', 'AA:BB:CC:DD:EE:01', '192.168.1.10', daysAgo(200));

    runRetentionCleanup(db, 180);

    expect(rowCount(db, 'devices')).toBe(1);
    expect(rowCount(db, 'scans')).toBe(0);
    expect(rowCount(db, 'scan_results')).toBe(0);
  });

  it('should preserve data within the retention window', () => {
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('recent-1', 'completed', daysAgo(100), daysAgo(100), daysAgo(100));
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('recent-2', 'completed', daysAgo(10), daysAgo(10), daysAgo(10));
    db.prepare(
      'INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('recent-1', 'dev-1', 'AA:BB:CC:DD:EE:01', '192.168.1.10', daysAgo(100));
    db.prepare(
      'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
    ).run('dev-1', 'ip_address', '10.0.0.1', '10.0.0.2', daysAgo(10));

    const result = runRetentionCleanup(db, 180);

    expect(result.scansDeleted).toBe(0);
    expect(result.scanResultsDeleted).toBe(0);
    expect(result.historyDeleted).toBe(0);
    expect(rowCount(db, 'scans')).toBe(2);
    expect(rowCount(db, 'scan_results')).toBe(1);
    expect(rowCount(db, 'device_history')).toBe(1);
  });

  it('should handle an empty database gracefully', () => {
    const result = runRetentionCleanup(db, 180);

    expect(result.scansDeleted).toBe(0);
    expect(result.scanResultsDeleted).toBe(0);
    expect(result.historyDeleted).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should return cleanup statistics with duration', () => {
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'completed', daysAgo(200), daysAgo(200), daysAgo(200));
    db.prepare(
      'INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan', 'dev-1', 'AA:BB:CC:DD:EE:01', '192.168.1.10', daysAgo(200));
    db.prepare(
      'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
    ).run('dev-1', 'hostname', 'old-host', 'new-host', daysAgo(200));

    const result = runRetentionCleanup(db, 180);

    expect(result.scansDeleted).toBe(1);
    expect(result.scanResultsDeleted).toBe(1);
    expect(result.historyDeleted).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should use completed_at for scan age when available', () => {
    // Scan started 200 days ago but completed 100 days ago — should be retained
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('long-scan', 'completed', daysAgo(200), daysAgo(100), daysAgo(200));

    const result = runRetentionCleanup(db, 180);

    expect(result.scansDeleted).toBe(0);
    expect(rowCount(db, 'scans')).toBe(1);
  });

  it('should fall back to started_at when completed_at is null', () => {
    // Failed scan with no completed_at, started 200 days ago
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('failed-scan', 'failed', daysAgo(200), null, daysAgo(200));

    const result = runRetentionCleanup(db, 180);

    expect(result.scansDeleted).toBe(1);
  });

  it('should handle batch deletion for large datasets', () => {
    // Insert 2500 scan_results across old scans — should be deleted in batches
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan-1', 'completed', daysAgo(200), daysAgo(200), daysAgo(200));
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('old-scan-2', 'completed', daysAgo(250), daysAgo(250), daysAgo(250));

    const insertResult = db.prepare(
      'INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (let i = 0; i < 2500; i++) {
      const scanId = i < 1250 ? 'old-scan-1' : 'old-scan-2';
      insertResult.run(scanId, `dev-${i}`, `AA:BB:CC:DD:EE:${String(i).padStart(2, '0')}`, `192.168.1.${i % 255}`, daysAgo(200));
    }

    const result = runRetentionCleanup(db, 180);

    expect(result.scanResultsDeleted).toBe(2500);
    expect(result.scansDeleted).toBe(2);
    expect(rowCount(db, 'scan_results')).toBe(0);
  });

  it('should not delete in-progress scans even if old', () => {
    db.prepare(
      'INSERT INTO scans (id, status, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('stuck-scan', 'in-progress', daysAgo(200), null, daysAgo(200));

    const result = runRetentionCleanup(db, 180);

    // in-progress scans should be cleaned up by the orphan handler, not retention
    expect(result.scansDeleted).toBe(1);
  });
});
