import type { Page, Locator } from '@playwright/test';

export class DeviceDetailPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Breadcrumb
  readonly breadcrumb: Locator;
  readonly breadcrumbDevices: Locator;
  readonly breadcrumbCurrent: Locator;

  // Identity card
  readonly identityCard: Locator;
  readonly identityName: Locator;
  readonly identityMac: Locator;
  readonly identityVendor: Locator;
  readonly identityHostname: Locator;
  readonly identityKnownFlag: Locator;
  readonly identityStatus: Locator;

  // Tab bar
  readonly tabBar: Locator;
  readonly tabOverview: Locator;
  readonly tabActivity: Locator;
  readonly tabHistory: Locator;
  readonly tabPorts: Locator;
  readonly tabPresence: Locator;
  readonly tabTags: Locator;

  // Panels
  readonly panelOverview: Locator;
  readonly panelActivity: Locator;
  readonly panelIpHistory: Locator;
  readonly panelPorts: Locator;
  readonly panelPresence: Locator;
  readonly panelTags: Locator;

  // Activity
  readonly activityPresenceSummary: Locator;
  readonly activityEventFeed: Locator;
  readonly activityEmptyState: Locator;

  // IP History
  readonly ipHistoryTable: Locator;
  readonly ipHistoryTableHeader: Locator;

  // Port table
  readonly portTable: Locator;
  readonly portTableHeader: Locator;

  // Presence
  readonly presenceTimeline: Locator;
  readonly presenceTimelineChart: Locator;
  readonly presenceTimelineLegend: Locator;

  // Tags
  readonly deviceTags: Locator;
  readonly tagInput: Locator;
  readonly tagInputField: Locator;
  readonly btnAddTag: Locator;

  // Notes
  readonly deviceNotes: Locator;
  readonly btnSaveNotes: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('page-device-detail');

    this.breadcrumb = page.getByTestId('breadcrumb');
    this.breadcrumbDevices = page.getByTestId('breadcrumb-devices');
    this.breadcrumbCurrent = page.getByTestId('breadcrumb-current');

    this.identityCard = page.getByTestId('device-identity-card');
    this.identityName = page.getByTestId('device-identity-card-name');
    this.identityMac = page.getByTestId('device-identity-card-mac');
    this.identityVendor = page.getByTestId('device-identity-card-vendor');
    this.identityHostname = page.getByTestId('device-identity-card-hostname');
    this.identityKnownFlag = page.getByTestId('device-identity-card-known-flag');
    this.identityStatus = page.getByTestId('device-identity-card-status');

    this.tabBar = page.getByTestId('tab-bar');
    this.tabOverview = page.getByTestId('tab-bar-tab-overview');
    this.tabActivity = page.getByTestId('tab-bar-tab-activity');
    this.tabHistory = page.getByTestId('tab-bar-tab-history');
    this.tabPorts = page.getByTestId('tab-bar-tab-ports');
    this.tabPresence = page.getByTestId('tab-bar-tab-presence');
    this.tabTags = page.getByTestId('tab-bar-tab-tags');

    this.panelOverview = page.getByTestId('panel-overview');
    this.panelActivity = page.getByTestId('panel-activity');
    this.panelIpHistory = page.getByTestId('panel-ip-history');
    this.panelPorts = page.getByTestId('panel-ports');
    this.panelPresence = page.getByTestId('panel-presence');
    this.panelTags = page.getByTestId('panel-tags');

    this.activityPresenceSummary = page.getByTestId('activity-presence-summary');
    this.activityEventFeed = page.getByTestId('activity-event-feed');
    this.activityEmptyState = page.getByTestId('activity-empty-state');

    this.ipHistoryTable = page.getByTestId('ip-history-table');
    this.ipHistoryTableHeader = page.getByTestId('ip-history-table-header');

    this.portTable = page.getByTestId('port-table');
    this.portTableHeader = page.getByTestId('port-table-header');

    this.presenceTimeline = page.getByTestId('presence-timeline');
    this.presenceTimelineChart = page.getByTestId('presence-timeline-chart');
    this.presenceTimelineLegend = page.getByTestId('presence-timeline-legend');

    this.deviceTags = page.getByTestId('device-tags');
    this.tagInput = page.getByTestId('tag-input');
    this.tagInputField = page.getByTestId('tag-input-field');
    this.btnAddTag = page.getByTestId('btn-add-tag');

    this.deviceNotes = page.getByTestId('device-notes');
    this.btnSaveNotes = page.getByTestId('btn-save-notes');
  }

  async goto(deviceId: string) {
    await this.page.goto(`/devices/${deviceId}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async portHeaderLabels(): Promise<string[]> {
    return this.portTableHeader.getByRole('columnheader').allTextContents();
  }

  portServiceCell(index: number): Locator {
    return this.page.getByTestId(`port-table-service-${index}`);
  }

  get portVersionHeader(): Locator {
    return this.portTableHeader.getByRole('columnheader', { name: 'Version' });
  }
}
