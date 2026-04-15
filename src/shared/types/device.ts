export interface Device {
  id: string;
  macAddress: string;
  ipAddress: string;
  hostname?: string;
  vendor?: string;
  displayName?: string;
  isKnown: boolean;
  isOnline: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  discoveryMethod: string;
  tags: string[];
  notes?: string;
}

export interface Tag {
  id: string;
  name: string;
  nameLower: string;
  createdAt: string;
}

export interface DashboardStats {
  totalDevices: number;
  newDevices24h: number;
  offlineDevices: number;
  lastScanAt: string | null;
  lastScanStatus: string | null;
}

export interface DeviceHistory {
  ipHistory: IPHistoryEntry[];
  portHistory: PortHistoryEntry[];
}

export interface IPHistoryEntry {
  ipAddress: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface PortHistoryEntry {
  port: number;
  protocol: 'tcp' | 'udp';
  service?: string;
  event: 'opened' | 'closed';
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    timestamp: string;
    pagination: {
      limit: number;
      hasMore: boolean;
      nextCursor: string | null;
      total: number;
    };
  };
}

export interface DeviceListParams {
  limit?: number;
  cursor?: string;
  search?: string;
  tag?: string;
  status?: 'online' | 'offline';
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface ScanListParams {
  limit?: number;
  cursor?: string;
}

export interface FilterParams {
  status?: 'online' | 'offline';
  tag?: string;
  vendor?: string;
}

export interface Scan {
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  devicesFound: number;
  newDevices: number;
  subnetsScanned: string[];
  errors: string[];
  scanIntensity: string;
}

export interface ScanResult {
  scanId: string;
  deviceId: string;
  macAddress: string;
  ipAddress: string;
  hostname?: string;
  vendor?: string;
  discoveryMethod: string;
  openPorts?: PortInfo[];
}

export interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: string;
  version?: string;
}
