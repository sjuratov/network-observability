export type PresenceStatus = 'online' | 'offline' | 'unknown';

export interface PresenceState {
  deviceId: string;
  status: PresenceStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  missedScans: number;
  offlineThreshold: number;
}

export interface PresenceEvent {
  deviceId: string;
  event: 'online' | 'offline';
  timestamp: string;
}

export interface PresenceTimeline {
  deviceId: string;
  events: PresenceEvent[];
}

export interface PresenceUpdateResult {
  state: PresenceState;
  event: PresenceEvent | null;
}

export function initializePresence(
  deviceId: string,
  timestamp: string,
): PresenceState {
  return {
    deviceId,
    status: 'online',
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    missedScans: 0,
    offlineThreshold: 2,
  };
}

export function updatePresence(
  state: PresenceState,
  found: boolean,
  scanTimestamp: string,
): PresenceUpdateResult {
  const updated: PresenceState = { ...state };
  let event: PresenceEvent | null = null;

  if (found) {
    updated.lastSeenAt = scanTimestamp;
    updated.missedScans = 0;

    if (state.status === 'offline') {
      updated.status = 'online';
      event = { deviceId: state.deviceId, event: 'online', timestamp: scanTimestamp };
    }
  } else {
    updated.missedScans = state.missedScans + 1;

    if (state.status === 'online' && updated.missedScans > state.offlineThreshold) {
      updated.status = 'offline';
      event = { deviceId: state.deviceId, event: 'offline', timestamp: scanTimestamp };
    }
  }

  return { state: updated, event };
}

export function checkOfflineDevices(
  devices: PresenceState[],
  scanTimestamp: string,
): PresenceUpdateResult[] {
  return devices.map((device) => {
    if (device.missedScans > device.offlineThreshold && device.status !== 'offline') {
      return {
        state: { ...device, status: 'offline' as PresenceStatus },
        event: { deviceId: device.deviceId, event: 'offline' as const, timestamp: scanTimestamp },
      };
    }
    return { state: { ...device }, event: null };
  });
}

export function calculateAvailability(
  _deviceId: string,
  scansWhereFound: number,
  totalScans: number,
): number | null {
  if (totalScans === 0) {
    return null;
  }
  return (scansWhereFound / totalScans) * 100;
}

export function getPresenceTimeline(
  events: PresenceEvent[],
  startDate: string,
  endDate: string,
): PresenceEvent[] {
  return events
    .filter((e) => e.timestamp >= startDate && e.timestamp < endDate)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}
