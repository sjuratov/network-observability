import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly pageContainer: Locator;
  readonly apiKeyPrompt: Locator;
  readonly apiKeyInput: Locator;
  readonly apiKeySave: Locator;
  readonly navLinkDevices: Locator;

  // Metric cards
  readonly metricTotalDevices: Locator;
  readonly metricTotalDevicesValue: Locator;
  readonly metricTotalDevicesLabel: Locator;
  readonly metricNewDevices: Locator;
  readonly metricNewDevicesValue: Locator;
  readonly metricOfflineDevices: Locator;
  readonly metricOfflineDevicesValue: Locator;
  readonly metricLastScan: Locator;
  readonly metricLastScanValue: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateTitle: Locator;
  readonly emptyStateMessage: Locator;
  readonly emptyStateAction: Locator;

  // Sections
  readonly recentActivity: Locator;
  readonly quickActions: Locator;
  readonly networkSummary: Locator;

  // Alert
  readonly alertBanner: Locator;
  readonly alertBannerMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('page-dashboard');
    this.apiKeyPrompt = page.getByTestId('api-key-prompt');
    this.apiKeyInput = page.getByTestId('api-key-input');
    this.apiKeySave = page.getByTestId('api-key-save');
    this.navLinkDevices = page.getByTestId('nav-header-link-devices');

    this.metricTotalDevices = page.getByTestId('metric-card-total-devices');
    this.metricTotalDevicesValue = page.getByTestId('metric-card-total-devices-value');
    this.metricTotalDevicesLabel = page.getByTestId('metric-card-total-devices-label');
    this.metricNewDevices = page.getByTestId('metric-card-new-devices');
    this.metricNewDevicesValue = page.getByTestId('metric-card-new-devices-value');
    this.metricOfflineDevices = page.getByTestId('metric-card-offline-devices');
    this.metricOfflineDevicesValue = page.getByTestId('metric-card-offline-devices-value');
    this.metricLastScan = page.getByTestId('metric-card-last-scan');
    this.metricLastScanValue = page.getByTestId('metric-card-last-scan-value');

    this.emptyState = page.getByTestId('empty-state');
    this.emptyStateTitle = page.getByTestId('empty-state-title');
    this.emptyStateMessage = page.getByTestId('empty-state-message');
    this.emptyStateAction = page.getByTestId('empty-state-action');

    this.recentActivity = page.getByTestId('recent-activity');
    this.quickActions = page.getByTestId('quick-actions');
    this.networkSummary = page.getByTestId('network-summary');

    this.alertBanner = page.getByTestId('alert-banner');
    this.alertBannerMessage = page.getByTestId('alert-banner-message');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for dashboard content to render (metrics or empty state)
    await this.page.waitForSelector('[data-testid="metrics"], [data-testid="empty-state"], [data-testid="api-key-prompt"]', { timeout: 15000 });
  }

  async offlineDeviceCount(): Promise<number> {
    await expect.poll(async () => {
      const text = await this.metricOfflineDevicesValue.textContent();
      const trimmed = text?.trim() ?? '';
      return trimmed === '' || trimmed === '—' ? null : trimmed;
    }).not.toBeNull();

    const text = await this.metricOfflineDevicesValue.textContent();
    const value = Number.parseInt((text ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isNaN(value) ? 0 : value;
  }
}
