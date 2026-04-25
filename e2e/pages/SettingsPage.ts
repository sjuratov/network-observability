import type { Page, Locator } from '@playwright/test';

function toTestIdFragment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase();
}

export class SettingsPage {
  readonly page: Page;
  readonly pageContainer: Locator;
  readonly settingsForm: Locator;

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
  readonly selectSchedulePreset: Locator;
  readonly selectScheduleHour: Locator;
  readonly hourPickerGroup: Locator;
  readonly customCronGroup: Locator;
  readonly inputCron: Locator;
  readonly cronPreview: Locator;
  readonly scanIntensity: Locator;
  readonly radioQuick: Locator;
  readonly radioNormal: Locator;
  readonly radioThorough: Locator;
  readonly inputRetentionDays: Locator;
  readonly btnSaveGeneral: Locator;
  readonly scanCadenceError: Locator;
  readonly retentionDaysError: Locator;
  readonly scanCadenceRestartIndicator: Locator;
  readonly scanIntensityRestartIndicator: Locator;
  readonly restartRequiredBanner: Locator;
  readonly alertBanner: Locator;
  readonly alertBannerMessage: Locator;
  readonly settingsLoading: Locator;
  readonly settingsRetry: Locator;

  // Network settings
  readonly detectedSubnetList: Locator;
  readonly configuredSubnetList: Locator;
  readonly subnetList: Locator;
  readonly inputManualSubnet: Locator;
  readonly btnAddSubnet: Locator;
  readonly btnSaveNetwork: Locator;
  readonly manualSubnetError: Locator;

  // Alerts settings
  readonly inputWebhookUrl: Locator;
  readonly webhookTestResult: Locator;
  readonly btnTestWebhook: Locator;
  readonly inputSmtpServer: Locator;
  readonly inputSmtpPort: Locator;
  readonly inputSmtpUser: Locator;
  readonly inputSmtpPassword: Locator;
  readonly inputSmtpRecipient: Locator;
  readonly emailTestResult: Locator;
  readonly btnTestEmail: Locator;
  readonly inputAlertCooldown: Locator;
  readonly btnSaveAlerts: Locator;

  // API settings
  readonly apiKeyDisplay: Locator;
  readonly apiKeyValue: Locator;
  readonly btnShowKey: Locator;
  readonly btnCopyKey: Locator;
  readonly btnRegenerateKey: Locator;
  readonly btnRegenerateConfirm: Locator;
  readonly btnRegenerateCancel: Locator;
  readonly apiKeyRegenerationWarning: Locator;
  readonly apiRateLimitInfo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('page-settings');
    this.settingsForm = page.getByTestId('settings-form');

    this.tabGeneral = page.getByTestId('tab-general');
    this.tabNetwork = page.getByTestId('tab-network');
    this.tabAlerts = page.getByTestId('tab-alerts');
    this.tabApi = page.getByTestId('tab-api');

    this.panelGeneral = page.getByTestId('panel-general');
    this.panelNetwork = page.getByTestId('panel-network');
    this.panelAlerts = page.getByTestId('panel-alerts');
    this.panelApi = page.getByTestId('panel-api');

    this.selectSchedulePreset = page.getByTestId('select-schedule-preset');
    this.selectScheduleHour = page.getByTestId('select-schedule-hour');
    this.hourPickerGroup = page.getByTestId('hour-picker-group');
    this.customCronGroup = page.getByTestId('custom-cron-group');
    this.inputCron = page.getByTestId('input-cron');
    this.cronPreview = page.getByTestId('cron-preview');
    this.scanIntensity = page.getByTestId('scan-intensity');
    this.radioQuick = page.getByTestId('radio-quick');
    this.radioNormal = page.getByTestId('radio-normal');
    this.radioThorough = page.getByTestId('radio-thorough');
    this.inputRetentionDays = page.getByTestId('input-retention-days');
    this.btnSaveGeneral = page.getByTestId('btn-save-general');
    this.scanCadenceError = page.getByTestId('field-scan-cadence-error');
    this.retentionDaysError = page.getByTestId('field-retention-days-error');
    this.scanCadenceRestartIndicator = page.getByTestId('field-scan-cadence-restart');
    this.scanIntensityRestartIndicator = page.getByTestId('field-scan-intensity-restart');
    this.restartRequiredBanner = page.getByTestId('restart-required-banner');
    this.alertBanner = page.getByTestId('alert-banner');
    this.alertBannerMessage = page.getByTestId('alert-banner-message');
    this.settingsLoading = page.getByTestId('settings-loading');
    this.settingsRetry = page.getByTestId('settings-retry');

    this.detectedSubnetList = page.getByTestId('subnet-detected-list');
    this.configuredSubnetList = page.getByTestId('subnet-configured-list');
    this.subnetList = page.getByTestId('subnet-list');
    this.inputManualSubnet = page.getByTestId('input-manual-subnet');
    this.btnAddSubnet = page.getByTestId('btn-add-subnet');
    this.btnSaveNetwork = page.getByTestId('btn-save-network');
    this.manualSubnetError = page.getByTestId('field-manual-subnet-error');

    this.inputWebhookUrl = page.getByTestId('input-webhook-url');
    this.webhookTestResult = page.getByTestId('webhook-test-result');
    this.btnTestWebhook = page.getByTestId('btn-test-webhook');
    this.inputSmtpServer = page.getByTestId('input-smtp-server');
    this.inputSmtpPort = page.getByTestId('input-smtp-port');
    this.inputSmtpUser = page.getByTestId('input-smtp-user');
    this.inputSmtpPassword = page.getByTestId('input-smtp-password');
    this.inputSmtpRecipient = page.getByTestId('input-smtp-recipient');
    this.emailTestResult = page.getByTestId('email-test-result');
    this.btnTestEmail = page.getByTestId('btn-test-email');
    this.inputAlertCooldown = page.getByTestId('input-alert-cooldown');
    this.btnSaveAlerts = page.getByTestId('btn-save-alerts');

    this.apiKeyDisplay = page.getByTestId('api-key-display');
    this.apiKeyValue = page.getByTestId('api-key-value');
    this.btnShowKey = page.getByTestId('btn-show-key');
    this.btnCopyKey = page.getByTestId('btn-copy-key');
    this.btnRegenerateKey = page.getByTestId('btn-regenerate-key');
    this.btnRegenerateConfirm = page.getByTestId('btn-regenerate-confirm');
    this.btnRegenerateCancel = page.getByTestId('btn-regenerate-cancel');
    this.apiKeyRegenerationWarning = page.getByText(/invalidate the current key immediately/i);
    this.apiRateLimitInfo = page.getByTestId('api-rate-limit-info');
  }

  async goto() {
    await this.page.goto('/settings');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async changeScanCadence(value: string) {
    // Switch to Custom mode first if not already showing cron input
    if (!(await this.customCronGroup.isVisible().catch(() => false))) {
      await this.selectSchedulePreset.selectOption({ label: 'Custom (cron)…' });
    }
    await this.inputCron.fill(value);
  }

  async selectPreset(label: string) {
    await this.selectSchedulePreset.selectOption({ label });
  }

  async selectHour(hour: string) {
    await this.selectScheduleHour.selectOption({ label: hour });
  }

  async selectScanIntensity(intensity: 'quick' | 'normal' | 'thorough') {
    const target = {
      quick: this.radioQuick,
      normal: this.radioNormal,
      thorough: this.radioThorough,
    }[intensity];

    await target.check();
  }

  async changeRetentionDays(value: string) {
    await this.inputRetentionDays.fill(value);
  }

  async saveGeneral() {
    await this.btnSaveGeneral.click();
  }

  async openNetworkTab() {
    await this.tabNetwork.click();
  }

  async openAlertsTab() {
    await this.tabAlerts.click();
  }

  async openApiTab() {
    await this.tabApi.click();
  }

  detectedSubnet(cidr: string) {
    return this.page.getByTestId(`detected-subnet-${toTestIdFragment(cidr)}`);
  }

  detectedSubnetBadge(cidr: string) {
    return this.page.getByTestId(`detected-subnet-badge-${toTestIdFragment(cidr)}`);
  }

  configuredSubnet(cidr: string) {
    return this.page.getByTestId(`configured-subnet-${toTestIdFragment(cidr)}`);
  }

  configuredSubnetRemove(cidr: string) {
    return this.page.getByTestId(`configured-subnet-remove-${toTestIdFragment(cidr)}`);
  }

  async addManualSubnet(value: string) {
    await this.inputManualSubnet.fill(value);
    await this.btnAddSubnet.click();
  }

  async saveNetwork() {
    await this.btnSaveNetwork.click();
  }

  async changeWebhookUrl(value: string) {
    await this.inputWebhookUrl.fill(value);
  }

  async testWebhook() {
    await this.btnTestWebhook.click();
  }

  async fillSmtp(config: {
    host: string;
    port: string;
    user: string;
    password: string;
    recipient: string;
  }) {
    await this.inputSmtpServer.fill(config.host);
    await this.inputSmtpPort.fill(config.port);
    await this.inputSmtpUser.fill(config.user);
    await this.inputSmtpPassword.fill(config.password);
    await this.inputSmtpRecipient.fill(config.recipient);
  }

  async changeAlertCooldown(value: string) {
    await this.inputAlertCooldown.fill(value);
  }

  async testEmail() {
    await this.btnTestEmail.click();
  }

  async saveAlerts() {
    await this.btnSaveAlerts.click();
  }

  async toggleApiKeyVisibility() {
    await this.btnShowKey.click();
  }

  async copyApiKey() {
    await this.btnCopyKey.click();
  }

  async startApiKeyRegeneration() {
    await this.btnRegenerateKey.click();
  }

  async confirmApiKeyRegeneration() {
    await this.btnRegenerateConfirm.click();
  }

  async cancelApiKeyRegeneration() {
    await this.btnRegenerateCancel.click();
  }
}
