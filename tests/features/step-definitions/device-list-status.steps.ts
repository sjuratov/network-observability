import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { DashboardPage } from '../../../e2e/pages/DashboardPage.ts';
import { DeviceListPage } from '../../../e2e/pages/DeviceListPage.ts';
import type { CustomWorld } from '../support/world.ts';

type DeviceListStatusWorld = CustomWorld & {
  previousVisibleRowCount?: number;
  firstVisibleDeviceName?: string;
};

function latestDevices(world: CustomWorld): Array<Record<string, unknown>> {
  const payload = world.latestResponseJson as { data?: Array<Record<string, unknown>> } | undefined;
  return payload?.data ?? [];
}

async function ensureDeviceList(world: CustomWorld): Promise<DeviceListPage> {
  if (!world.deviceList) {
    world.deviceList = new DeviceListPage(world.page);
  }

  if (!(await world.deviceList.pageContainer.isVisible().catch(() => false))) {
    await world.deviceList.goto();
    await expect(world.deviceList.pageContainer).toBeVisible();
  }

  return world.deviceList;
}

Given(
  'presence reconciliation has marked {int} devices as offline after the configured missed-scan threshold',
  async function (this: CustomWorld, offlineCount: number) {
    this.offlineCount = offlineCount;
    this.latestResponse = await this.request.post('/api/v1/test-support/presence-snapshots', {
      data: { offlineDevices: offlineCount, threshold: 2 },
    });
    expect(this.latestResponse.status()).toBe(201);
  },
);

When('the operator views the dashboard', async function (this: CustomWorld) {
  this.dashboard = new DashboardPage(this.page);
  await this.dashboard.goto();
});

Then('{string} displays {string}', async function (this: CustomWorld, testId: string, value: string) {
  await expect(this.page.getByTestId(testId)).toHaveText(value);
});

When(
  'the operator navigates to the device list and activates {string}',
  async function (this: CustomWorld, filterTestId: string) {
    if (!this.dashboard) {
      this.dashboard = new DashboardPage(this.page);
      await this.dashboard.goto();
    }

    await this.dashboard.navLinkDevices.click();
    this.deviceList = new DeviceListPage(this.page);
    await expect(this.deviceList.pageContainer).toBeVisible();
    await this.page.getByTestId(filterTestId).click();
  },
);

Then('each visible device row shows {string}', async function (this: CustomWorld, testId: string) {
  if (!this.deviceList) {
    this.deviceList = new DeviceListPage(this.page);
  }
  const rows = await this.deviceList.visibleRowCount();
  for (let index = 0; index < rows; index += 1) {
    await expect(this.deviceList.rowAt(index).getByTestId(testId)).toBeVisible();
  }
});

Given('a device has been marked offline by presence reconciliation', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/presence-snapshots', {
    data: { offlineDevices: 1, threshold: 2, status: 'offline' },
  });
  expect(this.latestResponse.status()).toBe(201);
});

When('an authenticated client requests the offline device inventory', async function (this: CustomWorld) {
  this.latestResponse = await this.request.get('/api/v1/devices?status=offline');
  this.latestResponseJson = await this.latestResponse.json();
  expect(this.latestResponse.status()).toBe(200);
});

Then('every returned device reports status {string}', async function (this: CustomWorld, status: string) {
  const devices = latestDevices(this);
  expect(devices.length).toBeGreaterThan(0);
  for (const device of devices) {
    expect(device.status).toBe(status);
  }
});

Then('every returned device reports {string} as false', async function (this: CustomWorld, fieldName: string) {
  const devices = latestDevices(this);
  expect(devices.length).toBeGreaterThan(0);
  for (const device of devices) {
    expect(device[fieldName]).toBe(false);
  }
});

Given('a newly discovered device is still classified as new', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/devices', {
    data: { lifecycleState: 'new', displayName: 'Staging Sensor' },
  });
  expect(this.latestResponse.status()).toBe(201);
});

Given('the same device has exceeded the offline detection threshold', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/presence-events', {
    data: { lifecycleState: 'new', resultingStatus: 'offline', threshold: 2 },
  });
  expect(this.latestResponse.status()).toBe(201);
});

When('the operator views the device row in {string}', async function (this: CustomWorld, _tableTestId: string) {
  this.deviceList = new DeviceListPage(this.page);
  await this.deviceList.goto();
  this.currentRowIndex = 0;
  await expect(this.deviceList.rowAt(this.currentRowIndex)).toBeVisible();
});

Then('the row shows {string}', async function (this: CustomWorld, testId: string) {
  if (!this.deviceList) {
    this.deviceList = new DeviceListPage(this.page);
  }
  await expect(this.deviceList.rowAt(this.currentRowIndex).getByTestId(testId)).toBeVisible();
});

Then('the row does not show {string}', async function (this: CustomWorld, testId: string) {
  if (!this.deviceList) {
    this.deviceList = new DeviceListPage(this.page);
  }
  await expect(this.deviceList.rowAt(this.currentRowIndex).getByTestId(testId)).toHaveCount(0);
});

Given('a device has only been seen in one completed scan', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/presence-snapshots', {
    data: { scansSeen: 1, resultingStatus: 'unknown' },
  });
  expect(this.latestResponse.status()).toBe(201);
});

Given('a newly discovered device has recent presence evidence that keeps it online', async function (this: CustomWorld) {
  const created = await this.request.post('/api/v1/test-support/devices', {
    data: { lifecycleState: 'new', displayName: 'Staging Sensor' },
  });
  expect(created.status()).toBe(201);

  this.latestResponse = await this.request.post('/api/v1/test-support/presence-events', {
    data: { lifecycleState: 'new', resultingStatus: 'online', threshold: 2 },
  });
  expect(this.latestResponse.status()).toBe(201);
});

Then('the device is not counted in {string}', async function (this: CustomWorld, testId: string) {
  this.dashboard = new DashboardPage(this.page);
  await this.dashboard.goto();
  const text = await this.page.getByTestId(testId).textContent();
  const value = Number.parseInt((text ?? '').replace(/[^\d-]/g, ''), 10);
  expect(Number.isNaN(value) ? 0 : value).toBe(0);
});

Then('the row shows the lifecycle label {string}', async function (this: CustomWorld, value: string) {
  if (!this.deviceList) {
    this.deviceList = new DeviceListPage(this.page);
  }
  await expect(this.deviceList.rowAt(this.currentRowIndex)).toContainText(value);
});

Then('the row does not show the lifecycle label {string}', async function (this: CustomWorld, value: string) {
  if (!this.deviceList) {
    this.deviceList = new DeviceListPage(this.page);
  }
  await expect(this.deviceList.rowAt(this.currentRowIndex)).not.toContainText(value);
});

Given('a device was offline after the most recent completed scan', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/presence-snapshots', {
    data: { offlineDevices: 1, latestCompletedScanStatus: 'offline' },
  });
  expect(this.latestResponse.status()).toBe(201);
});

Given('a new scan is currently in progress', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/scans/current', {
    data: { status: 'in-progress', preservesCompletedPresence: true },
  });
  expect(this.latestResponse.status()).toBe(202);
});

When('the operator views the dashboard and the device list during that scan', async function (this: CustomWorld) {
  this.dashboard = new DashboardPage(this.page);
  await this.dashboard.goto();
  this.offlineCount = await this.dashboard.offlineDeviceCount();
  await this.dashboard.navLinkDevices.click();
  this.deviceList = new DeviceListPage(this.page);
  await expect(this.deviceList.pageContainer).toBeVisible();
});

Then('{string} still includes the offline device', async function (this: CustomWorld, testId: string) {
  expect(testId).toBe('metric-card-offline-devices-value');
  expect(this.offlineCount).toBeGreaterThan(0);
});

Then('the matching device row still shows {string}', async function (this: CustomWorld, testId: string) {
  if (!this.deviceList) {
    this.deviceList = new DeviceListPage(this.page);
  }
  await expect(this.deviceList.rowAt(this.currentRowIndex).getByTestId(testId)).toBeVisible();
});

Given(
  'an authenticated client requests the device inventory with an unsupported status filter',
  async function (this: CustomWorld) {
    this.unsupportedStatusFilter = 'archived';
  },
);

When('the device inventory is evaluated', async function (this: CustomWorld) {
  this.latestResponse = await this.request.get(`/api/v1/devices?status=${this.unsupportedStatusFilter}`);
  this.latestResponseJson = await this.latestResponse.json();
});

Then('the response is rejected with a validation error', async function (this: CustomWorld) {
  expect(this.latestResponse?.status()).toBe(400);
  expect(this.latestResponseJson).toMatchObject({
    error: { code: 'VALIDATION_ERROR' },
  });
});

Then('no fallback list is returned for the unsupported filter', async function (this: CustomWorld) {
  expect(this.latestResponseJson).not.toHaveProperty('data');
});

Given('the device inventory includes more than 100 devices for page-size selection', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/device-inventory', {
    data: { fixture: 'page-size-controls' },
  });
  expect(this.latestResponse.status()).toBe(201);
});

When('the operator views the device list page', async function (this: CustomWorld) {
  this.deviceList = new DeviceListPage(this.page);
  await this.deviceList.goto();
  await expect(this.deviceList.pageContainer).toBeVisible();
});

Then(
  '{string} offers {string}, {string}, {string}, {string}, and {string}',
  async function (this: CustomWorld, testId: string, first: string, second: string, third: string, fourth: string, fifth: string) {
    const deviceList = await ensureDeviceList(this);
    expect(testId).toBe('pagination-page-size');
    await expect.poll(() => deviceList.pageSizeOptions()).toEqual([first, second, third, fourth, fifth]);
  },
);

Then('{string} keeps {string} selected', async function (this: CustomWorld, testId: string, value: string) {
  const deviceList = await ensureDeviceList(this);

  if (testId === 'pagination-page-size') {
    await expect.poll(() => deviceList.selectedPageSize()).toBe(value);
    return;
  }

  await expect(this.page.getByTestId(testId)).toHaveValue(value);
});

Then('{string} keeps {string}', async function (this: CustomWorld, testId: string, value: string) {
  await expect(this.page.getByTestId(testId)).toHaveValue(value);
});

When('the operator sets {string} to {string}', async function (this: CustomWorld, testId: string, value: string) {
  const deviceList = await ensureDeviceList(this);
  expect(testId).toBe('pagination-page-size');
  await deviceList.selectPageSize(value as '10' | '25' | '50' | '100' | 'All');
});

Then('{string} shows {int} visible device rows', async function (this: CustomWorld, testId: string, rowCount: number) {
  const deviceList = await ensureDeviceList(this);
  expect(testId).toBe('device-table');
  await expect.poll(() => deviceList.visibleRowCount()).toBe(rowCount);
});

When('the operator searches for {string} in {string}', async function (this: CustomWorld, value: string, testId: string) {
  const deviceList = await ensureDeviceList(this);
  expect(testId).toBe('search-bar-input');
  await deviceList.searchBarInput.fill(value);
});

When('the operator activates {string}', async function (this: CustomWorld, testId: string) {
  await ensureDeviceList(this);
  await this.page.getByTestId(testId).click();
});

When('the operator sorts the device list by {string}', async function (this: CustomWorld, testId: string) {
  await ensureDeviceList(this);
  await this.page.getByTestId(testId).click();
});

Then('{string} remains visible', async function (this: CustomWorld, testId: string) {
  await expect(this.page.getByTestId(testId)).toBeVisible();
});

Then('{string} stays sorted', async function (this: CustomWorld, testId: string) {
  await expect(this.page.getByTestId(testId)).toContainText(/▲|▼/);
});

Then(
  'the first visible device IPs are {string}, {string}, and {string}',
  async function (this: CustomWorld, firstIp: string, secondIp: string, thirdIp: string) {
    const deviceList = await ensureDeviceList(this);
    await expect
      .poll(() => Promise.all([0, 1, 2].map((index) => deviceList.visibleDeviceIpAt(index))))
      .toEqual([firstIp, secondIp, thirdIp]);
  },
);

Given('the device list currently shows {string} rows per page', async function (this: CustomWorld, value: string) {
  const world = this as DeviceListStatusWorld;
  this.latestResponse = await this.request.post('/api/v1/test-support/device-inventory', {
    data: { fixture: 'page-size-controls' },
  });
  expect(this.latestResponse.status()).toBe(201);

  world.deviceList = new DeviceListPage(world.page);
  await world.deviceList.goto();
  await world.deviceList.selectPageSize(value as '10' | '25' | '50' | '100' | 'All');
  world.previousVisibleRowCount = await world.deviceList.visibleRowCount();
});

Given('full-result retrieval for the device list will fail', async function (this: CustomWorld) {
  this.latestResponse = await this.request.post('/api/v1/test-support/device-inventory-errors', {
    data: { fullResultRetrieval: 'fail' },
  });
  expect(this.latestResponse.status()).toBe(201);
});

Then('the visible device rows stay unchanged', async function (this: CustomWorld) {
  const world = this as DeviceListStatusWorld;
  const deviceList = await ensureDeviceList(world);
  await expect.poll(() => deviceList.visibleRowCount()).toBe(world.previousVisibleRowCount ?? 0);
});

Then('the operator sees an inline page-size error message', async function (this: CustomWorld) {
  await expect(this.page.getByTestId('pagination-page-size-error')).toBeVisible();
});

When('the operator opens the first visible device', async function (this: CustomWorld) {
  const world = this as DeviceListStatusWorld;
  const deviceList = await ensureDeviceList(world);
  world.firstVisibleDeviceName = await deviceList.visibleDeviceNameAt(0);
  await deviceList.rowNameAt(0).click();
  await expect(this.page.getByTestId('page-device-detail')).toBeVisible();
});

When('the operator returns to the device list from the device detail page', async function (this: CustomWorld) {
  await this.page.getByTestId('breadcrumb-devices').click();
  this.deviceList = new DeviceListPage(this.page);
  await expect(this.deviceList.pageContainer).toBeVisible();
});

Then('the first visible device name stays the same', async function (this: CustomWorld) {
  const world = this as DeviceListStatusWorld;
  const deviceList = await ensureDeviceList(world);
  await expect.poll(() => deviceList.visibleDeviceNameAt(0)).toBe(world.firstVisibleDeviceName);
});
