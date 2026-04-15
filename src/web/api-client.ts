import type {
  Device,
  Tag,
  DashboardStats,
  DeviceHistory,
  Scan,
  PaginatedResponse,
  DeviceListParams,
  ScanListParams,
} from '@shared/types/device.js';

export interface ApiClient {
  getDevices(params?: DeviceListParams): Promise<PaginatedResponse<Device>>;
  getDevice(id: string): Promise<Device>;
  updateDevice(id: string, data: Partial<Pick<Device, 'displayName' | 'tags' | 'notes'>>): Promise<Device>;
  getDeviceHistory(id: string): Promise<DeviceHistory>;
  getScans(params?: ScanListParams): Promise<PaginatedResponse<Scan>>;
  triggerScan(): Promise<Scan>;
  getStats(): Promise<DashboardStats>;
  getTags(): Promise<Tag[]>;
  createTag(name: string): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  bulkTag(deviceIds: string[], tagId: string): Promise<void>;
}

export function createApiClient(baseUrl: string, apiKey: string): ApiClient {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

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
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.cursor) searchParams.set('cursor', params.cursor);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.tag) searchParams.set('tag', params.tag);
      if (params?.search) searchParams.set('search', params.search);
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.order) searchParams.set('order', params.order);
      const qs = searchParams.toString();
      return request<PaginatedResponse<Device>>(`/devices${qs ? `?${qs}` : ''}`);
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
    async getDeviceHistory(id: string): Promise<DeviceHistory> {
      try {
        const res = await request<DeviceHistory>(`/devices/${id}/history`);
        return {
          ipHistory: res.ipHistory ?? [],
          portHistory: res.portHistory ?? [],
        };
      } catch {
        // Fallback if API structure differs
        return { ipHistory: [], portHistory: [] };
      }
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
