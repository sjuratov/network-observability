import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceListPage } from './pages/DeviceListPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('@flow:device-status-alignment @frd:frd-device-list-status Device status alignment', () => {
  let dashboard: DashboardPage;
  let deviceList: DeviceListPage;

  test.beforeEach(async ({ page }) => {
    const apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    dashboard = new DashboardPage(page);
    deviceList = new DeviceListPage(page);
  });

  test('keeps dashboard offline count aligned with the offline device filter', async () => {
    await dashboard.goto();
    await expect(dashboard.metricOfflineDevices).toBeVisible();

    const offlineCount = await dashboard.offlineDeviceCount();

    await dashboard.navLinkDevices.click();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.showOfflineDevices();
    await expect(deviceList.filterChipsClear).toBeVisible();

    const filteredCount = await deviceList.filteredDeviceCount();
    expect(filteredCount).toBe(offlineCount);

    const visibleRows = await deviceList.visibleRowCount();
    expect(visibleRows).toBe(Math.min(offlineCount, 10));

    await deviceList.expectVisibleRowsToHaveStatus('offline');
  });
});
