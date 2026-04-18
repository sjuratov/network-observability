import type { Page, Locator } from '@playwright/test';

export class ScanHistoryPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Table
  readonly scanHistoryTable: Locator;
  readonly scanHistoryTableHeader: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateTitle: Locator;
  readonly emptyStateAction: Locator;

  // Scan button
  readonly btnScanNow: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly paginationPrev: Locator;
  readonly paginationNext: Locator;
  readonly paginationInfo: Locator;

  // Alert
  readonly alertBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('page-scan-history');

    this.scanHistoryTable = page.getByTestId('scan-history-table');
    this.scanHistoryTableHeader = page.getByTestId('scan-history-table-header');

    this.emptyState = page.getByTestId('empty-state');
    this.emptyStateTitle = page.getByTestId('empty-state-title');
    this.emptyStateAction = page.getByTestId('empty-state-action');

    this.btnScanNow = page.getByTestId('btn-scan-now');

    this.pagination = page.getByTestId('pagination');
    this.paginationPrev = page.getByTestId('pagination-prev');
    this.paginationNext = page.getByTestId('pagination-next');
    this.paginationInfo = page.getByTestId('pagination-info');

    this.alertBanner = page.getByTestId('alert-banner');
  }

  async goto() {
    await this.page.goto('/scans');
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for loading to finish — either table or empty state appears after data loads
    await this.page.waitForFunction(() => {
      const loading = document.querySelector('[data-testid="scan-history-loading"]');
      return !loading;
    }, { timeout: 15000 });
  }

  scanRow(scanId: string) {
    return this.page.getByTestId(`scan-history-table-row-${scanId}`);
  }

  scanRowExpand(scanId: string) {
    return this.page.getByTestId(`scan-history-table-row-${scanId}-expand`);
  }

  scanRowDetails(scanId: string) {
    return this.page.getByTestId(`scan-history-table-row-${scanId}-details`);
  }

  scanRowStatus(scanId: string) {
    return this.page.getByTestId(`scan-history-table-row-${scanId}-status`);
  }
}
