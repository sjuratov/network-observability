import { test, expect } from '@playwright/test';
import { DeviceListPage } from './pages/DeviceListPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('@flow:browse-and-search-devices @frd:frd-device-list-status Device lifecycle label', () => {
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

  test('clears the New label after the device appears in another completed scan', async ({ page, request }) => {
    const created = await request.post('/api/v1/test-support/devices', {
      headers: { 'X-API-Key': apiKey },
      data: { lifecycleState: 'new', displayName: 'Staging Sensor' },
    });
    expect(created.status()).toBe(201);
    const { data } = await created.json();
    const deviceId = data.id as string;

    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();
    await expect(page.getByTestId(`device-row-${deviceId}-lifecycle-label`)).toHaveText('New');

    const updated = await request.post('/api/v1/test-support/presence-events', {
      headers: { 'X-API-Key': apiKey },
      data: { lifecycleState: 'new', resultingStatus: 'online', threshold: 2 },
    });
    expect(updated.status()).toBe(201);

    await page.reload();
    await expect(deviceList.pageContainer).toBeVisible();
    await expect(page.getByTestId(`device-row-${deviceId}`)).toBeVisible();
    await expect(page.getByTestId(`device-row-${deviceId}-lifecycle-label`)).toHaveCount(0);
  });
});
