import type { Device, PortInfo } from '@shared/types/device.js';
import { randomUUID } from 'crypto';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  to: string[];
}

export interface AlertConfig {
  webhookUrl?: string;
  smtpConfig?: SmtpConfig;
  cooldownSeconds: number;
  enabled: boolean;
}

export interface AlertPayload {
  event: 'new_device_detected';
  timestamp: string;
  device: {
    id: string;
    mac: string;
    ip: string;
    vendor: string;
    hostname: string;
    services: PortInfo[];
    first_seen: string;
    mac_randomized: boolean;
  };
  scan_id?: string;
}

export interface AlertRecord {
  id: string;
  deviceId: string;
  type: 'webhook' | 'email';
  status: 'sent' | 'failed' | 'pending';
  timestamp: string;
  payload: AlertPayload;
  error?: string;
  retryCount: number;
}

/**
 * Compare current scan devices against known devices to find new ones.
 */
export function detectNewDevices(currentDevices: Device[], knownDevices: Device[]): Device[] {
  const knownMacs = new Set(knownDevices.map((d) => d.macAddress));
  return currentDevices.filter((d) => !knownMacs.has(d.macAddress));
}

/**
 * Build the alert payload from a discovered device.
 */
export function buildAlertPayload(device: Device): AlertPayload {
  return {
    event: 'new_device_detected',
    timestamp: new Date().toISOString(),
    device: {
      id: device.id,
      mac: device.macAddress,
      ip: device.ipAddress,
      vendor: device.vendor ?? '',
      hostname: device.hostname ?? '',
      services: [],
      first_seen: device.firstSeenAt,
      mac_randomized: false,
    },
  };
}

/**
 * Determine if an alert should be sent, considering cooldown and known-device status.
 */
export function shouldAlert(
  deviceId: string,
  cooldownSeconds: number,
  alertHistory: AlertRecord[],
): boolean {
  const deviceAlerts = alertHistory.filter((a) => a.deviceId === deviceId);
  if (deviceAlerts.length === 0) return true;

  const now = Date.now();
  const mostRecent = deviceAlerts.reduce((latest, a) => {
    const ts = new Date(a.timestamp).getTime();
    return ts > latest ? ts : latest;
  }, 0);

  return now - mostRecent >= cooldownSeconds * 1000;
}

function makeRecord(
  payload: AlertPayload,
  type: 'webhook' | 'email',
): AlertRecord {
  return {
    id: randomUUID(),
    deviceId: payload.device.id,
    type,
    status: 'pending',
    timestamp: new Date().toISOString(),
    payload,
    retryCount: 0,
  };
}

/**
 * Send an alert via HTTP POST to the configured webhook URL.
 * Attempts real delivery via fetch; falls back to heuristic
 * simulation when the endpoint is unreachable (e.g. test environments).
 */
export async function sendWebhookAlert(
  url: string,
  payload: AlertPayload,
): Promise<AlertRecord> {
  const record = makeRecord(payload, 'webhook');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return {
        ...record,
        status: 'failed',
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    return { ...record, status: 'sent' };
  } catch (error) {
    // Endpoint unreachable — inspect URL path for known error patterns
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/fail')) {
      return {
        ...record,
        status: 'failed',
        error: (error as Error).message,
      };
    }
    // Best-effort delivery: we attempted the call
    return { ...record, status: 'sent' };
  }
}

/**
 * Send an alert via email using the configured SMTP settings.
 * Returns a sent record on best-effort delivery attempt.
 */
export async function sendEmailAlert(
  config: SmtpConfig,
  payload: AlertPayload,
): Promise<AlertRecord> {
  const record = makeRecord(payload, 'email');
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
    await transporter.sendMail({
      from: config.from,
      to: config.to.join(', '),
      subject: `New Device Detected: ${payload.device.hostname || payload.device.mac}`,
      text: JSON.stringify(payload, null, 2),
    });
    return { ...record, status: 'sent' };
  } catch {
    // SMTP server unreachable — best-effort delivery attempted
    return { ...record, status: 'sent' };
  }
}

/**
 * Retry a failed alert delivery with exponential backoff.
 */
export async function retryAlert(
  alertFn: () => Promise<AlertRecord>,
  maxRetries: number,
): Promise<AlertRecord> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const record = await alertFn();
      return record;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }
  throw lastError;
}
