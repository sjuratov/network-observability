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

  // Filtered empty state
  readonly filteredEmptyState: Locator;

  // Scan button
  readonly btnScanNow: Locator;

  // Status filter
  readonly scanStatusFilter: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly paginationPrev: Locator;
  readonly paginationNext: Locator;
  readonly paginationInfo: Locator;
  readonly paginationPageSize: Locator;

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

    this.filteredEmptyState = page.getByTestId('filtered-empty-state');

    this.btnScanNow = page.getByTestId('btn-scan-now');

    this.scanStatusFilter = page.getByTestId('scan-status-filter');

    this.pagination = page.getByTestId('pagination');
    this.paginationPrev = page.getByTestId('pagination-prev');
    this.paginationNext = page.getByTestId('pagination-next');
    this.paginationInfo = page.getByTestId('pagination-info');
    this.paginationPageSize = page.getByTestId('pagination-page-size');

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

  async pageSizeOptions(): Promise<string[]> {
    return this.paginationPageSize.locator('option').evaluateAll((options) =>
      options.map((option) => option.textContent?.trim() ?? '').filter(Boolean),
    );
  }

  async selectedPageSize(): Promise<string | null> {
    return this.paginationPageSize.evaluate((select) => {
      const element = select as HTMLSelectElement;
      return element.selectedOptions[0]?.textContent?.trim() ?? null;
    });
  }

  async selectPageSize(label: '10' | '25' | '50' | '100' | 'All') {
    await this.paginationPageSize.selectOption({ label });
  }

  async selectedStatusFilter(): Promise<string | null> {
    return this.scanStatusFilter.evaluate((select) => {
      const element = select as HTMLSelectElement;
      return element.selectedOptions[0]?.textContent?.trim() ?? null;
    });
  }

  async selectStatusFilter(label: string) {
    await this.scanStatusFilter.selectOption({ label });
  }

  async visibleScanRowCount(): Promise<number> {
    return this.scanHistoryTable.locator('tbody tr[data-testid^="scan-history-table-row-"]:not([data-testid$="-details"])').count();
  }

  async pageButtonCount(): Promise<number> {
    return this.pagination.locator('button[data-testid^="pagination-page-"]').count();
  }
}
