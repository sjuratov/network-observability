import { test, expect } from '@playwright/test';
import { ScanHistoryPage } from './pages/ScanHistoryPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('Scan History — Flow 9: View Scan History', () => {
  let scanHistory: ScanHistoryPage;

  test.beforeEach(async ({ page }) => {
    const apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    scanHistory = new ScanHistoryPage(page);
    await scanHistory.goto();
  });

  test('should display the scan history page', async () => {
    await expect(scanHistory.pageContainer).toBeVisible();
  });

  test('should show scan now button', async () => {
    await expect(scanHistory.btnScanNow).toBeVisible();
  });

  test('should display scan history table or empty state', async () => {
    // Either the table is visible (scans exist) or empty state is shown
    const tableVisible = await scanHistory.scanHistoryTable.isVisible().catch(() => false);
    const emptyVisible = await scanHistory.emptyState.isVisible().catch(() => false);
    expect(tableVisible || emptyVisible).toBeTruthy();
  });

  test('should display table header when scans exist', async () => {
    const tableVisible = await scanHistory.scanHistoryTable.isVisible().catch(() => false);
    if (tableVisible) {
      await expect(scanHistory.scanHistoryTableHeader).toBeVisible();
    }
  });

  test('should show pagination when scans exist', async () => {
    const tableVisible = await scanHistory.scanHistoryTable.isVisible().catch(() => false);
    if (tableVisible) {
      await expect(scanHistory.pagination).toBeVisible();
      await expect(scanHistory.paginationInfo).toBeVisible();
    }
  });

  test('should expand scan row on click', async ({ page }) => {
    const tableVisible = await scanHistory.scanHistoryTable.isVisible().catch(() => false);
    if (tableVisible) {
      // Click the first expand toggle
      const firstExpand = page.locator('[data-testid^="scan-history-table-row-"][data-testid$="-expand"]').first();
      if (await firstExpand.isVisible()) {
        await firstExpand.click();
        // Verify details row appears
        const firstDetails = page.locator('[data-testid^="scan-history-table-row-"][data-testid$="-details"]').first();
        await expect(firstDetails).toBeVisible();
      }
    }
  });
});
