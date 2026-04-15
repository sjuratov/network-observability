import { test, expect } from '@playwright/test';
import { SettingsPage } from './pages/SettingsPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('Settings — Flow 6: Configure Settings', () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    const apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    settings = new SettingsPage(page);
    await settings.goto();
  });

  test('should display the settings page', async () => {
    await expect(settings.pageContainer).toBeVisible();
  });

  test('should show settings tabs', async () => {
    await expect(settings.tabGeneral).toBeVisible();
    await expect(settings.tabNetwork).toBeVisible();
    await expect(settings.tabAlerts).toBeVisible();
    await expect(settings.tabApi).toBeVisible();
  });

  test('should show General tab content by default', async () => {
    await expect(settings.panelGeneral).toBeVisible();
    await expect(settings.inputCron).toBeVisible();
    await expect(settings.cronPreview).toBeVisible();
    await expect(settings.scanIntensity).toBeVisible();
    await expect(settings.inputRetentionDays).toBeVisible();
    await expect(settings.btnSaveGeneral).toBeVisible();
  });

  test('should switch to Network tab', async () => {
    await settings.tabNetwork.click();
    await expect(settings.panelNetwork).toBeVisible();
    await expect(settings.subnetList).toBeVisible();
    await expect(settings.inputManualSubnet).toBeVisible();
    await expect(settings.btnAddSubnet).toBeVisible();
  });

  test('should switch to Alerts tab', async () => {
    await settings.tabAlerts.click();
    await expect(settings.panelAlerts).toBeVisible();
    await expect(settings.inputWebhookUrl).toBeVisible();
    await expect(settings.btnTestWebhook).toBeVisible();
    await expect(settings.btnSaveAlerts).toBeVisible();
  });

  test('should switch to API tab', async () => {
    await settings.tabApi.click();
    await expect(settings.panelApi).toBeVisible();
    await expect(settings.apiKeyDisplay).toBeVisible();
    await expect(settings.apiKeyValue).toBeVisible();
    await expect(settings.btnShowKey).toBeVisible();
    await expect(settings.btnCopyKey).toBeVisible();
  });

  test('should toggle API key visibility', async () => {
    await settings.tabApi.click();
    // Initially masked
    const initialText = await settings.apiKeyValue.textContent();
    expect(initialText).toContain('•');

    // Click show
    await settings.btnShowKey.click();
    const revealedText = await settings.apiKeyValue.textContent();
    expect(revealedText).not.toContain('•');

    // Click hide
    await settings.btnShowKey.click();
    const hiddenText = await settings.apiKeyValue.textContent();
    expect(hiddenText).toContain('•');
  });

  test('should display cron preview description', async () => {
    await expect(settings.cronPreview).toBeVisible();
    await expect(settings.cronPreview).toContainText('Runs every');
  });
});
