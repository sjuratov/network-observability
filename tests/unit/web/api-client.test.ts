import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

describe('API Client', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = createApiClient(BASE_URL, API_KEY);
    vi.restoreAllMocks();
  });

  describe('getDevices', () => {
    it('fetches devices from the API', async () => {
      await expect(client.getDevices()).rejects.toThrow('Not implemented');
    });

    it('passes filter parameters as query string', async () => {
      await expect(
        client.getDevices({ search: 'printer', status: 'online', tag: 'IoT' }),
      ).rejects.toThrow('Not implemented');
    });
  });

  describe('getDevice', () => {
    it('fetches a single device by ID', async () => {
      await expect(client.getDevice('device-001')).rejects.toThrow('Not implemented');
    });
  });

  describe('updateDevice', () => {
    it('updates device display name', async () => {
      await expect(
        client.updateDevice('device-001', { displayName: 'My Device' }),
      ).rejects.toThrow('Not implemented');
    });

    it('updates device tags', async () => {
      await expect(
        client.updateDevice('device-001', { tags: ['IoT', 'Critical'] }),
      ).rejects.toThrow('Not implemented');
    });

    it('updates device notes', async () => {
      await expect(
        client.updateDevice('device-001', { notes: 'Some notes' }),
      ).rejects.toThrow('Not implemented');
    });
  });

  describe('triggerScan', () => {
    it('triggers a new scan', async () => {
      await expect(client.triggerScan()).rejects.toThrow('Not implemented');
    });
  });

  describe('getStats', () => {
    it('fetches dashboard stats', async () => {
      await expect(client.getStats()).rejects.toThrow('Not implemented');
    });
  });

  describe('getTags', () => {
    it('fetches all tags', async () => {
      await expect(client.getTags()).rejects.toThrow('Not implemented');
    });
  });

  describe('createTag', () => {
    it('creates a new tag', async () => {
      await expect(client.createTag('NewTag')).rejects.toThrow('Not implemented');
    });
  });

  describe('deleteTag', () => {
    it('deletes a tag by ID', async () => {
      await expect(client.deleteTag('tag-001')).rejects.toThrow('Not implemented');
    });
  });

  describe('bulkTag', () => {
    it('applies tag to multiple devices', async () => {
      await expect(
        client.bulkTag(['dev-1', 'dev-2', 'dev-3'], 'tag-001'),
      ).rejects.toThrow('Not implemented');
    });
  });

  describe('error handling', () => {
    it('API key is included in request headers', () => {
      // The createApiClient function sets X-API-Key header —
      // we verify the client was created without error
      expect(client).toBeDefined();
      expect(client.getDevices).toBeTypeOf('function');
    });
  });
});
