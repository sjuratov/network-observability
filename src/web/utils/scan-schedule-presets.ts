export interface PresetDefinition {
  id: string;
  label: string;
  cron?: string;
}

export const PRESETS: PresetDefinition[] = [
  { id: 'every-5min', label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { id: 'every-15min', label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { id: 'every-30min', label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { id: 'every-hour', label: 'Every hour', cron: '0 * * * *' },
  { id: 'every-4h', label: 'Every 4 hours', cron: '0 */4 * * *' },
  { id: 'every-6h', label: 'Every 6 hours', cron: '0 */6 * * *' },
  { id: 'every-12h', label: 'Every 12 hours', cron: '0 */12 * * *' },
  { id: 'once-a-day', label: 'Once a day' },
  { id: 'custom', label: 'Custom (cron)…' },
];

export interface SchedulePreset {
  presetId: string;
  hour?: number;
  cron?: string;
}

const cronToPresetMap = new Map<string, string>();
for (const preset of PRESETS) {
  if (preset.cron) {
    cronToPresetMap.set(preset.cron, preset.id);
  }
}

const DAILY_CRON_RE = /^0\s+(\d{1,2})\s+\*\s+\*\s+\*$/;

export function cronToPreset(rawCron: string): SchedulePreset {
  const cron = rawCron.trim();

  const directMatch = cronToPresetMap.get(cron);
  if (directMatch) {
    return { presetId: directMatch };
  }

  const dailyMatch = cron.match(DAILY_CRON_RE);
  if (dailyMatch) {
    const hour = Number(dailyMatch[1]);
    if (hour >= 0 && hour <= 23) {
      return { presetId: 'once-a-day', hour };
    }
  }

  return { presetId: 'custom', cron: cron || undefined };
}

export function presetToCron(presetId: string, hour?: number): string | undefined {
  if (presetId === 'custom') {
    return undefined;
  }

  if (presetId === 'once-a-day') {
    const h = hour ?? 0;
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      throw new RangeError(`Hour must be an integer between 0 and 23, got ${h}`);
    }
    return `0 ${h} * * *`;
  }

  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset?.cron) {
    throw new Error(`Unknown preset id: ${presetId}`);
  }
  return preset.cron;
}

export function describeSchedule(schedule: SchedulePreset): string {
  if (schedule.presetId === 'custom') {
    if (schedule.cron) {
      return `Custom: ${schedule.cron}`;
    }
    return 'Custom schedule';
  }

  if (schedule.presetId === 'once-a-day') {
    const h = schedule.hour ?? 0;
    return `Once a day at ${String(h).padStart(2, '0')}:00`;
  }

  const preset = PRESETS.find((p) => p.id === schedule.presetId);
  return preset?.label ?? 'Custom schedule';
}
