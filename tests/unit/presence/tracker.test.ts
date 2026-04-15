import { describe, it, expect } from 'vitest';
import {
  initializePresence,
  updatePresence,
  checkOfflineDevices,
  calculateAvailability,
  getPresenceTimeline,
} from '@api/presence/tracker.js';
import type { PresenceState, PresenceEvent } from '@api/presence/tracker.js';

// ─── Helpers ───

function makePresence(overrides: Partial<PresenceState> = {}): PresenceState {
  return {
    deviceId: 'dev-1',
    status: 'online',
    firstSeenAt: '2024-01-01T10:00:00Z',
    lastSeenAt: '2024-01-01T10:00:00Z',
    missedScans: 0,
    offlineThreshold: 2,
    ...overrides,
  };
}

describe('Online/Offline Presence Tracking', () => {
  // ─── First-Seen / Last-Seen Timestamps ───

  describe('First-Seen / Last-Seen Timestamps', () => {
    // @inc-02 @f8 @must — First-seen set on initial discovery
    it('should set first-seen and last-seen on initial discovery', () => {
      const state = initializePresence('dev-1', '2024-01-01T10:00:00Z');

      expect(state.firstSeenAt).toBe('2024-01-01T10:00:00Z');
      expect(state.lastSeenAt).toBe('2024-01-01T10:00:00Z');
      expect(state.status).toBe('online');
      expect(state.missedScans).toBe(0);
    });

    // @inc-02 @f8 @must — First-seen never changes
    it('should never change first-seen on subsequent scans', () => {
      const state = makePresence({
        firstSeenAt: '2024-01-01T10:00:00Z',
        lastSeenAt: '2024-01-01T10:00:00Z',
      });

      const result = updatePresence(state, true, '2024-01-02T10:00:00Z');

      expect(result.state.firstSeenAt).toBe('2024-01-01T10:00:00Z');
      expect(result.state.lastSeenAt).toBe('2024-01-02T10:00:00Z');
    });

    // @inc-02 @f8 @must — Last-seen updated every scan
    it('should update last-seen when device is found', () => {
      const state = makePresence({ lastSeenAt: '2024-01-01T10:00:00Z' });

      const result = updatePresence(state, true, '2024-01-01T16:00:00Z');

      expect(result.state.lastSeenAt).toBe('2024-01-01T16:00:00Z');
    });
  });

  // ─── Offline Detection ───

  describe('Offline Detection', () => {
    // @inc-02 @f8 @must — Device goes offline after N missed scans
    it('should transition device to offline after exceeding threshold', () => {
      let state = makePresence({ status: 'online', offlineThreshold: 2 });

      // Miss scan 1
      let result = updatePresence(state, false, '2024-01-02T10:00:00Z');
      state = result.state;
      expect(state.status).toBe('online');

      // Miss scan 2
      result = updatePresence(state, false, '2024-01-02T16:00:00Z');
      state = result.state;
      expect(state.status).toBe('online');

      // Miss scan 3 — exceeds threshold of 2
      result = updatePresence(state, false, '2024-01-03T10:00:00Z');
      state = result.state;

      expect(state.status).toBe('offline');
      expect(result.event).not.toBeNull();
      expect(result.event!.event).toBe('offline');
    });

    // @inc-02 @f8 @must — Device stays online when below threshold
    it('should keep device online when missed scans below threshold', () => {
      const state = makePresence({ status: 'online', offlineThreshold: 2 });

      const result = updatePresence(state, false, '2024-01-02T10:00:00Z');

      expect(result.state.status).toBe('online');
      expect(result.state.missedScans).toBe(1);
    });
  });

  // ─── Online Re-detection ───

  describe('Online Re-detection', () => {
    // @inc-02 @f8 @must — Device comes back online
    it('should transition offline device to online when found', () => {
      const state = makePresence({
        status: 'offline',
        missedScans: 5,
        lastSeenAt: '2024-01-01T10:00:00Z',
      });

      const result = updatePresence(state, true, '2024-01-05T10:00:00Z');

      expect(result.state.status).toBe('online');
      expect(result.state.missedScans).toBe(0);
      expect(result.state.lastSeenAt).toBe('2024-01-05T10:00:00Z');
      expect(result.event).not.toBeNull();
      expect(result.event!.event).toBe('online');
    });
  });

  // ─── Presence Events ───

  describe('Presence Events', () => {
    // @inc-02 @f8 @must — Online-to-offline records event
    it('should record offline event on transition', () => {
      // Create a state that's about to cross the threshold
      const state = makePresence({
        status: 'online',
        missedScans: 2,
        offlineThreshold: 2,
      });

      const result = updatePresence(state, false, '2024-01-03T10:00:00Z');

      expect(result.event).not.toBeNull();
      expect(result.event!.event).toBe('offline');
      expect(result.event!.deviceId).toBe('dev-1');
      expect(result.event!.timestamp).toBe('2024-01-03T10:00:00Z');
    });

    // @inc-02 @f8 @must — Offline-to-online records event
    it('should record online event on re-detection', () => {
      const state = makePresence({ status: 'offline', missedScans: 5 });

      const result = updatePresence(state, true, '2024-01-05T10:00:00Z');

      expect(result.event).not.toBeNull();
      expect(result.event!.event).toBe('online');
      expect(result.event!.deviceId).toBe('dev-1');
      expect(result.event!.timestamp).toBe('2024-01-05T10:00:00Z');
    });

    // No event when status doesn't change
    it('should not record event when device stays online', () => {
      const state = makePresence({ status: 'online' });

      const result = updatePresence(state, true, '2024-01-02T10:00:00Z');

      expect(result.event).toBeNull();
    });
  });

  // ─── New Device Status ───

  describe('New Device Status', () => {
    // @inc-02 @f8 @must — New device starts as online
    it('should initialize new device as online with zero missed scans', () => {
      const state = initializePresence('dev-new', '2024-01-01T10:00:00Z');

      expect(state.status).toBe('online');
      expect(state.missedScans).toBe(0);
    });
  });

  // ─── Availability Calculation ───

  describe('Availability Calculation', () => {
    // @inc-02 @f8 @should — Percentage calculation
    it('should calculate availability percentage over scan window', () => {
      const availability = calculateAvailability('dev-1', 20, 24);

      expect(availability).toBeCloseTo(83.33, 0);
    });

    // @inc-02 @f8 @should — Null when no scans
    it('should return null when no scans in range', () => {
      const availability = calculateAvailability('dev-1', 0, 0);

      expect(availability).toBeNull();
    });

    // 100% availability
    it('should return 100 when device found in all scans', () => {
      const availability = calculateAvailability('dev-1', 24, 24);

      expect(availability).toBe(100);
    });

    // 0% availability
    it('should return 0 when device found in no scans', () => {
      const availability = calculateAvailability('dev-1', 0, 24);

      expect(availability).toBe(0);
    });
  });

  // ─── Batch Offline Check ───

  describe('Batch Offline Check', () => {
    // Check multiple devices at once
    it('should check offline status for multiple devices', () => {
      const devices: PresenceState[] = [
        makePresence({ deviceId: 'dev-1', missedScans: 5, offlineThreshold: 2 }),
        makePresence({ deviceId: 'dev-2', missedScans: 1, offlineThreshold: 2 }),
        makePresence({ deviceId: 'dev-3', missedScans: 3, offlineThreshold: 2 }),
      ];

      const results = checkOfflineDevices(devices, '2024-01-03T10:00:00Z');

      expect(results).toHaveLength(3);
    });
  });

  // ─── Configurable Threshold ───

  describe('Configurable Threshold', () => {
    // @inc-02 @f8 @should — Threshold of 5
    it('should respect custom offline threshold', () => {
      let state = makePresence({ status: 'online', offlineThreshold: 5, missedScans: 0 });

      // Miss 4 scans — still online
      for (let i = 0; i < 4; i++) {
        const result = updatePresence(state, false, `2024-01-0${i + 2}T10:00:00Z`);
        state = result.state;
      }
      expect(state.status).toBe('online');
      expect(state.missedScans).toBe(4);

      // Miss 5th scan — still online (threshold not exceeded yet)
      let result = updatePresence(state, false, '2024-01-06T10:00:00Z');
      state = result.state;
      expect(state.status).toBe('online');

      // Miss 6th scan — now offline (exceeded threshold of 5)
      result = updatePresence(state, false, '2024-01-07T10:00:00Z');
      state = result.state;
      expect(state.status).toBe('offline');
    });
  });

  // ─── Presence Timeline ───

  describe('Presence Timeline', () => {
    // @inc-02 @f8 @should — Query returns events in date range
    it('should return presence events within the queried date range', () => {
      const allEvents: PresenceEvent[] = [
        { deviceId: 'dev-1', event: 'online', timestamp: '2024-01-01T08:00:00Z' },
        { deviceId: 'dev-1', event: 'offline', timestamp: '2024-01-02T08:00:00Z' },
        { deviceId: 'dev-1', event: 'online', timestamp: '2024-01-03T08:00:00Z' },
        { deviceId: 'dev-1', event: 'offline', timestamp: '2024-01-05T08:00:00Z' },
      ];

      const timeline = getPresenceTimeline(
        allEvents,
        '2024-01-01T00:00:00Z',
        '2024-01-04T00:00:00Z',
      );

      expect(timeline).toHaveLength(3);
      // Verify chronological order
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].timestamp > timeline[i - 1].timestamp).toBe(true);
      }
    });

    // Empty timeline
    it('should return empty array when no events in range', () => {
      const allEvents: PresenceEvent[] = [
        { deviceId: 'dev-1', event: 'online', timestamp: '2024-01-01T08:00:00Z' },
      ];

      const timeline = getPresenceTimeline(
        allEvents,
        '2024-02-01T00:00:00Z',
        '2024-02-28T00:00:00Z',
      );

      expect(timeline).toHaveLength(0);
    });
  });
});
