import { test, expect } from '@playwright/test';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('Device Detail — Flow 3: View Device Details', () => {
  let detail: DeviceDetailPage;

  test.beforeEach(async ({ page }) => {
    const apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    detail = new DeviceDetailPage(page);
    await detail.goto('device-001');
    await page.waitForSelector('[data-testid="page-device-detail"]', { timeout: 10000 });
  });

  test('should display the device detail page', async () => {
    await expect(detail.pageContainer).toBeVisible();
  });

  test('should show breadcrumb navigation', async () => {
    await expect(detail.breadcrumb).toBeVisible();
    await expect(detail.breadcrumbDevices).toBeVisible();
    await expect(detail.breadcrumbCurrent).toBeVisible();
  });

  test('should display device identity card', async () => {
    await expect(detail.identityCard).toBeVisible();
    await expect(detail.identityName).toBeVisible();
    await expect(detail.identityMac).toBeVisible();
    await expect(detail.identityVendor).toBeVisible();
    await expect(detail.identityStatus).toBeVisible();
  });

  test('should display tab bar with all tabs', async () => {
    await expect(detail.tabBar).toBeVisible();
    await expect(detail.tabOverview).toBeVisible();
    await expect(detail.tabHistory).toBeVisible();
    await expect(detail.tabPorts).toBeVisible();
    await expect(detail.tabPresence).toBeVisible();
    await expect(detail.tabTags).toBeVisible();
  });

  test('should show overview panel by default', async () => {
    await expect(detail.panelOverview).toBeVisible();
  });

  test('should switch to IP History tab', async () => {
    await detail.tabHistory.click();
    await expect(detail.panelIpHistory).toBeVisible();
    await expect(detail.ipHistoryTable).toBeVisible();
  });

  test('should switch to Ports tab', async () => {
    await detail.tabPorts.click();
    await expect(detail.panelPorts).toBeVisible();
    await expect(detail.portTable).toBeVisible();
  });

  test('should switch to Presence tab', async () => {
    await detail.tabPresence.click();
    await expect(detail.panelPresence).toBeVisible();
    await expect(detail.presenceTimeline).toBeVisible();
    await expect(detail.presenceTimelineChart).toBeVisible();
    await expect(detail.presenceTimelineLegend).toBeVisible();
  });

  test('should switch to Tags tab', async () => {
    await detail.tabTags.click();
    await expect(detail.panelTags).toBeVisible();
    await expect(detail.deviceTags).toBeVisible();
    await expect(detail.tagInput).toBeVisible();
    await expect(detail.tagInputField).toBeVisible();
  });

  test('should navigate back to devices via breadcrumb', async ({ page }) => {
    await detail.breadcrumbDevices.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('page-device-list')).toBeVisible();
  });
});
