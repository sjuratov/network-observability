import { test, expect } from '@playwright/test';
import { SettingsPage } from './pages/SettingsPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

async function fetchConfigStatus(
  request: Parameters<typeof test.beforeEach>[0]['request'],
  apiKey: string,
) {
  return request.get('/api/v1/config', {
    headers: { 'X-API-Key': apiKey },
  });
}

test.describe('@flow:manage-api-key @frd:frd-settings-ui Settings API tab wiring', () => {
  let settings: SettingsPage;
  let originalApiKey: string;

  test.beforeEach(async ({ page, context }) => {
    originalApiKey = getApiKey();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await setApiKey(page, originalApiKey);
    settings = new SettingsPage(page);
  });

  test('shows the redacted API key on load and keeps copy disabled while hidden', async () => {
    await settings.goto();
    await settings.openApiTab();

    await expect(settings.pageContainer).toBeVisible();
    await expect(settings.panelApi).toBeVisible();
    await expect(settings.apiKeyDisplay).toBeVisible();
    await expect(settings.apiKeyValue).toContainText(originalApiKey.slice(-4));
    await expect(settings.apiKeyValue).not.toContainText(originalApiKey);
    await expect(settings.btnCopyKey).toBeDisabled();
    await expect(settings.apiRateLimitInfo).toContainText('Rate limit');
  });

  test('reveals the API key once and re-masks it without refetching on hide', async ({ page }) => {
    let revealRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().endsWith('/api/v1/config/api-key')) {
        revealRequests += 1;
      }
    });

    await settings.goto();
    await settings.openApiTab();

    const revealResponse = page.waitForResponse((response) =>
      response.request().method() === 'GET' && response.url().endsWith('/api/v1/config/api-key'),
    );

    await settings.toggleApiKeyVisibility();
    await revealResponse;

    await expect(settings.apiKeyValue).toHaveText(originalApiKey);
    await expect(settings.btnCopyKey).toBeEnabled();
    expect(revealRequests).toBe(1);

    await settings.toggleApiKeyVisibility();

    await expect(settings.apiKeyValue).toContainText(originalApiKey.slice(-4));
    await expect(settings.apiKeyValue).not.toContainText(originalApiKey);
    expect(revealRequests).toBe(1);
  });

  test('copies the revealed API key and shows feedback', async ({ page }) => {
    await settings.goto();
    await settings.openApiTab();

    await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'GET' && response.url().endsWith('/api/v1/config/api-key'),
      ),
      settings.toggleApiKeyVisibility(),
    ]);

    await settings.copyApiKey();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(originalApiKey);
    await expect(settings.alertBanner).toContainText('Copied!');
  });

  test('regenerates the API key and rolls subsequent authentication to the new key', async ({ page, request }) => {
    await settings.goto();
    await settings.openApiTab();

    await settings.startApiKeyRegeneration();

    await expect(settings.apiKeyRegenerationWarning).toBeVisible();
    await expect(settings.btnRegenerateConfirm).toBeVisible();
    await expect(settings.btnRegenerateCancel).toBeVisible();

    const regenerationResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/v1/config/regenerate-key'),
    );

    await settings.confirmApiKeyRegeneration();

    const response = await regenerationResponse;
    const body = await response.json() as { data: { apiKey: string } };
    const nextApiKey = body.data.apiKey;

    expect(nextApiKey).toMatch(/^[a-f0-9]{64}$/);
    expect(nextApiKey).not.toBe(originalApiKey);

    await expect(settings.apiKeyValue).toHaveText(nextApiKey);
    await expect(settings.alertBanner).toContainText('API key regenerated');

    const storedApiKey = await page.evaluate(() => localStorage.getItem('netobserver-api-key'));
    expect(storedApiKey).toBe(nextApiKey);

    const oldKeyResponse = await fetchConfigStatus(request, originalApiKey);
    expect(oldKeyResponse.status()).toBe(401);

    const newKeyResponse = await fetchConfigStatus(request, nextApiKey);
    expect(newKeyResponse.status()).toBe(200);

    await settings.goto();
    await expect(settings.panelGeneral).toBeVisible();
  });
});
