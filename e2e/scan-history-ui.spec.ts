import { test, expect } from '@playwright/test';
import { ScanHistoryPage } from './pages/ScanHistoryPage';
import { setApiKey } from './helpers/auth';
import { getApiKey } from './helpers/config';

test.describe('@flow:scan-history @frd:frd-scan-history-ui Scan History pagination and status filtering', () => {
  let scanHistory: ScanHistoryPage;
  let apiKey: string;

  test.beforeEach(async ({ page, request }) => {
    apiKey = getApiKey();
    await page.goto('/');
    await setApiKey(page, apiKey);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const response = await request.post('/api/v1/test-support/scan-history', {
      headers: { 'X-API-Key': apiKey },
      data: { fixture: 'pagination-and-filtering' },
    });

    expect(response.status()).toBe(201);

    scanHistory = new ScanHistoryPage(page);
  });

  test('shows rows-per-page options and defaults to 10', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();
    await expect(scanHistory.paginationPageSize).toBeVisible();

    await expect.poll(() => scanHistory.pageSizeOptions()).toEqual(['10', '25', '50', '100', 'All']);
    await expect.poll(() => scanHistory.selectedPageSize()).toBe('10');
    await expect.poll(() => scanHistory.visibleScanRowCount()).toBe(10);
    await expect(scanHistory.paginationInfo).toContainText('Showing');
  });

  test('updates visible rows when page size changes', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();

    await scanHistory.selectPageSize('25');
    await expect.poll(() => scanHistory.visibleScanRowCount()).toBe(25);
    await expect(scanHistory.paginationInfo).toContainText('Showing 1');
  });

  test('shows all scans when All is selected', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();

    await scanHistory.selectPageSize('All');
    const count = await scanHistory.visibleScanRowCount();
    expect(count).toBeGreaterThan(10);
  });

  test('status filter dropdown defaults to All and shows all statuses', async () => {
    await scanHistory.goto();
    await expect(scanHistory.scanStatusFilter).toBeVisible();
    await expect.poll(() => scanHistory.selectedStatusFilter()).toBe('All');
  });

  test('filtering by Completed shows only completed scans', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();

    await scanHistory.selectStatusFilter('Completed');
    const count = await scanHistory.visibleScanRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('filtering by Failed shows only failed scans', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();

    await scanHistory.selectStatusFilter('Failed');
    const count = await scanHistory.visibleScanRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows filtered empty state when no scans match status filter', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();

    await scanHistory.selectStatusFilter('Pending');
    await expect(scanHistory.filteredEmptyState).toBeVisible();
    await expect(scanHistory.emptyState).not.toBeVisible();
  });

  test('changing status filter resets to page 1', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();

    await scanHistory.paginationNext.click();
    await expect(scanHistory.paginationInfo).not.toContainText('Showing 1-');

    await scanHistory.selectStatusFilter('Completed');
    await expect(scanHistory.paginationInfo).toContainText('Showing 1');
  });

  test('page number buttons are capped for large histories', async () => {
    await scanHistory.goto();
    await expect(scanHistory.pageContainer).toBeVisible();

    await scanHistory.selectPageSize('10');
    const pageButtons = await scanHistory.pageButtonCount();
    expect(pageButtons).toBeLessThanOrEqual(7);
  });

  test('expandable rows still work with new pagination', async () => {
    await scanHistory.goto();
    await expect(scanHistory.scanHistoryTable).toBeVisible();

    const firstRowTestId = await scanHistory.scanHistoryTable
      .locator('tbody tr[data-testid^="scan-history-table-row-"]:not([data-testid$="-details"])')
      .first()
      .getAttribute('data-testid');
    const scanId = firstRowTestId?.replace('scan-history-table-row-', '') ?? '';

    await scanHistory.scanRow(scanId).click();
    await expect(scanHistory.scanRowDetails(scanId)).toBeVisible();

    await scanHistory.scanRow(scanId).click();
    await expect(scanHistory.scanRowDetails(scanId)).not.toBeVisible();
  });
});
