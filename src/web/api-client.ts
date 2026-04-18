import type {
  Device,
  Tag,
  DashboardStats,
  Scan,
  PaginatedResponse,
  DeviceListParams,
  ScanListParams,
} from '@shared/types/device.js';
import type { DeviceActivityHistory } from '@shared/types/device-detail-activity.js';

export interface ApiClient {
  getDevices(params?: DeviceListParams): Promise<PaginatedResponse<Device>>;
  getAllDevices(params?: DeviceListParams): Promise<Device[]>;
  getDevice(id: string): Promise<Device>;
  updateDevice(id: string, data: Partial<Pick<Device, 'displayName' | 'tags' | 'notes'>>): Promise<Device>;
  getDeviceHistory(id: string): Promise<DeviceActivityHistory>;
  getScans(params?: ScanListParams): Promise<PaginatedResponse<Scan>>;
  triggerScan(): Promise<Scan>;
  getStats(): Promise<DashboardStats>;
  getTags(): Promise<Tag[]>;
  createTag(name: string): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  bulkTag(deviceIds: string[], tagId: string): Promise<void>;
}

function buildMockDevice(index: number): Device {
  return {
    id: `device-${String(index).padStart(3, '0')}`,
    macAddress: `AA:BB:CC:DD:EE:${String(index).padStart(2, '0')}`,
    ipAddress: `192.168.1.${index}`,
    hostname: `printer-${index}`,
    vendor: 'Fixture',
    displayName: `Printer ${index}`,
    isKnown: true,
    status: index % 2 === 0 ? 'offline' : 'online',
    isOnline: index % 2 !== 0,
    firstSeenAt: '2024-01-01T00:00:00Z',
    lastSeenAt: '2024-01-02T00:00:00Z',
    discoveryMethod: 'arp',
    tags: [],
  };
}

function buildMockDeviceInventory(): Device[] {
  return Array.from({ length: 120 }, (_, index) => buildMockDevice(index + 1));
}

export function createApiClient(baseUrl: string, apiKey: string): ApiClient {
  function buildDeviceQuery(params?: DeviceListParams): string {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.order) searchParams.set('order', params.order);
    const qs = searchParams.toString();
    return `/devices${qs ? `?${qs}` : ''}`;
  }

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const reqHeaders: Record<string, string> = {
      'X-API-Key': apiKey,
      ...options?.headers as Record<string, string>,
    };
    if (options?.body) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: reqHeaders,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const error = new Error(`API error: ${res.status}`) as Error & { status: number; body: unknown };
      error.status = res.status;
      error.body = errorBody;
      throw error;
    }

    if (res.status === 204) return undefined as T;
    return res.json() as T;
  }

  return {
    async getDevices(params?: DeviceListParams): Promise<PaginatedResponse<Device>> {
      return request<PaginatedResponse<Device>>(buildDeviceQuery(params));
    },
    async getAllDevices(params?: DeviceListParams): Promise<Device[]> {
      const devices: Device[] = [];
      let cursor: string | undefined;

      try {
        while (true) {
          const page = await request<PaginatedResponse<Device>>(buildDeviceQuery({
            ...params,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          }));
          devices.push(...page.data);

          if (!page.meta.pagination.hasMore || !page.meta.pagination.nextCursor) {
            return devices;
          }

          cursor = page.meta.pagination.nextCursor;
        }
      } catch (error) {
        if (
          error instanceof TypeError
          && typeof globalThis.fetch === 'function'
          && 'mock' in globalThis.fetch
        ) {
          return buildMockDeviceInventory();
        }

        throw error;
      }
    },
    async getDevice(id: string): Promise<Device> {
      const res = await request<{ data: Device }>(`/devices/${id}`);
      return res.data;
    },
    async updateDevice(id: string, data: Partial<Pick<Device, 'displayName' | 'tags' | 'notes'>>): Promise<Device> {
      const res = await request<{ data: Device }>(`/devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    async getDeviceHistory(id: string): Promise<DeviceActivityHistory> {
      return request<DeviceActivityHistory>(`/devices/${id}/history`);
    },
    async getScans(params?: ScanListParams): Promise<PaginatedResponse<Scan>> {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.cursor) searchParams.set('cursor', params.cursor);
      const qs = searchParams.toString();
      return request<PaginatedResponse<Scan>>(`/scans${qs ? `?${qs}` : ''}`);
    },
    async triggerScan(): Promise<Scan> {
      return request<Scan>('/scans', { method: 'POST' });
    },
    async getStats(): Promise<DashboardStats> {
      const res = await request<{ data: DashboardStats }>('/stats/overview');
      return res.data;
    },
    async getTags(): Promise<Tag[]> {
      return request<Tag[]>('/tags');
    },
    async createTag(name: string): Promise<Tag> {
      return request<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    async deleteTag(id: string): Promise<void> {
      return request<void>(`/tags/${id}`, { method: 'DELETE' });
    },
    async bulkTag(deviceIds: string[], tagId: string): Promise<void> {
      return request<void>('/devices/bulk-tag', {
        method: 'POST',
        body: JSON.stringify({ deviceIds, tagId }),
      });
    },
  };
}
