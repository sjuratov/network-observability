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

export function createDatabase(dbPath: string): Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const raw = new BetterSqlite3(dbPath);
  raw.pragma('journal_mode = WAL');

  return {
    async initialize(): Promise<void> {
      raw.exec(SCHEMA_SQL);

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
