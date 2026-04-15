import { Page, Locator } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Tabs (SettingsPage uses custom testIds via TabBar)
  readonly tabGeneral: Locator;
  readonly tabNetwork: Locator;
  readonly tabAlerts: Locator;
  readonly tabApi: Locator;

  // Panels
  readonly panelGeneral: Locator;
  readonly panelNetwork: Locator;
  readonly panelAlerts: Locator;
  readonly panelApi: Locator;

  // General settings
  readonly inputCron: Locator;
  readonly cronPreview: Locator;
  readonly scanIntensity: Locator;
  readonly inputRetentionDays: Locator;
  readonly btnSaveGeneral: Locator;

  // Network settings
  readonly subnetList: Locator;
  readonly inputManualSubnet: Locator;
  readonly btnAddSubnet: Locator;
  readonly btnSaveNetwork: Locator;

  // Alerts settings
  readonly inputWebhookUrl: Locator;
  readonly btnTestWebhook: Locator;
  readonly btnSaveAlerts: Locator;

  // API settings
  readonly apiKeyDisplay: Locator;
  readonly apiKeyValue: Locator;
  readonly btnShowKey: Locator;
  readonly btnCopyKey: Locator;
  readonly btnRegenerateKey: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('page-settings');

    this.tabGeneral = page.getByTestId('tab-general');
    this.tabNetwork = page.getByTestId('tab-network');
    this.tabAlerts = page.getByTestId('tab-alerts');
    this.tabApi = page.getByTestId('tab-api');

    this.panelGeneral = page.getByTestId('panel-general');
    this.panelNetwork = page.getByTestId('panel-network');
    this.panelAlerts = page.getByTestId('panel-alerts');
    this.panelApi = page.getByTestId('panel-api');

    this.inputCron = page.getByTestId('input-cron');
    this.cronPreview = page.getByTestId('cron-preview');
    this.scanIntensity = page.getByTestId('scan-intensity');
    this.inputRetentionDays = page.getByTestId('input-retention-days');
    this.btnSaveGeneral = page.getByTestId('btn-save-general');

    this.subnetList = page.getByTestId('subnet-list');
    this.inputManualSubnet = page.getByTestId('input-manual-subnet');
    this.btnAddSubnet = page.getByTestId('btn-add-subnet');
    this.btnSaveNetwork = page.getByTestId('btn-save-network');

    this.inputWebhookUrl = page.getByTestId('input-webhook-url');
    this.btnTestWebhook = page.getByTestId('btn-test-webhook');
    this.btnSaveAlerts = page.getByTestId('btn-save-alerts');

    this.apiKeyDisplay = page.getByTestId('api-key-display');
    this.apiKeyValue = page.getByTestId('api-key-value');
    this.btnShowKey = page.getByTestId('btn-show-key');
    this.btnCopyKey = page.getByTestId('btn-copy-key');
    this.btnRegenerateKey = page.getByTestId('btn-regenerate-key');
  }

  async goto() {
    await this.page.goto('/settings');
    await this.page.waitForLoadState('domcontentloaded');
  }
}
