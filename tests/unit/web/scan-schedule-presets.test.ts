import { describe, expect, it } from 'vitest';
import {
  cronToPreset,
  presetToCron,
  describeSchedule,
  PRESETS,
} from '../../../src/web/utils/scan-schedule-presets.js';

describe('scan-schedule-presets utility', () => {
  describe('PRESETS catalog', () => {
    it('defines exactly 9 preset entries (8 fixed + custom)', () => {
      expect(PRESETS).toHaveLength(9);
    });

    it('every preset has a unique id', () => {
      const ids = PRESETS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('cronToPreset — known presets', () => {
    const knownCases: Array<[string, string]> = [
      ['*/5 * * * *', 'every-5min'],
      ['*/15 * * * *', 'every-15min'],
      ['*/30 * * * *', 'every-30min'],
      ['0 * * * *', 'every-hour'],
      ['0 */4 * * *', 'every-4h'],
      ['0 */6 * * *', 'every-6h'],
      ['0 */12 * * *', 'every-12h'],
    ];

    it.each(knownCases)('maps "%s" → preset "%s"', (cron, expectedId) => {
      const result = cronToPreset(cron);
      expect(result.presetId).toBe(expectedId);
      expect(result.hour).toBeUndefined();
      expect(result.cron).toBeUndefined();
    });
  });

  describe('cronToPreset — daily schedules', () => {
    it('maps "0 14 * * *" → once-a-day with hour 14', () => {
      const result = cronToPreset('0 14 * * *');
      expect(result).toEqual({ presetId: 'once-a-day', hour: 14 });
    });

    it('maps "0 0 * * *" → once-a-day with hour 0 (midnight)', () => {
      const result = cronToPreset('0 0 * * *');
      expect(result).toEqual({ presetId: 'once-a-day', hour: 0 });
    });

    it('maps "0 23 * * *" → once-a-day with hour 23', () => {
      const result = cronToPreset('0 23 * * *');
      expect(result).toEqual({ presetId: 'once-a-day', hour: 23 });
    });
  });

  describe('cronToPreset — custom fallback', () => {
    it('maps unknown cron "5 4 * * 1" → custom with raw cron preserved', () => {
      const result = cronToPreset('5 4 * * 1');
      expect(result).toEqual({ presetId: 'custom', cron: '5 4 * * 1' });
    });

    it('maps "0 */3 * * *" → custom (no matching preset)', () => {
      const result = cronToPreset('0 */3 * * *');
      expect(result).toEqual({ presetId: 'custom', cron: '0 */3 * * *' });
    });

    it('preserves whitespace-trimmed cron in custom fallback', () => {
      const result = cronToPreset('  5 4 * * 1  ');
      expect(result.presetId).toBe('custom');
      expect(result.cron).toBe('5 4 * * 1');
    });
  });

  describe('presetToCron — fixed presets', () => {
    const fixedCases: Array<[string, string]> = [
      ['every-5min', '*/5 * * * *'],
      ['every-15min', '*/15 * * * *'],
      ['every-30min', '*/30 * * * *'],
      ['every-hour', '0 * * * *'],
      ['every-4h', '0 */4 * * *'],
      ['every-6h', '0 */6 * * *'],
      ['every-12h', '0 */12 * * *'],
    ];

    it.each(fixedCases)('preset "%s" → cron "%s"', (presetId, expectedCron) => {
      expect(presetToCron(presetId)).toBe(expectedCron);
    });
  });

  describe('presetToCron — daily with hour', () => {
    it('once-a-day with hour 14 → "0 14 * * *"', () => {
      expect(presetToCron('once-a-day', 14)).toBe('0 14 * * *');
    });

    it('once-a-day with no hour defaults to midnight → "0 0 * * *"', () => {
      expect(presetToCron('once-a-day')).toBe('0 0 * * *');
    });

    it('once-a-day with hour 0 → "0 0 * * *"', () => {
      expect(presetToCron('once-a-day', 0)).toBe('0 0 * * *');
    });

    it('once-a-day with hour 23 → "0 23 * * *"', () => {
      expect(presetToCron('once-a-day', 23)).toBe('0 23 * * *');
    });
  });

  describe('presetToCron — custom returns undefined', () => {
    it('custom preset returns undefined (caller must supply raw cron)', () => {
      expect(presetToCron('custom')).toBeUndefined();
    });
  });

  describe('presetToCron — invalid preset throws', () => {
    it('throws for unknown preset id', () => {
      expect(() => presetToCron('nonexistent')).toThrow();
    });
  });

  describe('round-trip: presetToCron → cronToPreset', () => {
    const roundTripCases: Array<[string, number | undefined]> = [
      ['every-5min', undefined],
      ['every-hour', undefined],
      ['every-6h', undefined],
      ['once-a-day', 14],
      ['once-a-day', 0],
    ];

    it.each(roundTripCases)('preset "%s" (hour=%s) round-trips correctly', (presetId, hour) => {
      const cron = presetToCron(presetId, hour);
      expect(cron).toBeDefined();
      const result = cronToPreset(cron!);
      expect(result.presetId).toBe(presetId);
      if (hour !== undefined) {
        expect(result.hour).toBe(hour);
      }
    });
  });

  describe('describeSchedule', () => {
    it('describes a fixed preset', () => {
      expect(describeSchedule({ presetId: 'every-6h' })).toBe('Every 6 hours');
    });

    it('describes a daily preset with hour', () => {
      expect(describeSchedule({ presetId: 'once-a-day', hour: 14 })).toBe('Once a day at 14:00');
    });

    it('describes a daily preset at midnight', () => {
      expect(describeSchedule({ presetId: 'once-a-day', hour: 0 })).toBe('Once a day at 00:00');
    });

    it('describes a custom preset', () => {
      expect(describeSchedule({ presetId: 'custom' })).toBe('Custom schedule');
    });

    it('describes a custom preset with cron', () => {
      expect(describeSchedule({ presetId: 'custom', cron: '5 4 * * 1' })).toContain('5 4 * * 1');
    });
  });

  describe('edge cases', () => {
    it('handles empty string cron as custom', () => {
      const result = cronToPreset('');
      expect(result.presetId).toBe('custom');
    });

    it('presetToCron with invalid hour for once-a-day clamps or throws', () => {
      // Implementation should reject hours outside 0-23
      expect(() => presetToCron('once-a-day', 25)).toThrow();
      expect(() => presetToCron('once-a-day', -1)).toThrow();
    });
  });
});
