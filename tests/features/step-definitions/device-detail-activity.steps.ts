import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { DeviceDetailPage } from '../../../e2e/pages/DeviceDetailPage.ts';
import type { CustomWorld } from '../support/world.ts';

type ActivityFixture = {
  deviceId: string;
  historyRows?: number;
  activityEvents?: Array<{ label: string; timestamp: string }>;
  identityFacts?: string[];
};

type DeviceDetailActivityWorld = CustomWorld & {
  deviceDetail?: DeviceDetailPage;
  currentDeviceId?: string;
  activityFixture?: ActivityFixture;
};

async function seedActivityFixture(
  world: DeviceDetailActivityWorld,
  fixture: ActivityFixture & Record<string, unknown>,
): Promise<void> {
  world.currentDeviceId = fixture.deviceId;
  world.activityFixture = fixture;
  world.latestResponse = await world.request.post('/api/v1/test-support/device-detail-activity', {
    data: fixture,
  });
  expect(world.latestResponse.status()).toBe(201);
}

async function ensureDeviceDetail(world: DeviceDetailActivityWorld): Promise<DeviceDetailPage> {
  if (!world.deviceDetail) {
    world.deviceDetail = new DeviceDetailPage(world.page);
  }

  const deviceId = world.currentDeviceId ?? 'device-001';
  if (!(await world.deviceDetail.pageContainer.isVisible().catch(() => false))) {
    await world.deviceDetail.goto(deviceId);
    await expect(world.deviceDetail.pageContainer).toBeVisible();
  }

  return world.deviceDetail;
}

function latestJson(world: CustomWorld): Record<string, unknown> {
  return (world.latestResponseJson as Record<string, unknown> | undefined) ?? {};
}

Given('a device detail record exists for {string}', async function (this: DeviceDetailActivityWorld, deviceId: string) {
  await seedActivityFixture(this, {
    deviceId,
    historyRows: 3,
    activityEvents: [
      { label: 'IP changed to 192.168.1.42', timestamp: '2026-04-18T09:45:00Z' },
      { label: 'Device came online', timestamp: '2026-04-18T08:30:00Z' },
      { label: 'Device went offline', timestamp: '2026-04-17T23:10:00Z' },
    ],
    identityFacts: ['AA:BB:CC:DD:EE:01', 'Fixture Labs'],
  });
});

When('the operator views the device detail page for {string}', async function (this: DeviceDetailActivityWorld, deviceId: string) {
  this.currentDeviceId = deviceId;
  this.deviceDetail = new DeviceDetailPage(this.page);
  await this.deviceDetail.goto(deviceId);
  await expect(this.deviceDetail.pageContainer).toBeVisible();
});

Then('{string} is visible', async function (this: DeviceDetailActivityWorld, testId: string) {
  await expect(this.page.getByTestId(testId)).toBeVisible();
});

Then('{string} is not visible', async function (this: DeviceDetailActivityWorld, testId: string) {
  await expect(this.page.getByTestId(testId)).toHaveCount(0);
});

Given(
  'device {string} has current presence context, {int} historical IP addresses, and {int} activity transitions',
  async function (this: DeviceDetailActivityWorld, deviceId: string, historyRows: number, transitionCount: number) {
    await seedActivityFixture(this, {
      deviceId,
      historyRows,
      activityEvents: [
        { label: 'IP changed to 192.168.1.42', timestamp: '2026-04-18T09:45:00Z' },
        { label: 'Device came online', timestamp: '2026-04-18T08:30:00Z' },
        { label: 'Device went offline', timestamp: '2026-04-17T23:10:00Z' },
        { label: 'IP changed to 192.168.1.25', timestamp: '2026-04-17T18:00:00Z' },
      ].slice(0, transitionCount),
      identityFacts: ['AA:BB:CC:DD:EE:01', 'Fixture Labs'],
    });
  },
);

When('the operator opens {string} on the device detail page', async function (this: DeviceDetailActivityWorld, testId: string) {
  const detail = await ensureDeviceDetail(this);
  await this.page.getByTestId(testId).click();
  if (testId === 'tab-bar-tab-activity') {
    await expect(detail.panelActivity).toBeVisible();
  }
});

Then(
  '{string} shows {int} rows with first-seen and last-seen dates',
  async function (this: DeviceDetailActivityWorld, testId: string, rowCount: number) {
    const table = this.page.getByTestId(testId);
    await expect(table).toBeVisible();
    const rows = table.getByRole('row');
    await expect(rows).toHaveCount(rowCount + 1);
    await expect(table).toContainText('First Seen');
    await expect(table).toContainText('Last Seen');
  },
);

Then(
  '{string} shows {int} row',
  async function (this: DeviceDetailActivityWorld, testId: string, rowCount: number) {
    const table = this.page.getByTestId(testId);
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(rowCount + 1);
  },
);

Then(
  '{string} shows the online, offline, and IP-change events in reverse chronological order',
  async function (this: DeviceDetailActivityWorld, testId: string) {
    const feed = this.page.getByTestId(testId);
    await expect(feed).toBeVisible();
    const items = feed.getByRole('listitem');
    const expectedEvents = this.activityFixture?.activityEvents ?? [];
    await expect(items.first()).toContainText(expectedEvents[0]?.label ?? 'IP changed');
    await expect(items.nth(1)).toContainText(expectedEvents[1]?.label ?? 'Device came online');
    await expect(items.nth(2)).toContainText(expectedEvents[2]?.label ?? 'Device went offline');
  },
);

Then(
  'the Activity tab does not repeat overview-only identity facts outside {string}',
  async function (this: DeviceDetailActivityWorld, identityCardTestId: string) {
    const detail = await ensureDeviceDetail(this);
    await expect(this.page.getByTestId(identityCardTestId)).toBeVisible();
    const activityPanelText = await detail.panelActivity.textContent();
    for (const fact of this.activityFixture?.identityFacts ?? []) {
      expect(activityPanelText ?? '').not.toContain(fact);
    }
  },
);

Given(
  'device {string} has one current IP address and no recorded transitions',
  async function (this: DeviceDetailActivityWorld, deviceId: string) {
    await seedActivityFixture(this, {
      deviceId,
      historyRows: 1,
      activityEvents: [],
      identityFacts: ['AA:BB:CC:DD:EE:02', 'Fixture Labs'],
    });
  },
);

Then('{string} shows first-seen and last-seen context', async function (this: DeviceDetailActivityWorld, testId: string) {
  const locator = this.page.getByTestId(testId);
  await expect(locator).toContainText('First seen');
  await expect(locator).toContainText('Last seen');
});

Then('{string} explains that no additional activity has been recorded yet', async function (this: DeviceDetailActivityWorld, testId: string) {
  await expect(this.page.getByTestId(testId)).toContainText('No additional activity');
});

Given('device {string} has more than 20 activity records', async function (this: DeviceDetailActivityWorld, deviceId: string) {
  await seedActivityFixture(this, {
    deviceId,
    historyRows: 24,
    activityEvents: Array.from({ length: 24 }, (_, index) => ({
      label: `IP changed to 192.168.1.${200 - index}`,
      timestamp: `2026-04-${String(18 - Math.floor(index / 2)).padStart(2, '0')}T0${index % 10}:00:00Z`,
    })),
    identityFacts: ['AA:BB:CC:DD:EE:03', 'Fixture Labs'],
  });
});

Then('the Activity tab shows a bounded initial set of the most recent activity records', async function (this: DeviceDetailActivityWorld) {
  const detail = await ensureDeviceDetail(this);
  const items = detail.activityEventFeed.getByRole('listitem');
  expect(await items.count()).toBeLessThanOrEqual(20);
});

Then('the operator can reveal more activity without leaving the tab', async function (this: DeviceDetailActivityWorld) {
  const detail = await ensureDeviceDetail(this);
  await this.page.getByRole('button', { name: /load more/i }).click();
  await expect(detail.panelActivity).toBeVisible();
});

Given(
  'device {string} has IP history rows but no recorded presence transitions',
  async function (this: DeviceDetailActivityWorld, deviceId: string) {
    await seedActivityFixture(this, {
      deviceId,
      historyRows: 2,
      activityEvents: [{ label: 'IP changed to 192.168.1.88', timestamp: '2026-04-16T08:00:00Z' }],
      identityFacts: ['AA:BB:CC:DD:EE:04', 'Fixture Labs'],
      legacyMode: 'ip-only',
    });
  },
);

Then('{string} shows the available IP history rows', async function (this: DeviceDetailActivityWorld, testId: string) {
  const table = this.page.getByTestId(testId);
  await expect(table).toBeVisible();
  expect(await table.getByRole('row').count()).toBeGreaterThan(1);
});

Then('{string} shows only the events that exist', async function (this: DeviceDetailActivityWorld, testId: string) {
  const feedItems = this.page.getByTestId(testId).getByRole('listitem');
  await expect(feedItems).toHaveCount((this.activityFixture?.activityEvents ?? []).length);
});

Then('the Activity tab remains usable instead of appearing blank or broken', async function (this: DeviceDetailActivityWorld) {
  const detail = await ensureDeviceDetail(this);
  await expect(detail.panelActivity).toBeVisible();
  await expect(detail.activityEmptyState).toHaveCount(0);
});

Given('a device with activity history exists for {string}', async function (this: DeviceDetailActivityWorld, deviceId: string) {
  await seedActivityFixture(this, {
    deviceId,
    historyRows: 3,
    activityEvents: [
      { label: 'IP changed to 192.168.1.42', timestamp: '2026-04-18T09:45:00Z' },
      { label: 'Device came online', timestamp: '2026-04-18T08:30:00Z' },
    ],
  });
});

When('an authenticated client requests the activity history for {string}', async function (this: DeviceDetailActivityWorld, deviceId: string) {
  this.latestResponse = await this.request.get(`/api/v1/devices/${deviceId}/history`);
  this.latestResponseJson = await this.latestResponse.json();
});

Then('the activity history response status should be 200', async function (this: DeviceDetailActivityWorld) {
  expect(this.latestResponse?.status()).toBe(200);
});

Then('the response status should be {int}', async function (this: DeviceDetailActivityWorld, statusCode: number) {
  expect(this.latestResponse?.status()).toBe(statusCode);
});

Then('the response includes a current presence summary section', async function (this: DeviceDetailActivityWorld) {
  expect(latestJson(this)).toHaveProperty('presenceSummary');
});

Then('the response includes an IP history section', async function (this: DeviceDetailActivityWorld) {
  expect(latestJson(this)).toHaveProperty('ipHistory');
});

Then('the response includes an activity events section', async function (this: DeviceDetailActivityWorld) {
  expect(latestJson(this)).toHaveProperty('activityEvents');
});

Then('the response does not expose a raw unstructured history array', async function (this: DeviceDetailActivityWorld) {
  expect(latestJson(this)).not.toHaveProperty('data');
});

Given('activity aggregation fails for device {string}', async function (this: DeviceDetailActivityWorld, deviceId: string) {
  this.currentDeviceId = deviceId;
  this.latestResponse = await this.request.post('/api/v1/test-support/device-detail-activity-errors', {
    data: { deviceId, failHistory: true },
  });
  expect(this.latestResponse.status()).toBe(201);
});

Then('the operator sees a scoped activity error message', async function (this: DeviceDetailActivityWorld) {
  await expect(this.page.getByText(/failed to load activity|unable to load activity/i)).toBeVisible();
});

Then('{string} remains available', async function (this: DeviceDetailActivityWorld, testId: string) {
  await expect(this.page.getByTestId(testId)).toBeVisible();
});

Given(
  'device {string} has legacy history with missing structured sections',
  async function (this: DeviceDetailActivityWorld, deviceId: string) {
    await seedActivityFixture(this, {
      deviceId,
      historyRows: 0,
      activityEvents: [],
      legacyMode: 'missing-sections',
    });
  },
);

Then('the missing IP history or activity-event sections are returned as empty arrays', async function (this: DeviceDetailActivityWorld) {
  const json = latestJson(this);
  expect(json).toMatchObject({
    ipHistory: [],
    activityEvents: [],
  });
});

Then('the response remains compatible with the Activity tab', async function (this: DeviceDetailActivityWorld) {
  const json = latestJson(this);
  expect(json).toHaveProperty('presenceSummary');
});
