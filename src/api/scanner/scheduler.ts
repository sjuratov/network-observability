import { randomUUID } from 'node:crypto';
import { Cron } from 'croner';

export interface SchedulerOptions {
  cadence: string;
  intensity: 'quick' | 'normal' | 'thorough';
  runOnStartup: boolean;
  onScanTriggered?: (record: ScanRecord) => void | Promise<void>;
}

export interface ScanScheduler {
  start(): void;
  stop(): void;
  reschedule(newCadence: string): void;
  triggerManualScan(): Promise<ScanRecord>;
  isRunning(): boolean;
  getStatus(): ScanStatus;
}

export interface ScanStatus {
  isScanning: boolean;
  lastScan?: ScanRecord;
  nextScanAt?: string;
}

export interface ScanRecord {
  id: string;
  trigger: 'manual' | 'scheduled' | 'startup';
  status: 'pending' | 'running' | 'completed' | 'failed';
  intensity: 'quick' | 'normal' | 'thorough';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  devicesFound?: number;
  newDevices?: number;
  subnetsScanned?: string[];
  errors?: string[];
  error?: string;
}

export function createScheduler(options: SchedulerOptions): ScanScheduler {
  let scanning = false;
  let lastScan: ScanRecord | undefined;
  let cronJob: Cron | undefined;

  async function triggerScan(trigger: ScanRecord['trigger']): Promise<ScanRecord> {
    scanning = true;
    const running = transitionScanStatus(createScanRecord(trigger, options.intensity), 'running');
    lastScan = running;

    try {
      await options.onScanTriggered?.(running);
      return running;
    } catch (error) {
      const failed = transitionScanStatus({
        ...running,
        error: error instanceof Error ? error.message : String(error),
      }, 'failed');
      lastScan = failed;
      throw error;
    } finally {
      scanning = false;
    }
  }

  const scheduler: ScanScheduler = {
    start() {
      cronJob = new Cron(options.cadence, { paused: true }, () => {
        void triggerScan('scheduled');
      });
      cronJob.resume();

      if (options.runOnStartup) {
        void triggerScan('startup');
      }
    },
    stop() {
      cronJob?.stop();
    },
    reschedule(newCadence: string) {
      cronJob?.stop();
      options.cadence = newCadence;
      cronJob = new Cron(newCadence, { paused: true }, () => {
        void triggerScan('scheduled');
      });
      cronJob.resume();
    },
    async triggerManualScan(): Promise<ScanRecord> {
      return triggerScan('manual');
    },
    isRunning() {
      return scanning;
    },
    getStatus(): ScanStatus {
      return {
        isScanning: scanning,
        lastScan,
        nextScanAt: cronJob?.nextRun()?.toISOString(),
      };
    },
  };

  return scheduler;
}

const VALID_SHORTHANDS = new Set(['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@hourly']);

export function validateCronExpression(expr: string): { valid: boolean; error?: string } {
  if (VALID_SHORTHANDS.has(expr)) {
    return { valid: true };
  }

  try {
    // Croner supports 6 fields (with seconds). We only allow 5-field standard cron.
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) {
      return { valid: false, error: `Not a valid cron expression: expected 5 fields, got ${fields.length}` };
    }
    // Attempt to parse — Croner will throw on invalid syntax
    new Cron(expr, { paused: true });
    return { valid: true };
  } catch {
    return { valid: false, error: 'Not a valid cron expression' };
  }
}

export function createScanRecord(trigger: ScanRecord['trigger'], intensity: ScanRecord['intensity']): ScanRecord {
  return {
    id: randomUUID(),
    trigger,
    status: 'pending',
    intensity,
  };
}

export function transitionScanStatus(
  record: ScanRecord,
  newStatus: ScanRecord['status'],
): ScanRecord {
  const updated = { ...record, status: newStatus };

  if (newStatus === 'running') {
    updated.startedAt = new Date().toISOString();
  }

  if (newStatus === 'completed' || newStatus === 'failed') {
    updated.completedAt = new Date().toISOString();
    if (updated.startedAt) {
      updated.durationMs = new Date(updated.completedAt).getTime() - new Date(updated.startedAt).getTime();
    }
  }

  return updated;
}
