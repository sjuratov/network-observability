import { test, expect } from '@playwright/test';
import { DeviceListPage } from './pages/DeviceListPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('@flow:browse-and-search-devices @frd:frd-device-list-status Device List status presentation', () => {
  let deviceList: DeviceListPage;
  let apiKey: string;

  test.beforeEach(async ({ page }) => {
    apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    deviceList = new DeviceListPage(page);
  });

  test('shows online devices with connectivity status instead of the lifecycle new badge', async ({ request }) => {
    const response = await request.post('/api/v1/test-support/presence-snapshots', {
      headers: { 'X-API-Key': apiKey },
      data: { scansSeen: 2, resultingStatus: 'online' },
    });

    expect(response.status()).toBe(201);

    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.expectRowAtToHaveStatus(0, 'online');
    await deviceList.expectRowAtNotToHaveStatus(0, 'new');
  });

  test('shows a newly discovered device as offline when presence says it is offline', async ({ request }) => {
    const created = await request.post('/api/v1/test-support/devices', {
      headers: { 'X-API-Key': apiKey },
      data: { lifecycleState: 'new', displayName: 'Staging Sensor' },
    });
    expect(created.status()).toBe(201);

    const updated = await request.post('/api/v1/test-support/presence-events', {
      headers: { 'X-API-Key': apiKey },
      data: { lifecycleState: 'new', resultingStatus: 'offline', threshold: 2 },
    });
    expect(updated.status()).toBe(201);

    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.expectRowAtToHaveStatus(0, 'offline');
    await deviceList.expectRowAtNotToHaveStatus(0, 'new');
  });

  test('shows recently seen devices as unknown until enough evidence exists', async ({ request }) => {
    const response = await request.post('/api/v1/test-support/presence-snapshots', {
      headers: { 'X-API-Key': apiKey },
      data: { scansSeen: 1, resultingStatus: 'unknown' },
    });

    expect(response.status()).toBe(201);

    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.expectRowAtToHaveStatus(0, 'unknown');
    await deviceList.expectRowAtNotToHaveStatus(0, 'new');
  });

  test('keeps offline filtered results on offline status badges only', async ({ request }) => {
    const response = await request.post('/api/v1/test-support/presence-snapshots', {
      headers: { 'X-API-Key': apiKey },
      data: { offlineDevices: 3, threshold: 2 },
    });

    expect(response.status()).toBe(201);

    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.showOfflineDevices();
    await expect(deviceList.filterChipsClear).toBeVisible();

    await deviceList.expectVisibleRowsToHaveStatus('offline');
    await deviceList.expectVisibleRowsNotToHaveStatus('new');
  });
});
