import { test, expect } from '@playwright/test';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('@flow:view-device-details @frd:frd-device-detail-activity Device Detail ports presentation', () => {
  let detail: DeviceDetailPage;
  let apiKey: string;

  test.beforeEach(async ({ page, request }) => {
    apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const response = await request.post('/api/v1/test-support/device-detail-activity', {
      headers: { 'X-API-Key': apiKey },
      data: { deviceId: 'device-001', historyRows: 1, portFixture: 'mixed-version-ports' },
    });

    expect(response.status()).toBe(201);

    detail = new DeviceDetailPage(page);
    await detail.goto('device-001');
    await expect(detail.pageContainer).toBeVisible();
  });

  test('shows only Port, Protocol, and Service as the primary headers', async () => {
    await detail.tabPorts.click();
    await expect(detail.panelPorts).toBeVisible();
    await expect.poll(() => detail.portHeaderLabels()).toEqual(['Port', 'Protocol', 'Service']);
    await expect(detail.portVersionHeader).toHaveCount(0);
  });

  test('renders version metadata inline only for services that have it', async () => {
    await detail.tabPorts.click();
    await expect(detail.panelPorts).toBeVisible();
    await expect(detail.portServiceCell(0)).toContainText(/OpenSSH 9\.7|nginx 1\.25\.3/);
    await expect(detail.portServiceCell(1)).not.toContainText('—');
    await expect(detail.portTable).not.toContainText('Version');
  });
});
