import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerOptions } from '@api/scanner/scheduler.js';

const resume = vi.fn();
const stop = vi.fn();
let scheduledTick: (() => void) | undefined;

vi.mock('croner', () => ({
  Cron: vi.fn().mockImplementation((_expr: string, _options: object, callback?: () => void) => {
    scheduledTick = callback;
    return {
      resume,
      stop,
      nextRun: () => new Date('2026-04-20T00:00:00.000Z'),
    };
  }),
}));

type SchedulerExecutionOptions = SchedulerOptions & {
  onScanTriggered: (record: { trigger: 'scheduled' | 'startup'; status: string }) => void;
};

describe('Scheduler runtime wiring', () => {
  beforeEach(() => {
    resume.mockClear();
    stop.mockClear();
    scheduledTick = undefined;
    vi.resetModules();
  });

  it('triggers a startup scan immediately when runOnStartup is enabled', async () => {
    const onScanTriggered = vi.fn();
    const { createScheduler } = await import('@api/scanner/scheduler.js');

    const scheduler = createScheduler({
      cadence: '0 */6 * * *',
      intensity: 'normal',
      runOnStartup: true,
      onScanTriggered,
    } as SchedulerExecutionOptions);

    scheduler.start();

    expect(onScanTriggered).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'startup',
    }));
  });

  it('triggers a scheduled scan when the cron callback fires', async () => {
    const onScanTriggered = vi.fn();
    const { createScheduler } = await import('@api/scanner/scheduler.js');

    const scheduler = createScheduler({
      cadence: '0 */6 * * *',
      intensity: 'normal',
      runOnStartup: false,
      onScanTriggered,
    } as SchedulerExecutionOptions);

    scheduler.start();
    scheduledTick?.();

    expect(onScanTriggered).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'scheduled',
    }));
  });
});
