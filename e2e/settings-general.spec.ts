import { test, expect } from '@playwright/test';
import { SettingsPage } from './pages/SettingsPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

type GeneralSettingsSeed = {
  scanCadence: string;
  scanIntensity: 'quick' | 'normal' | 'thorough';
  dataRetentionDays: number;
};

const BASELINE_SETTINGS: GeneralSettingsSeed = {
  scanCadence: '0 */6 * * *',
  scanIntensity: 'normal',
  dataRetentionDays: 365,
};

async function seedGeneralSettings(request: Parameters<typeof test.beforeEach>[0]['request'], apiKey: string, settings: GeneralSettingsSeed) {
  const response = await request.patch('/api/v1/config', {
    headers: { 'X-API-Key': apiKey },
    data: settings,
  });

  expect(response.status()).toBe(200);
}

async function fetchEffectiveConfig(request: Parameters<typeof test.beforeEach>[0]['request'], apiKey: string) {
  const response = await request.get('/api/v1/config', {
    headers: { 'X-API-Key': apiKey },
  });

  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    data: {
      scanCadence: string;
      scanIntensity: string;
      dataRetentionDays: number;
    };
  }>;
}

test.describe('@flow:configure-scan-settings @frd:frd-settings-ui Settings General tab wiring', () => {
  let settings: SettingsPage;
  let apiKey: string;

  test.beforeEach(async ({ page }) => {
    apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    settings = new SettingsPage(page);
  });

  test('loads the current effective general settings on page open', async ({ request }) => {
    await seedGeneralSettings(request, apiKey, {
      scanCadence: '0 */4 * * *',
      scanIntensity: 'thorough',
      dataRetentionDays: 180,
    });

    await settings.goto();

    await expect(settings.pageContainer).toBeVisible();
    await expect(settings.settingsForm).toBeVisible();
    await expect(settings.panelGeneral).toBeVisible();
    await expect(settings.selectSchedulePreset).toHaveValue('every-4h');
    await expect(settings.radioThorough).toBeChecked();
    // Retention days now lives in the Database tab
    await settings.tabDatabase.click();
    await expect(settings.inputRetentionDays).toHaveValue('180');
  });

  test('saves General tab changes and shows restart-required feedback', async ({ request }) => {
    await seedGeneralSettings(request, apiKey, BASELINE_SETTINGS);

    await settings.goto();
    await settings.selectPreset('Every hour');
    await settings.selectScanIntensity('thorough');
    await settings.saveGeneral();

    await expect(settings.alertBanner).toContainText('Settings saved successfully');
    await expect(settings.restartRequiredBanner).toContainText('Some changes require a restart');
    // scanCadence is no longer restart-required — only scanIntensity is
    await expect(settings.scanCadenceRestartIndicator).not.toBeVisible();
    await expect(settings.scanIntensityRestartIndicator).toBeVisible();

    const config = await fetchEffectiveConfig(request, apiKey);
    expect(config.data).toMatchObject({
      scanCadence: '0 * * * *',
      scanIntensity: 'thorough',
    });
  });

  test('shows field-level validation feedback for an invalid general settings save', async ({ request }) => {
    await seedGeneralSettings(request, apiKey, BASELINE_SETTINGS);

    await settings.goto();
    await settings.changeScanCadence('bad-cron');
    await settings.saveGeneral();

    await expect(settings.scanCadenceError).toContainText('Invalid cron expression');

    const config = await fetchEffectiveConfig(request, apiKey);
    expect(config.data).toMatchObject(BASELINE_SETTINGS);
  });
});
