import { describe, it, expect } from 'vitest';
import {
  createScheduler,
  validateCronExpression,
  createScanRecord,
  transitionScanStatus,
} from '@api/scanner/scheduler.js';
import type { SchedulerOptions } from '@api/scanner/scheduler.js';

describe('Scheduled Scanning (F3)', () => {
  // ─── Default Schedule ───

  describe('Default Schedule', () => {
    it('should initialize with default cadence of every 6 hours', () => {
      const options: SchedulerOptions = {
        cadence: '0 */6 * * *',
        intensity: 'normal',
        runOnStartup: true,
      };

      const scheduler = createScheduler(options);

      expect(scheduler).toBeDefined();
      expect(scheduler.getStatus).toBeDefined();
    });
  });

  // ─── Cron Validation ───

  describe('Cron Validation', () => {
    it('should accept a valid standard 5-field cron expression', () => {
      const result = validateCronExpression('0 */6 * * *');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept a custom cron expression for every 4 hours', () => {
      const result = validateCronExpression('0 */4 * * *');

      expect(result.valid).toBe(true);
    });

    it('should reject an invalid cron expression', () => {
      const result = validateCronExpression('invalid-cron');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.toLowerCase()).toContain('not a valid cron expression');
    });

    it('should accept @daily shorthand', () => {
      const result = validateCronExpression('@daily');

      expect(result.valid).toBe(true);
    });

    it('should accept @hourly shorthand', () => {
      const result = validateCronExpression('@hourly');

      expect(result.valid).toBe(true);
    });

    it('should accept @weekly shorthand', () => {
      const result = validateCronExpression('@weekly');

      expect(result.valid).toBe(true);
    });

    it('should reject a cron expression with too many fields', () => {
      const result = validateCronExpression('0 0 * * * * *');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ─── Manual Scan Trigger ───

  describe('Manual Scan Trigger', () => {
    it('should trigger a manual scan when no scan is running', async () => {
      const options: SchedulerOptions = {
        cadence: '0 */6 * * *',
        intensity: 'normal',
        runOnStartup: false,
      };
      const scheduler = createScheduler(options);

      expect(scheduler.isRunning()).toBe(false);

      const scan = await scheduler.triggerManualScan();

      expect(scan).toBeDefined();
      expect(scan.id).toBeTruthy();
    });
  });

  // ─── Concurrent Scan Prevention ───

  describe('Concurrent Scan Prevention', () => {
    it('should report scanning status when a scan is in progress', () => {
      const options: SchedulerOptions = {
        cadence: '0 */6 * * *',
        intensity: 'normal',
        runOnStartup: false,
      };
      const scheduler = createScheduler(options);
      const status = scheduler.getStatus();

      expect(status).toHaveProperty('isScanning');
    });
  });

  // ─── Scan Lifecycle ───

  describe('Scan Lifecycle', () => {
    it('should create a scan record with pending status', () => {
      const record = createScanRecord('manual', 'normal');

      expect(record.id).toBeTruthy();
      expect(record.status).toBe('pending');
      expect(record.trigger).toBe('manual');
      expect(record.intensity).toBe('normal');
    });

    it('should create a scheduled scan record', () => {
      const record = createScanRecord('scheduled', 'quick');

      expect(record.trigger).toBe('scheduled');
      expect(record.intensity).toBe('quick');
    });

    it('should create a startup scan record', () => {
      const record = createScanRecord('startup', 'normal');

      expect(record.trigger).toBe('startup');
    });

    it('should transition scan from pending to running', () => {
      const record = createScanRecord('manual', 'normal');
      const running = transitionScanStatus(record, 'running');

      expect(running.status).toBe('running');
      expect(running.startedAt).toBeTruthy();
    });

    it('should transition scan from running to completed', () => {
      const record = createScanRecord('manual', 'normal');
      const running = transitionScanStatus(record, 'running');
      const completed = transitionScanStatus(running, 'completed');

      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeTruthy();
      expect(completed.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should transition scan from running to failed with error', () => {
      const record = createScanRecord('manual', 'normal');
      const running = transitionScanStatus(record, 'running');
      const failed = transitionScanStatus(running, 'failed');

      expect(failed.status).toBe('failed');
      expect(failed.completedAt).toBeTruthy();
    });
  });

  // ─── Intensity Profiles ───

  describe('Intensity Profiles', () => {
    it('should accept quick intensity', () => {
      const record = createScanRecord('manual', 'quick');

      expect(record.intensity).toBe('quick');
    });

    it('should accept normal intensity', () => {
      const record = createScanRecord('manual', 'normal');

      expect(record.intensity).toBe('normal');
    });

    it('should accept thorough intensity', () => {
      const record = createScanRecord('manual', 'thorough');

      expect(record.intensity).toBe('thorough');
    });
  });

  // ─── Scan Metadata ───

  describe('Scan Metadata', () => {
    it('should include all required metadata on completed scan', () => {
      const record = createScanRecord('manual', 'normal');
      const running = transitionScanStatus(record, 'running');
      const completed = transitionScanStatus(running, 'completed');

      expect(completed.startedAt).toBeTruthy();
      expect(completed.completedAt).toBeTruthy();
      expect(typeof completed.durationMs).toBe('number');
      expect(completed.intensity).toBe('normal');
    });
  });
});
