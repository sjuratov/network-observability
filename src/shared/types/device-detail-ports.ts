import type { PortInfo } from './device.js';

export interface DevicePortsSnapshotEntry extends PortInfo {
  service?: string;
  version?: string;
}

export interface DevicePortsSnapshotResponse {
  data: DevicePortsSnapshotEntry[];
  meta: {
    timestamp: string;
  };
}

export interface DevicePortsSnapshotErrorBody {
  code: 'UNAUTHORIZED';
  message: string;
}

export interface DevicePortsSnapshotErrorResponse {
  error: DevicePortsSnapshotErrorBody;
  meta: {
    timestamp: string;
  };
}
