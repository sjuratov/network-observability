import { test, expect } from '@playwright/test';
import { ScanHistoryPage } from './pages/ScanHistoryPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('@flow:view-scan-history @frd:frd-dashboard Scan History pagination', () => {
  let scanHistory: ScanHistoryPage;
  let apiKey: string;

  test.beforeEach(async ({ page }) => {
    apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    scanHistory = new ScanHistoryPage(page);
  });

  test('loads older scans when the operator moves to the next page', async ({ request }) => {
    const response = await request.post('/api/v1/test-support/scan-history', {
      headers: { 'X-API-Key': apiKey },
      data: { fixture: 'pagination-controls' },
    });
    expect(response.status()).toBe(201);
    const { data } = await response.json();
    const firstPageIds = data.firstPageIds as string[];
    const secondPageIds = data.secondPageIds as string[];

    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();
    await expect(scanHistory.paginationInfo).toContainText('Showing 1–10 of 16');
    await expect(scanHistory.scanRow(firstPageIds[0])).toBeVisible();
    await expect(scanHistory.scanRow(secondPageIds[0])).toHaveCount(0);

    await scanHistory.paginationNext.click();

    await expect(scanHistory.paginationInfo).toContainText('Showing 11–16 of 16');
    await expect(scanHistory.scanRow(firstPageIds[0])).toHaveCount(0);
    await expect(scanHistory.scanRow(secondPageIds[0])).toBeVisible();
  });
});
