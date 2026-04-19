import { test, expect } from '@playwright/test';
import { DeviceListPage } from './pages/DeviceListPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('@flow:browse-and-search-devices @frd:frd-device-list-status Device List page size controls', () => {
  let deviceList: DeviceListPage;
  let apiKey: string;

  test.beforeEach(async ({ page, request }) => {
    apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const response = await request.post('/api/v1/test-support/device-inventory', {
      headers: { 'X-API-Key': apiKey },
      data: { fixture: 'page-size-controls' },
    });

    expect(response.status()).toBe(201);

    deviceList = new DeviceListPage(page);
  });

  test('shows the approved rows-per-page options and defaults to 50 rows sorted by IP address', async () => {
    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();
    await expect(deviceList.paginationPageSize).toBeVisible();

    await expect.poll(() => deviceList.pageSizeOptions()).toEqual(['10', '25', '50', '100', 'All']);
    await expect.poll(() => deviceList.selectedPageSize()).toBe('50');
    await expect.poll(() => deviceList.visibleRowCount()).toBe(50);
    await expect(deviceList.paginationInfo).toContainText('Showing 1-50 of 120 devices');
    await expect(deviceList.sortByIp).toContainText('▲');
    await expect
      .poll(() => Promise.all([0, 1, 2].map((index) => deviceList.visibleDeviceIpAt(index))))
      .toEqual(['192.168.1.1', '192.168.1.2', '192.168.1.3']);
  });

  test('updates visible rows and pagination copy immediately when the page size changes', async () => {
    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.selectPageSize('25');
    await expect.poll(() => deviceList.visibleRowCount()).toBe(25);
    await expect(deviceList.paginationInfo).toContainText('Showing 1-25 of 120 devices');

    await deviceList.selectPageSize('50');
    await expect.poll(() => deviceList.visibleRowCount()).toBe(50);
    await expect(deviceList.paginationInfo).toContainText('Showing 1-50 of 120 devices');
  });

  test('remembers the chosen page size and sort after drilling into a device and returning', async ({ page }) => {
    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.selectPageSize('25');
    await deviceList.sortByName.click();
    const firstVisibleDeviceName = await deviceList.visibleDeviceNameAt(0);

    await deviceList.rowNameAt(0).click();
    await expect(page.getByTestId('page-device-detail')).toBeVisible();

    await page.getByTestId('breadcrumb-devices').click();
    await expect(deviceList.pageContainer).toBeVisible();
    await expect.poll(() => deviceList.selectedPageSize()).toBe('25');
    await expect(deviceList.sortByName).toContainText('▲');
    await expect.poll(() => deviceList.visibleRowCount()).toBe(25);
    await expect.poll(() => deviceList.visibleDeviceNameAt(0)).toBe(firstVisibleDeviceName);
  });

  test('keeps search, filters, and sort state intact when the operator switches to All', async () => {
    await deviceList.goto();
    await expect(deviceList.pageContainer).toBeVisible();

    await deviceList.searchBarInput.fill('Printer');
    await deviceList.filterStatusOffline.click();
    await deviceList.sortByLastSeen.click();

    await deviceList.selectPageSize('All');

    await expect(deviceList.searchBarInput).toHaveValue('Printer');
    await expect(deviceList.filterChipsClear).toBeVisible();
    await expect(deviceList.sortByLastSeen).toContainText('▲');
    await expect(deviceList.paginationInfo).toContainText('Showing 1-12 of 12 devices');
    await expect.poll(() => deviceList.visibleRowCount()).toBe(12);
    await deviceList.expectVisibleRowsToHaveStatus('offline');
  });
});
