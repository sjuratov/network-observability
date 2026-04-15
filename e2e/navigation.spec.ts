import { test, expect } from '@playwright/test';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    const apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display sidebar navigation', async ({ page }) => {
    await expect(page.getByTestId('nav-sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-header')).toBeVisible();
    await expect(page.getByTestId('nav-header-logo')).toBeVisible();
  });

  test('should navigate to Dashboard', async ({ page }) => {
    await page.getByTestId('nav-header-link-dashboard').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
  });

  test('should navigate to Devices', async ({ page }) => {
    await page.getByTestId('nav-header-link-devices').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('page-device-list')).toBeVisible();
  });

  test('should navigate to Scans', async ({ page }) => {
    await page.getByTestId('nav-header-link-scans').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('page-scan-history')).toBeVisible();
  });

  test('should navigate to Settings', async ({ page }) => {
    await page.getByTestId('nav-header-link-settings').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('page-settings')).toBeVisible();
  });

  test('should highlight active nav link', async ({ page }) => {
    // Dashboard is active by default
    const dashLink = page.getByTestId('nav-header-link-dashboard');
    await expect(dashLink).toHaveClass(/border-\[#1f6feb\]/);

    // Navigate to devices and check it becomes active
    await page.getByTestId('nav-header-link-devices').click();
    await page.waitForLoadState('domcontentloaded');
    const devicesLink = page.getByTestId('nav-header-link-devices');
    await expect(devicesLink).toHaveClass(/border-\[#1f6feb\]/);
  });

  test('should show all navigation links', async ({ page }) => {
    await expect(page.getByTestId('nav-header-link-dashboard')).toBeVisible();
    await expect(page.getByTestId('nav-header-link-devices')).toBeVisible();
    await expect(page.getByTestId('nav-header-link-scans')).toBeVisible();
    await expect(page.getByTestId('nav-header-link-settings')).toBeVisible();
  });
});
