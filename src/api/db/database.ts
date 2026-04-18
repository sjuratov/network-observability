import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface Database {
  initialize(): Promise<void>;
  close(): void;
  getDb(): BetterSqlite3.Database;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS devices (
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

CREATE TABLE IF NOT EXISTS scans (
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

CREATE TABLE IF NOT EXISTS scan_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT,
  device_id TEXT,
  mac_address TEXT,
  ip_address TEXT,
  hostname TEXT,
  vendor TEXT,
  discovery_method TEXT,
  open_ports TEXT,
  created_at TEXT,
  FOREIGN KEY (scan_id) REFERENCES scans(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS device_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS device_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  tag TEXT,
  created_at TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT UNIQUE,
  applied_at TEXT
);
`;

function ensureDevicePresenceColumns(raw: BetterSqlite3.Database) {
  const columns = raw.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('seen_scan_count')) {
    raw.exec('ALTER TABLE devices ADD COLUMN seen_scan_count INTEGER DEFAULT 0');
  }

  if (!columnNames.has('missed_scan_count')) {
    raw.exec('ALTER TABLE devices ADD COLUMN missed_scan_count INTEGER DEFAULT 0');
  }

  raw.exec(`
    UPDATE devices
    SET seen_scan_count = CASE
      WHEN first_seen_at IS NOT NULL AND last_seen_at IS NOT NULL AND first_seen_at = last_seen_at THEN 1
      ELSE 2
    END
    WHERE seen_scan_count IS NULL OR seen_scan_count = 0
  `);

  raw.exec(`
    UPDATE devices
    SET missed_scan_count = CASE
      WHEN is_online = 1 THEN 0
      WHEN first_seen_at IS NOT NULL AND last_seen_at IS NOT NULL AND first_seen_at = last_seen_at THEN 0
      ELSE 2
    END
    WHERE missed_scan_count IS NULL
  `);
}

export function createDatabase(dbPath: string): Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const raw = new BetterSqlite3(dbPath);
  raw.pragma('journal_mode = WAL');

  return {
    async initialize(): Promise<void> {
      raw.exec(SCHEMA_SQL);
      ensureDevicePresenceColumns(raw);

      const existing = raw
        .prepare('SELECT version FROM schema_migrations WHERE version = ?')
        .get('001_initial');

      if (!existing) {
        raw
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run('001_initial', new Date().toISOString());
      }
    },

    close(): void {
      raw.close();
    },

    getDb(): BetterSqlite3.Database {
      return raw;
    },
  };
}
