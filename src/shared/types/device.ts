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
