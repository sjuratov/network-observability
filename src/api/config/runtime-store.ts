import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig, SmtpConfig } from '@shared/types/config.js';

const RUNTIME_CONFIG_SCHEMA = `
CREATE TABLE IF NOT EXISTS runtime_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
`;

type RuntimeConfigKey =
  | 'subnets'
  | 'scanCadence'
  | 'scanIntensity'
  | 'presenceOfflineThreshold'
  | 'dataRetentionDays'
  | 'portRange'
  | 'alertWebhookUrl'
  | 'alertEmailSmtp'
  | 'alertCooldownSeconds'
  | 'apiKey'
  | 'logLevel';

type RuntimeConfigValue = AppConfig[RuntimeConfigKey];

const SUPPORTED_KEYS = new Set<RuntimeConfigKey>([
  'subnets',
  'scanCadence',
  'scanIntensity',
  'presenceOfflineThreshold',
  'dataRetentionDays',
  'portRange',
  'alertWebhookUrl',
  'alertEmailSmtp',
  'alertCooldownSeconds',
  'apiKey',
  'logLevel',
]);

function serializeValue(value: RuntimeConfigValue): string {
  return JSON.stringify(value);
}

function deserializeValue(key: RuntimeConfigKey, raw: string): RuntimeConfigValue {
  const parsed = JSON.parse(raw) as unknown;

  if (key === 'subnets') {
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  }

  if (key === 'alertEmailSmtp') {
    return (parsed as SmtpConfig | undefined) ?? undefined;
  }

  return parsed as RuntimeConfigValue;
}

function withDb<T>(dbPath: string, callback: (db: BetterSqlite3.Database) => T): T {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new BetterSqlite3(dbPath);
  try {
    db.exec(RUNTIME_CONFIG_SCHEMA);
    return callback(db);
  } finally {
    db.close();
  }
}

export function ensureRuntimeConfigTable(db: BetterSqlite3.Database): void {
  db.exec(RUNTIME_CONFIG_SCHEMA);
}

export function readRuntimeConfig(dbPath: string): Partial<AppConfig> {
  if (!fs.existsSync(dbPath)) {
    return {};
  }

  return withDb(dbPath, (db) => {
    const rows = db.prepare('SELECT key, value FROM runtime_config').all() as Array<{ key: string; value: string }>;
    const runtimeConfig: Partial<AppConfig> = {};

    for (const row of rows) {
      if (!SUPPORTED_KEYS.has(row.key as RuntimeConfigKey)) {
        continue;
      }

      const key = row.key as RuntimeConfigKey;
      const value = deserializeValue(key, row.value);

      switch (key) {
        case 'subnets':
          runtimeConfig.subnets = value as AppConfig['subnets'];
          break;
        case 'scanCadence':
          runtimeConfig.scanCadence = value as AppConfig['scanCadence'];
          break;
        case 'scanIntensity':
          runtimeConfig.scanIntensity = value as AppConfig['scanIntensity'];
          break;
        case 'presenceOfflineThreshold':
          runtimeConfig.presenceOfflineThreshold = value as AppConfig['presenceOfflineThreshold'];
          break;
        case 'dataRetentionDays':
          runtimeConfig.dataRetentionDays = value as AppConfig['dataRetentionDays'];
          break;
        case 'portRange':
          runtimeConfig.portRange = value as AppConfig['portRange'];
          break;
        case 'alertWebhookUrl':
          runtimeConfig.alertWebhookUrl = value as AppConfig['alertWebhookUrl'];
          break;
        case 'alertEmailSmtp':
          runtimeConfig.alertEmailSmtp = value as AppConfig['alertEmailSmtp'];
          break;
        case 'alertCooldownSeconds':
          runtimeConfig.alertCooldownSeconds = value as AppConfig['alertCooldownSeconds'];
          break;
        case 'apiKey':
          runtimeConfig.apiKey = value as AppConfig['apiKey'];
          break;
        case 'logLevel':
          runtimeConfig.logLevel = value as AppConfig['logLevel'];
          break;
      }
    }

    return runtimeConfig;
  });
}

export function writeRuntimeConfig(dbPath: string, updates: Partial<AppConfig>): void {
  withDb(dbPath, (db) => {
    const statement = db.prepare(`
      INSERT INTO runtime_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    const timestamp = new Date().toISOString();

    for (const [key, value] of Object.entries(updates) as Array<[RuntimeConfigKey, RuntimeConfigValue]>) {
      if (!SUPPORTED_KEYS.has(key) || value === undefined) {
        continue;
      }

      statement.run(key, serializeValue(value), timestamp);
    }
  });
}
