import { describe, expect, it } from 'vitest';
import { initializePresence } from '@api/presence/tracker.js';

describe('Device list status presence rules', () => {
  it('should initialize a newly discovered device as unknown until enough scan evidence exists', () => {
    const state = initializePresence('device-new-001', '2024-01-01T10:00:00Z');

    expect(state.status).toBe('unknown');
    expect(state.missedScans).toBe(0);
  });
});
