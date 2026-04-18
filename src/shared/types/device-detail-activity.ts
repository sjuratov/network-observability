import type {
  DeviceHistory,
  DeviceStatus,
  IPHistoryEntry,
  PortHistoryEntry,
} from './device.js';

export type DeviceActivityEventType = 'ip-change' | 'presence-online' | 'presence-offline';

export interface DevicePresenceSummary {
  status: DeviceStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt?: string | null;
  summaryLabel?: string;
}

export interface DeviceActivityEvent {
  type: DeviceActivityEventType;
  label: string;
  timestamp: string;
  previousValue?: string | null;
  nextValue?: string | null;
}

export interface DeviceActivityHistory extends Omit<DeviceHistory, 'presenceSummary' | 'activityEvents'> {
  presenceSummary: DevicePresenceSummary;
  ipHistory: IPHistoryEntry[];
  activityEvents: DeviceActivityEvent[];
  portHistory: PortHistoryEntry[];
}

export interface DeviceActivityHistoryErrorBody {
  code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'INTERNAL_ERROR';
  message: string;
}

export interface DeviceActivityHistoryErrorResponse {
  error: DeviceActivityHistoryErrorBody;
  meta: {
    timestamp: string;
  };
}
