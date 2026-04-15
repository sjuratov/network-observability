import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/DashboardPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('Dashboard — Flow 1: First-Run / Dashboard', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    const apiKey = getApiKey();
    // Set API key before navigating to the target page
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    dashboard = new DashboardPage(page);
  });

  test('should display the dashboard page', async () => {
    await expect(dashboard.pageContainer).toBeVisible();
  });

  test('should show API key prompt when no key is set', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('netobserver-api-key'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const prompt = new DashboardPage(page);
    await expect(prompt.apiKeyPrompt).toBeVisible();
    await expect(prompt.apiKeyInput).toBeVisible();
    await expect(prompt.apiKeySave).toBeVisible();
  });

  test('should display metric cards with data', async () => {
    await expect(dashboard.metricTotalDevices).toBeVisible();
    await expect(dashboard.metricTotalDevicesValue).toBeVisible();
    await expect(dashboard.metricTotalDevicesLabel).toBeVisible();

    await expect(dashboard.metricNewDevices).toBeVisible();
    await expect(dashboard.metricNewDevicesValue).toBeVisible();

    await expect(dashboard.metricOfflineDevices).toBeVisible();
    await expect(dashboard.metricOfflineDevicesValue).toBeVisible();

    await expect(dashboard.metricLastScan).toBeVisible();
    await expect(dashboard.metricLastScanValue).toBeVisible();
  });

  test('should display recent activity section', async () => {
    await expect(dashboard.recentActivity).toBeVisible();
  });

  test('should display quick actions with scan button', async () => {
    await expect(dashboard.quickActions).toBeVisible();
  });

  test('should display network summary section', async () => {
    await expect(dashboard.networkSummary).toBeVisible();
  });
});
