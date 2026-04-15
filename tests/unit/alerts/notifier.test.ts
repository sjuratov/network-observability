import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectNewDevices,
  sendWebhookAlert,
  sendEmailAlert,
  shouldAlert,
  buildAlertPayload,
  retryAlert,
  type AlertConfig,
  type AlertRecord,
  type AlertPayload,
  type SmtpConfig,
} from '@api/alerts/notifier.js';
import type { Device } from '@shared/types/device.js';

// ─── Test Helpers ───

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'd-001',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    ipAddress: '192.168.1.42',
    hostname: 'iPhone-Living-Room',
    vendor: 'Apple, Inc.',
    displayName: 'iPhone',
    isKnown: false,
    isOnline: true,
    firstSeenAt: '2024-01-15T10:30:00Z',
    lastSeenAt: '2024-01-15T10:30:00Z',
    discoveryMethod: 'arp',
    tags: [],
    ...overrides,
  };
}

function makeAlertRecord(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    id: 'alert-001',
    deviceId: 'd-001',
    type: 'webhook',
    status: 'sent',
    timestamp: new Date().toISOString(),
    payload: {
      event: 'new_device_detected',
      timestamp: new Date().toISOString(),
      device: {
        id: 'd-001',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.42',
        vendor: 'Apple, Inc.',
        hostname: 'iPhone-Living-Room',
        services: [],
        first_seen: '2024-01-15T10:30:00Z',
        mac_randomized: false,
      },
    },
    retryCount: 0,
    ...overrides,
  };
}

describe('New Device Alerts (F7)', () => {

  // ─── New Device Detection ───

  describe('detectNewDevices', () => {
    it('should return devices not present in the known list', () => {
      const current = [
        makeDevice({ id: 'd-001', macAddress: 'AA:BB:CC:DD:EE:FF' }),
        makeDevice({ id: 'd-002', macAddress: '11:22:33:44:55:66' }),
      ];
      const known = [
        makeDevice({ id: 'd-001', macAddress: 'AA:BB:CC:DD:EE:FF' }),
      ];

      const newDevices = detectNewDevices(current, known);

      expect(newDevices).toHaveLength(1);
      expect(newDevices[0].macAddress).toBe('11:22:33:44:55:66');
    });

    it('should return empty array when all devices are known', () => {
      const devices = [makeDevice({ id: 'd-001', macAddress: 'AA:BB:CC:DD:EE:FF' })];

      const newDevices = detectNewDevices(devices, devices);

      expect(newDevices).toHaveLength(0);
    });

    it('should return all devices when known list is empty', () => {
      const current = [
        makeDevice({ id: 'd-001' }),
        makeDevice({ id: 'd-002', macAddress: '11:22:33:44:55:66' }),
      ];

      const newDevices = detectNewDevices(current, []);

      expect(newDevices).toHaveLength(2);
    });
  });

  // ─── Known Device Suppression ───

  describe('Known device suppression', () => {
    it('should not detect a device marked as known', () => {
      const current = [
        makeDevice({ id: 'd-001', macAddress: 'AA:BB:CC:DD:EE:FF', isKnown: true }),
      ];
      const known = [
        makeDevice({ id: 'd-001', macAddress: 'AA:BB:CC:DD:EE:FF', isKnown: true }),
      ];

      const newDevices = detectNewDevices(current, known);

      expect(newDevices).toHaveLength(0);
    });
  });

  // ─── Alert Payload ───

  describe('buildAlertPayload', () => {
    it('should include MAC, IP, vendor, hostname in the payload', () => {
      const device = makeDevice({
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.42',
        vendor: 'Apple, Inc.',
        hostname: 'iPhone-Living-Room',
      });

      const payload = buildAlertPayload(device);

      expect(payload.event).toBe('new_device_detected');
      expect(payload.device.mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(payload.device.ip).toBe('192.168.1.42');
      expect(payload.device.vendor).toBe('Apple, Inc.');
      expect(payload.device.hostname).toBe('iPhone-Living-Room');
      expect(payload.timestamp).toBeDefined();
    });

    it('should set event type to new_device_detected', () => {
      const device = makeDevice();
      const payload = buildAlertPayload(device);

      expect(payload.event).toBe('new_device_detected');
    });

    it('should include first_seen timestamp from device', () => {
      const device = makeDevice({ firstSeenAt: '2024-01-15T10:30:00Z' });
      const payload = buildAlertPayload(device);

      expect(payload.device.first_seen).toBe('2024-01-15T10:30:00Z');
    });
  });

  // ─── Cooldown / Deduplication ───

  describe('shouldAlert', () => {
    it('should return true when no prior alert exists for the device', () => {
      const result = shouldAlert('d-001', 3600, []);

      expect(result).toBe(true);
    });

    it('should return false when device was alerted within cooldown period', () => {
      const recentAlert = makeAlertRecord({
        deviceId: 'd-001',
        timestamp: new Date().toISOString(), // just now
      });

      const result = shouldAlert('d-001', 3600, [recentAlert]);

      expect(result).toBe(false);
    });

    it('should return true when cooldown period has elapsed', () => {
      const oldTimestamp = new Date(Date.now() - 7200 * 1000).toISOString(); // 2 hours ago
      const oldAlert = makeAlertRecord({
        deviceId: 'd-001',
        timestamp: oldTimestamp,
      });

      const result = shouldAlert('d-001', 3600, [oldAlert]);

      expect(result).toBe(true);
    });

    it('should only consider alerts for the specific device', () => {
      const otherDeviceAlert = makeAlertRecord({
        deviceId: 'd-999',
        timestamp: new Date().toISOString(),
      });

      const result = shouldAlert('d-001', 3600, [otherDeviceAlert]);

      expect(result).toBe(true);
    });
  });

  // ─── Webhook Delivery ───

  describe('sendWebhookAlert', () => {
    it('should send HTTP POST to the configured URL and return a sent record', async () => {
      const payload: AlertPayload = buildAlertPayload(makeDevice());

      const record = await sendWebhookAlert('https://hooks.example.com/notify', payload);

      expect(record.type).toBe('webhook');
      expect(record.status).toBe('sent');
      expect(record.retryCount).toBe(0);
    });

    it('should return a failed record when the webhook returns an error', async () => {
      const payload: AlertPayload = buildAlertPayload(makeDevice());

      // Simulates endpoint returning 500
      const record = await sendWebhookAlert('https://hooks.example.com/fail', payload);

      expect(record.status).toBe('failed');
      expect(record.error).toBeDefined();
    });
  });

  // ─── Email Delivery ───

  describe('sendEmailAlert', () => {
    it('should send email via SMTP and return a sent record', async () => {
      const smtpConfig: SmtpConfig = {
        host: 'smtp.example.com',
        port: 587,
        from: 'noreply@network-observer',
        to: ['admin@example.com'],
      };
      const payload: AlertPayload = buildAlertPayload(makeDevice());

      const record = await sendEmailAlert(smtpConfig, payload);

      expect(record.type).toBe('email');
      expect(record.status).toBe('sent');
    });
  });

  // ─── Retry with Backoff ───

  describe('retryAlert', () => {
    it('should succeed on first attempt without retries', async () => {
      const mockFn = vi.fn().mockResolvedValue(makeAlertRecord({ status: 'sent' }));

      const record = await retryAlert(mockFn, 3);

      expect(record.status).toBe('sent');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure up to maxRetries times', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(makeAlertRecord({ status: 'sent', retryCount: 2 }));

      const record = await retryAlert(mockFn, 3);

      expect(record.status).toBe('sent');
      expect(record.retryCount).toBe(2);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should return failed record after exhausting all retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(retryAlert(mockFn, 3)).rejects.toThrow();
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Alert History ───

  describe('Alert history recording', () => {
    it('should record sent status with timestamp and device info', async () => {
      const payload: AlertPayload = buildAlertPayload(makeDevice());
      const record = await sendWebhookAlert('https://hooks.example.com/notify', payload);

      expect(record.timestamp).toBeDefined();
      expect(record.deviceId).toBeDefined();
      expect(record.type).toBe('webhook');
      expect(record.retryCount).toBeGreaterThanOrEqual(0);
    });
  });
});
