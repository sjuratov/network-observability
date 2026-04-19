import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';

export class DeviceListPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Search
  readonly searchBar: Locator;
  readonly searchBarInput: Locator;
  readonly searchBarClear: Locator;

  // Filters
  readonly filterChips: Locator;
  readonly filterStatusAll: Locator;
  readonly filterStatusOnline: Locator;
  readonly filterStatusOffline: Locator;
  readonly filterStatusNew: Locator;
  readonly filterChipsClear: Locator;
  readonly filterTag: Locator;
  readonly filterVendor: Locator;

  // Table
  readonly deviceTable: Locator;
  readonly deviceTableHeader: Locator;
  readonly deviceTableBody: Locator;
  readonly deviceTableRowCount: Locator;
  readonly sortByName: Locator;
  readonly sortByIp: Locator;
  readonly sortByVendor: Locator;
  readonly sortByLastSeen: Locator;
  readonly sortByStatus: Locator;

  // Bulk actions
  readonly bulkActionBar: Locator;
  readonly bulkActionBarCount: Locator;
  readonly bulkActionBarTag: Locator;
  readonly bulkActionBarExport: Locator;
  readonly bulkActionBarClear: Locator;

  // Export
  readonly exportCsv: Locator;
  readonly exportJson: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly paginationPrev: Locator;
  readonly paginationNext: Locator;
  readonly paginationInfo: Locator;
  readonly paginationPageSize: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('page-device-list');

    this.searchBar = page.getByTestId('search-bar');
    this.searchBarInput = page.getByTestId('search-bar-input');
    this.searchBarClear = page.getByTestId('search-bar-clear');

    this.filterChips = page.getByTestId('filter-chips');
    this.filterStatusAll = page.getByTestId('filter-chips-status-all');
    this.filterStatusOnline = page.getByTestId('filter-chips-status-online');
    this.filterStatusOffline = page.getByTestId('filter-chips-status-offline');
    this.filterStatusNew = page.getByTestId('filter-chips-status-new');
    this.filterChipsClear = page.getByTestId('filter-chips-clear');
    this.filterTag = page.getByTestId('filter-chips-tag');
    this.filterVendor = page.getByTestId('filter-chips-vendor');

    this.deviceTable = page.getByTestId('device-table');
    this.deviceTableHeader = page.getByTestId('device-table-header');
    this.deviceTableBody = page.getByTestId('device-table-body');
    this.deviceTableRowCount = page.getByTestId('device-table-row-count');
    this.sortByName = page.getByTestId('device-table-sort-name');
    this.sortByIp = page.getByTestId('device-table-sort-ip');
    this.sortByVendor = page.getByTestId('device-table-sort-vendor');
    this.sortByLastSeen = page.getByTestId('device-table-sort-last-seen');
    this.sortByStatus = page.getByTestId('device-table-sort-status');

    this.bulkActionBar = page.getByTestId('bulk-action-bar');
    this.bulkActionBarCount = page.getByTestId('bulk-action-bar-count');
    this.bulkActionBarTag = page.getByTestId('bulk-action-bar-tag');
    this.bulkActionBarExport = page.getByTestId('bulk-action-bar-export');
    this.bulkActionBarClear = page.getByTestId('bulk-action-bar-clear');

    this.exportCsv = page.getByTestId('export-button-csv');
    this.exportJson = page.getByTestId('export-button-json');

    this.pagination = page.getByTestId('pagination');
    this.paginationPrev = page.getByTestId('pagination-prev');
    this.paginationNext = page.getByTestId('pagination-next');
    this.paginationInfo = page.getByTestId('pagination-info');
    this.paginationPageSize = page.getByTestId('pagination-page-size');
  }

  async goto() {
    await this.page.goto('/devices');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async showOfflineDevices() {
    await this.filterStatusOffline.click();
  }

  async filteredDeviceCount(): Promise<number> {
    const text = await this.deviceTableRowCount.textContent();
    const match = text?.match(/(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
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

  async visibleRowCount(): Promise<number> {
    return this.deviceTableBody.locator('tr[data-testid^="device-row-"]').count();
  }

  rowAt(index: number) {
    return this.deviceTableBody.locator('tr[data-testid^="device-row-"]').nth(index);
  }

  rowNameAt(index: number) {
    return this.rowAt(index).locator('[data-testid$="-name"]');
  }

  async visibleDeviceNameAt(index: number): Promise<string> {
    return (await this.rowNameAt(index).textContent())?.trim() ?? '';
  }

  async visibleDeviceIpAt(index: number): Promise<string> {
    return (await this.rowAt(index).locator('[data-testid$="-ip"]').textContent())?.trim() ?? '';
  }

  async expectVisibleRowsToHaveStatus(status: 'online' | 'offline' | 'new' | 'unknown') {
    const rows = await this.visibleRowCount();
    for (let index = 0; index < rows; index += 1) {
      await expect(this.rowAt(index).getByTestId(`status-badge-${status}`)).toBeVisible();
    }
  }

  async expectVisibleRowsNotToHaveStatus(status: 'online' | 'offline' | 'new' | 'unknown') {
    const rows = await this.visibleRowCount();
    for (let index = 0; index < rows; index += 1) {
      await expect(this.rowAt(index).getByTestId(`status-badge-${status}`)).toHaveCount(0);
    }
  }

  async expectRowAtToHaveStatus(index: number, status: 'online' | 'offline' | 'new' | 'unknown') {
    await expect(this.rowAt(index).getByTestId(`status-badge-${status}`)).toBeVisible();
  }

  async expectRowAtNotToHaveStatus(index: number, status: 'online' | 'offline' | 'new' | 'unknown') {
    await expect(this.rowAt(index).getByTestId(`status-badge-${status}`)).toHaveCount(0);
  }

  deviceRow(deviceId: string) {
    return this.page.getByTestId(`device-row-${deviceId}`);
  }

  deviceRowName(deviceId: string) {
    return this.page.getByTestId(`device-row-${deviceId}-name`);
  }

  deviceRowCheckbox(deviceId: string) {
    return this.page.getByTestId(`device-row-${deviceId}-checkbox`);
  }
}
