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
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
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
    async getDevices(_params?: DeviceListParams): Promise<PaginatedResponse<Device>> {
      throw new Error('Not implemented');
    },
    async getDevice(_id: string): Promise<Device> {
      throw new Error('Not implemented');
    },
    async updateDevice(_id: string, _data: Partial<Pick<Device, 'displayName' | 'tags' | 'notes'>>): Promise<Device> {
      throw new Error('Not implemented');
    },
    async getDeviceHistory(_id: string): Promise<DeviceHistory> {
      throw new Error('Not implemented');
    },
    async getScans(_params?: ScanListParams): Promise<PaginatedResponse<Scan>> {
      throw new Error('Not implemented');
    },
    async triggerScan(): Promise<Scan> {
      throw new Error('Not implemented');
    },
    async getStats(): Promise<DashboardStats> {
      throw new Error('Not implemented');
    },
    async getTags(): Promise<Tag[]> {
      throw new Error('Not implemented');
    },
    async createTag(_name: string): Promise<Tag> {
      throw new Error('Not implemented');
    },
    async deleteTag(_id: string): Promise<void> {
      throw new Error('Not implemented');
    },
    async bulkTag(_deviceIds: string[], _tagId: string): Promise<void> {
      throw new Error('Not implemented');
    },
  };
}
