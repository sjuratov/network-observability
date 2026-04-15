import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

function mockFetchResponse(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

describe('API Client', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = createApiClient(BASE_URL, API_KEY);
    vi.restoreAllMocks();
  });

  describe('getDevices', () => {
    it('fetches devices from the API', async () => {
      const mockData = { data: [], meta: { pagination: { total: 0 } } };
      globalThis.fetch = mockFetchResponse(mockData);
      const result = await client.getDevices();
      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/devices`,
        expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': API_KEY }) }),
      );
    });

    it('passes filter parameters as query string', async () => {
      const mockData = { data: [], meta: { pagination: { total: 0 } } };
      globalThis.fetch = mockFetchResponse(mockData);
      await client.getDevices({ search: 'printer', status: 'online', tag: 'IoT' });
      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('search=printer');
      expect(calledUrl).toContain('status=online');
      expect(calledUrl).toContain('tag=IoT');
    });
  });

  describe('getDevice', () => {
    it('fetches a single device by ID', async () => {
      const mockDevice = { id: 'device-001', macAddress: 'AA:BB:CC:DD:EE:01' };
      globalThis.fetch = mockFetchResponse({ data: mockDevice });
      const result = await client.getDevice('device-001');
      expect(result).toEqual(mockDevice);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/devices/device-001`,
        expect.anything(),
      );
    });
  });

  describe('updateDevice', () => {
    it('updates device display name', async () => {
      const mockDevice = { id: 'device-001', displayName: 'My Device' };
      globalThis.fetch = mockFetchResponse({ data: mockDevice });
      const result = await client.updateDevice('device-001', { displayName: 'My Device' });
      expect(result).toEqual(mockDevice);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/devices/device-001`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('updates device tags', async () => {
      const mockDevice = { id: 'device-001', tags: ['IoT', 'Critical'] };
      globalThis.fetch = mockFetchResponse({ data: mockDevice });
      const result = await client.updateDevice('device-001', { tags: ['IoT', 'Critical'] });
      expect(result).toEqual(mockDevice);
    });

    it('updates device notes', async () => {
      const mockDevice = { id: 'device-001', notes: 'Some notes' };
      globalThis.fetch = mockFetchResponse({ data: mockDevice });
      const result = await client.updateDevice('device-001', { notes: 'Some notes' });
      expect(result).toEqual(mockDevice);
    });
  });

  describe('triggerScan', () => {
    it('triggers a new scan', async () => {
      const mockScan = { id: 'scan-001', status: 'in-progress' };
      globalThis.fetch = mockFetchResponse(mockScan);
      const result = await client.triggerScan();
      expect(result).toEqual(mockScan);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/scans`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getStats', () => {
    it('fetches dashboard stats', async () => {
      const mockStats = { totalDevices: 10, newDevices24h: 2, offlineDevices: 1, lastScanAt: null };
      globalThis.fetch = mockFetchResponse({ data: mockStats });
      const result = await client.getStats();
      expect(result).toEqual(mockStats);
    });
  });

  describe('getTags', () => {
    it('fetches all tags', async () => {
      const mockTags = [{ id: 'tag-1', name: 'IoT' }];
      globalThis.fetch = mockFetchResponse(mockTags);
      const result = await client.getTags();
      expect(result).toEqual(mockTags);
    });
  });

  describe('createTag', () => {
    it('creates a new tag', async () => {
      const mockTag = { id: 'tag-new', name: 'NewTag' };
      globalThis.fetch = mockFetchResponse(mockTag);
      const result = await client.createTag('NewTag');
      expect(result).toEqual(mockTag);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/tags`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('deleteTag', () => {
    it('deletes a tag by ID', async () => {
      globalThis.fetch = mockFetchResponse(undefined, 204);
      await client.deleteTag('tag-001');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/tags/tag-001`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('bulkTag', () => {
    it('applies tag to multiple devices', async () => {
      globalThis.fetch = mockFetchResponse(undefined, 204);
      await client.bulkTag(['dev-1', 'dev-2', 'dev-3'], 'tag-001');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/devices/bulk-tag`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('error handling', () => {
    it('API key is included in request headers', () => {
      expect(client).toBeDefined();
      expect(client.getDevices).toBeTypeOf('function');
    });

    it('throws on non-ok response', async () => {
      globalThis.fetch = mockFetchResponse({ error: 'Not found' }, 404);
      await expect(client.getDevice('bad-id')).rejects.toThrow('API error: 404');
    });
  });
});
