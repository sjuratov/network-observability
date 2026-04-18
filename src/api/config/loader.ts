import type { AppConfig } from '@shared/types/config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

const DEFAULTS: AppConfig = {
  subnets: [],
  scanCadence: '0 */6 * * *',
  scanIntensity: 'normal',
  presenceOfflineThreshold: 2,
  dataRetentionDays: 365,
  portRange: '',
  alertCooldownSeconds: 300,
  apiKey: '',
  webUiPort: 8080,
  logLevel: 'info',
  dbPath: './data/network-obs.db',
};

interface YamlConfig {
  scan?: { cadence?: string; intensity?: string; subnets?: string[] };
  presence?: { offline_threshold?: number };
  storage?: { retention_days?: number; db_path?: string };
  web_ui_port?: number;
  log_level?: string;
  api_key?: string;
  alert?: { webhook_url?: string; cooldown_seconds?: number };
  port_range?: string;
}

function applyYaml(base: AppConfig, doc: YamlConfig): AppConfig {
  const cfg = { ...base };
  if (doc.scan?.cadence) cfg.scanCadence = doc.scan.cadence;
  if (doc.scan?.intensity) cfg.scanIntensity = doc.scan.intensity as AppConfig['scanIntensity'];
  if (doc.scan?.subnets) cfg.subnets = doc.scan.subnets;
  if (doc.presence?.offline_threshold !== undefined) cfg.presenceOfflineThreshold = doc.presence.offline_threshold;
  if (doc.storage?.retention_days !== undefined) cfg.dataRetentionDays = doc.storage.retention_days;
  if (doc.storage?.db_path) cfg.dbPath = doc.storage.db_path;
  if (doc.web_ui_port !== undefined) cfg.webUiPort = doc.web_ui_port;
  if (doc.log_level) cfg.logLevel = doc.log_level as AppConfig['logLevel'];
  if (doc.api_key) cfg.apiKey = doc.api_key;
  if (doc.alert?.webhook_url) cfg.alertWebhookUrl = doc.alert.webhook_url;
  if (doc.alert?.cooldown_seconds !== undefined) cfg.alertCooldownSeconds = doc.alert.cooldown_seconds;
  if (doc.port_range) cfg.portRange = doc.port_range;
  return cfg;
}

function applyEnv(base: AppConfig): AppConfig {
  const cfg = { ...base };
  if (process.env['SCAN_CADENCE']) cfg.scanCadence = process.env['SCAN_CADENCE'];
  if (process.env['SCAN_INTENSITY']) cfg.scanIntensity = process.env['SCAN_INTENSITY'] as AppConfig['scanIntensity'];
  if (process.env['SCAN_SUBNETS']) cfg.subnets = process.env['SCAN_SUBNETS'].split(',').map(s => s.trim());
  if (process.env['PRESENCE_OFFLINE_THRESHOLD']) cfg.presenceOfflineThreshold = parseInt(process.env['PRESENCE_OFFLINE_THRESHOLD'], 10);
  if (process.env['STORAGE_RETENTION_DAYS']) cfg.dataRetentionDays = parseInt(process.env['STORAGE_RETENTION_DAYS'], 10);
  if (process.env['STORAGE_DB_PATH']) cfg.dbPath = process.env['STORAGE_DB_PATH'];
  if (process.env['WEB_UI_PORT']) cfg.webUiPort = parseInt(process.env['WEB_UI_PORT'], 10);
  if (process.env['LOG_LEVEL']) cfg.logLevel = process.env['LOG_LEVEL'] as AppConfig['logLevel'];
  if (process.env['API_KEY']) cfg.apiKey = process.env['API_KEY'];
  if (process.env['ALERT_WEBHOOK_URL']) cfg.alertWebhookUrl = process.env['ALERT_WEBHOOK_URL'];
  if (process.env['ALERT_COOLDOWN_SECONDS']) cfg.alertCooldownSeconds = parseInt(process.env['ALERT_COOLDOWN_SECONDS'], 10);
  if (process.env['PORT_RANGE']) cfg.portRange = process.env['PORT_RANGE'];
  return cfg;
}

function resolveApiKey(config: AppConfig): string {
  if (config.apiKey) return config.apiKey;

  const keyDir = path.dirname(config.dbPath);
  const keyFile = path.join(keyDir, '.api-key');

  try {
    if (fs.existsSync(keyFile)) {
      const stored = fs.readFileSync(keyFile, 'utf-8').trim();
      if (stored) return stored;
    }
  } catch {
    // ignore read errors
  }

  const newKey = generateApiKey();
  try {
    fs.mkdirSync(keyDir, { recursive: true });
    fs.writeFileSync(keyFile, newKey, { mode: 0o600 });
  } catch {
    // ignore write errors — key is still usable in-memory
  }
  return newKey;
}

export async function loadConfig(): Promise<AppConfig> {
  let config: AppConfig = { ...DEFAULTS };

  // Layer 2: YAML file
  const configFile = process.env['CONFIG_FILE'] || './config.yaml';
  try {
    if (fs.existsSync(configFile)) {
      const content = fs.readFileSync(configFile, 'utf-8');
      if (content.trim()) {
        const doc = yaml.load(content) as YamlConfig;
        if (doc && typeof doc === 'object') {
          config = applyYaml(config, doc);
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse YAML config file "${configFile}": ${msg}`, { cause: err });
  }

  // Layer 3: Environment variables
  config = applyEnv(config);

  // Auto-detect subnets if none configured
  if (config.subnets.length === 0) {
    config.subnets = detectSubnets();
  }

  // Resolve API key (auto-generate + persist if needed)
  config.apiKey = resolveApiKey(config);

  return config;
}

export function validateConfig(config: Partial<AppConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.subnets) {
    for (const subnet of config.subnets) {
      if (!isValidCidr(subnet)) {
        errors.push(`Invalid subnet CIDR: "${subnet}"`);
      }
    }
  }

  if (config.scanCadence !== undefined) {
    if (!isValidCron(config.scanCadence)) {
      errors.push(`Invalid cron expression for scan.cadence: "${config.scanCadence}"`);
    }
  }

  if (config.dataRetentionDays !== undefined) {
    if (!Number.isInteger(config.dataRetentionDays) || config.dataRetentionDays < 30) {
      errors.push(`storage.retention_days must be at least 30, got ${config.dataRetentionDays}`);
    }
  }

  if (config.scanIntensity !== undefined) {
    const valid = ['quick', 'normal', 'thorough'];
    if (!valid.includes(config.scanIntensity)) {
      errors.push(`Invalid scan.intensity: "${config.scanIntensity}". Must be one of: quick, normal, thorough`);
    }
  }

  if (config.presenceOfflineThreshold !== undefined) {
    if (!Number.isInteger(config.presenceOfflineThreshold) || config.presenceOfflineThreshold < 1) {
      errors.push(`presence.offline_threshold must be at least 1, got ${config.presenceOfflineThreshold}`);
    }
  }

  if (config.logLevel !== undefined) {
    const valid = ['debug', 'info', 'warn', 'error'];
    if (!valid.includes(config.logLevel)) {
      errors.push(`Invalid log_level: "${config.logLevel}". Must be one of: debug, info, warn, error`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function isValidCidr(cidr: string): boolean {
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  if (octets.some(o => o > 255)) return false;
  const prefix = Number(match[5]);
  return prefix >= 0 && prefix <= 32;
}

function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const pattern = /^[-\d*/,]+$/;
  return fields.every(f => pattern.test(f));
}

export function detectSubnets(): string[] {
  const interfaces = os.networkInterfaces();
  const subnets: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    // Skip Docker-like interface names
    if (/^(docker|br-|veth)/.test(name)) continue;

    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;

      const ip = addr.address;
      // Filter out loopback, link-local, Docker bridge subnets (172.16-31.x.x)
      if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;
      const firstOctet = parseInt(ip.split('.')[0], 10);
      const secondOctet = parseInt(ip.split('.')[1], 10);
      if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) continue;

      const mask = addr.netmask;
      const prefix = netmaskToPrefix(mask);
      // Skip subnets larger than /24 — too many hosts to scan practically
      const effectivePrefix = Math.max(prefix, 24);
      const network = applyMask(ip, prefix >= 24 ? mask : '255.255.255.0');
      subnets.push(`${network}/${effectivePrefix}`);
    }
  }

  return subnets;
}

function netmaskToPrefix(mask: string): number {
  return mask.split('.').reduce((acc, octet) => {
    let bits = parseInt(octet, 10);
    while (bits > 0) {
      acc += bits & 1;
      bits >>= 1;
    }
    return acc;
  }, 0);
}

function applyMask(ip: string, mask: string): string {
  const ipParts = ip.split('.').map(Number);
  const maskParts = mask.split('.').map(Number);
  return ipParts.map((p, i) => (p & maskParts[i])).join('.');
}

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
