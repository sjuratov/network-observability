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

    await expect(dashboard.metricOnlineDevices).toBeVisible();
    await expect(dashboard.metricOnlineDevicesValue).toBeVisible();

    await expect(dashboard.metricOfflineDevices).toBeVisible();
    await expect(dashboard.metricOfflineDevicesValue).toBeVisible();

    await expect(dashboard.metricLastScan).toBeVisible();
    await expect(dashboard.metricLastScanValue).toBeVisible();
  });

  test('should display metric cards in correct order', async () => {
    const cards = dashboard.metricsContainer.locator('[data-testid^="metric-card-"]');
    const testIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );
    expect(testIds).toEqual([
      'metric-card-total-devices',
      'metric-card-new-devices',
      'metric-card-online-devices',
      'metric-card-offline-devices',
      'metric-card-last-scan',
    ]);
  });

  test('should display recent activity section', async () => {
    await expect(dashboard.recentActivity).toBeVisible();
  });

  test('should display quick actions with scan button', async () => {
    await expect(dashboard.quickActions).toBeVisible();
  });

  test('should display device breakdown with vendor as default', async () => {
    await expect(dashboard.deviceBreakdown).toBeVisible();
    await expect(dashboard.breakdownSelect).toBeVisible();
    await expect(dashboard.breakdownSelect).toHaveValue('vendor');
    await expect(dashboard.breakdownChart).toBeVisible();
  });

  test('should have all six breakdown dropdown options', async () => {
    const options = dashboard.breakdownSelect.locator('option');
    const values = await options.evaluateAll((els) =>
      els.map((el) => el.getAttribute('value')),
    );
    expect(values).toEqual(['vendor', 'tag', 'status', 'method', 'age', 'known']);
  });

  test('should update breakdown chart when dropdown changes', async () => {
    await dashboard.breakdownSelect.selectOption('status');
    await expect(dashboard.breakdownSelect).toHaveValue('status');
    await expect(dashboard.breakdownChart).toBeVisible();
  });

  test('should not render retired dashboard sections', async () => {
    await expect(dashboard.networkSummary).toHaveCount(0);
    await expect(dashboard.deviceTrend).toHaveCount(0);
  });
});
