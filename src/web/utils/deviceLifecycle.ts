import type { Device } from '@shared/types/device.js';

function resolveDeviceStatus(device: Device): 'online' | 'offline' | 'unknown' {
  return device.status ?? (device.isOnline ? 'online' : 'offline');
}

export function isNewLifecycleDevice(device: Device): boolean {
  return !device.isKnown && resolveDeviceStatus(device) === 'unknown';
}
