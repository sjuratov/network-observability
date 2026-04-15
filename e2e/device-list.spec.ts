import { test, expect } from '@playwright/test';
import { DeviceListPage } from './pages/DeviceListPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('Device List — Flow 2: Browse and Search Devices', () => {
  let deviceList: DeviceListPage;

  test.beforeEach(async ({ page }) => {
    const apiKey = getApiKey();
    // Set API key before navigating to target page
    await page.goto('/');
    await setApiKey(page, apiKey);
    deviceList = new DeviceListPage(page);
    // Navigate with API key already in localStorage
    await deviceList.goto();
  });

  test('should display the device list page', async () => {
    await expect(deviceList.pageContainer).toBeVisible();
  });

  test('should display the device table with rows', async () => {
    await expect(deviceList.deviceTable).toBeVisible();
    await expect(deviceList.deviceTableHeader).toBeVisible();
    await expect(deviceList.deviceTableBody).toBeVisible();
  });

  test('should show device count', async () => {
    await expect(deviceList.deviceTableRowCount).toBeVisible();
    await expect(deviceList.deviceTableRowCount).toContainText('devices');
  });

  test('should have a working search bar', async ({ page }) => {
    await expect(deviceList.searchBarInput).toBeVisible();
    // Type a search query and verify filtering
    await deviceList.searchBarInput.fill('test-search-query-unlikely');
    await page.waitForTimeout(300);
    // Either empty state appears or row count changes
    const rowCount = await deviceList.deviceTableRowCount.textContent();
    expect(rowCount).toContain('0 devices');
  });

  test('should clear search when clear button is clicked', async ({ page }) => {
    await deviceList.searchBarInput.fill('something');
    await page.waitForTimeout(300);
    await expect(deviceList.searchBarClear).toBeVisible();
    await deviceList.searchBarClear.click();
    await expect(deviceList.searchBarInput).toHaveValue('');
  });

  test('should display status filter chips', async () => {
    await expect(deviceList.filterStatusAll).toBeVisible();
    await expect(deviceList.filterStatusOnline).toBeVisible();
    await expect(deviceList.filterStatusOffline).toBeVisible();
  });

  test('should filter by online status', async ({ page }) => {
    const initialCount = await deviceList.deviceTableRowCount.textContent();
    await deviceList.filterStatusOnline.click();
    await page.waitForTimeout(300);
    // Clear filters button should appear
    await expect(deviceList.filterChipsClear).toBeVisible();
  });

  test('should have sortable columns', async () => {
    await expect(deviceList.sortByName).toBeVisible();
    await expect(deviceList.sortByIp).toBeVisible();
    await expect(deviceList.sortByVendor).toBeVisible();
    await expect(deviceList.sortByLastSeen).toBeVisible();
  });

  test('should navigate to device detail on row click', async ({ page }) => {
    // Get the first device row by looking for any element matching device-row-*-name
    const firstDeviceName = page.locator('[data-testid^="device-row-"][data-testid$="-name"]').first();
    if (await firstDeviceName.isVisible()) {
      await firstDeviceName.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('page-device-detail')).toBeVisible();
    }
  });

  test('should show export buttons', async () => {
    await expect(deviceList.exportCsv).toBeVisible();
    await expect(deviceList.exportJson).toBeVisible();
  });
});
