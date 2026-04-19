import { test, expect } from '@playwright/test';
import { SettingsPage } from './pages/SettingsPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

type SettingsSeed = Partial<{
  subnets: string[];
  alertWebhookUrl: string | null;
  alertCooldownSeconds: number;
  alertEmailSmtp: {
    host: string;
    port: number;
    user: string;
    password: string;
    recipient: string;
  };
}>;

type SubnetsResponse = {
  data: {
    detected: Array<{ cidr: string }>;
    configured: Array<{ cidr: string }>;
    effective: string[];
  };
};

type ConfigResponse = {
  data: {
    subnets: string[];
    alertWebhookUrl?: string | null;
    alertCooldownSeconds: number;
    alertEmailSmtp?: {
      host: string;
      port: number;
      user: string;
      password: string;
      recipient: string;
    };
  };
};

const BASELINE_ALERTS = {
  alertWebhookUrl: 'https://hooks.example.com/current-netobserver',
  alertCooldownSeconds: 300,
  alertEmailSmtp: {
    host: 'smtp.example.com',
    port: 587,
    user: 'alerts@example.com',
    password: 'secret-password',
    recipient: 'admin@example.com',
  },
} as const;

async function seedSettings(request: Parameters<typeof test.beforeEach>[0]['request'], apiKey: string, settings: SettingsSeed) {
  const response = await request.patch('/api/v1/config', {
    headers: { 'X-API-Key': apiKey },
    data: settings,
  });

  expect(response.status()).toBe(200);
}

async function fetchConfiguredSubnets(request: Parameters<typeof test.beforeEach>[0]['request'], apiKey: string) {
  const response = await request.get('/api/v1/config/subnets', {
    headers: { 'X-API-Key': apiKey },
  });

  expect(response.status()).toBe(200);
  return response.json() as Promise<SubnetsResponse>;
}

async function fetchEffectiveConfig(request: Parameters<typeof test.beforeEach>[0]['request'], apiKey: string) {
  const response = await request.get('/api/v1/config', {
    headers: { 'X-API-Key': apiKey },
  });

  expect(response.status()).toBe(200);
  return response.json() as Promise<ConfigResponse>;
}

test.describe('@flow:set-up-webhook-alerts @frd:frd-settings-ui Settings Network and Alerts tab wiring', () => {
  let settings: SettingsPage;
  let apiKey: string;

  test.beforeEach(async ({ page }) => {
    apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    settings = new SettingsPage(page);
  });

  test('loads detected and configured subnets on the Network tab', async ({ request }) => {
    await seedSettings(request, apiKey, { subnets: ['10.0.0.0/24'] });
    const subnetState = await fetchConfiguredSubnets(request, apiKey);

    await settings.goto();
    await settings.openNetworkTab();

    await expect(settings.pageContainer).toBeVisible();
    await expect(settings.panelNetwork).toBeVisible();
    await expect(settings.detectedSubnetList).toBeVisible();
    await expect(settings.configuredSubnetList).toBeVisible();

    const [firstDetected] = subnetState.data.detected;
    if (firstDetected) {
      await expect(settings.detectedSubnet(firstDetected.cidr)).toBeVisible();
      await expect(settings.detectedSubnetBadge(firstDetected.cidr)).toContainText('Detected');
    }

    await expect(settings.configuredSubnet('10.0.0.0/24')).toBeVisible();
  });

  test('adds a manual subnet and persists it from the Network tab', async ({ request }) => {
    await seedSettings(request, apiKey, { subnets: ['10.0.0.0/24'] });

    await settings.goto();
    await settings.openNetworkTab();
    await settings.addManualSubnet('10.20.30.0/24');

    await expect(settings.configuredSubnet('10.20.30.0/24')).toBeVisible();

    await settings.saveNetwork();
    await expect(settings.alertBanner).toContainText('Settings saved successfully');

    const config = await fetchEffectiveConfig(request, apiKey);
    expect(config.data.subnets).toEqual(expect.arrayContaining(['10.0.0.0/24', '10.20.30.0/24']));
  });

  test('tests webhook delivery before saving alert changes', async () => {
    await settings.goto();
    await settings.openAlertsTab();

    await settings.changeWebhookUrl('https://hooks.example.com/netobserver');
    await expect(settings.btnTestWebhook).toBeEnabled();

    await settings.testWebhook();

    await expect(settings.webhookTestResult).toContainText('Success');
    await expect(settings.webhookTestResult).toContainText('200');
  });

  test('tests email delivery from candidate SMTP settings', async () => {
    await settings.goto();
    await settings.openAlertsTab();

    await settings.fillSmtp({
      host: 'smtp.example.com',
      port: '587',
      user: 'alerts@example.com',
      password: 'test-password',
      recipient: 'admin@example.com',
    });
    await expect(settings.btnTestEmail).toBeEnabled();

    await settings.testEmail();

    await expect(settings.emailTestResult).toContainText('Success');
  });

  test('saves alert settings from the Alerts tab', async ({ request }) => {
    await seedSettings(request, apiKey, BASELINE_ALERTS);

    await settings.goto();
    await settings.openAlertsTab();
    await settings.changeWebhookUrl('https://hooks.example.com/updated-netobserver');
    await settings.fillSmtp({
      host: 'smtp-updated.example.com',
      port: '2525',
      user: 'updated-alerts@example.com',
      password: 'updated-password',
      recipient: 'ops@example.com',
    });
    await settings.changeAlertCooldown('120');
    await settings.saveAlerts();

    await expect(settings.alertBanner).toContainText('Alert settings saved');

    const config = await fetchEffectiveConfig(request, apiKey);
    expect(config.data).toMatchObject({
      alertWebhookUrl: 'https://hooks.example.com/updated-netobserver',
      alertCooldownSeconds: 120,
      alertEmailSmtp: {
        host: 'smtp-updated.example.com',
        port: 2525,
        user: 'updated-alerts@example.com',
        recipient: 'ops@example.com',
      },
    });
  });
});
