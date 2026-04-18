import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { DeviceDetailPage } from '../../../e2e/pages/DeviceDetailPage.ts';
import type { CustomWorld } from '../support/world.ts';

type PortsFixture = {
  deviceId: string;
  portFixture: 'mixed-version-ports' | 'no-version-ports';
};

type DeviceDetailPortsWorld = CustomWorld & {
  currentDeviceId?: string;
  deviceDetail?: DeviceDetailPage;
  portsFixture?: PortsFixture;
};

function latestJson(world: CustomWorld): Record<string, unknown> {
  return (world.latestResponseJson as Record<string, unknown> | undefined) ?? {};
}

async function seedPortsFixture(world: DeviceDetailPortsWorld, fixture: PortsFixture): Promise<void> {
  world.currentDeviceId = fixture.deviceId;
  world.portsFixture = fixture;
  world.latestResponse = await world.request.post('/api/v1/test-support/device-detail-activity', {
    data: {
      deviceId: fixture.deviceId,
      historyRows: 1,
      activityEvents: [],
      portFixture: fixture.portFixture,
    },
  });
  expect(world.latestResponse.status()).toBe(201);
}

async function ensurePortsPanel(world: DeviceDetailPortsWorld): Promise<DeviceDetailPage> {
  if (!world.deviceDetail) {
    world.deviceDetail = new DeviceDetailPage(world.page);
  }

  const deviceId = world.currentDeviceId ?? 'device-001';
  if (!(await world.deviceDetail.pageContainer.isVisible().catch(() => false))) {
    await world.deviceDetail.goto(deviceId);
    await expect(world.deviceDetail.pageContainer).toBeVisible();
  }

  if (!(await world.deviceDetail.panelPorts.isVisible().catch(() => false))) {
    await world.deviceDetail.tabPorts.click();
    await expect(world.deviceDetail.panelPorts).toBeVisible();
  }

  return world.deviceDetail;
}

Given('device {string} has ports with real service version values', async function (this: DeviceDetailPortsWorld, deviceId: string) {
  await seedPortsFixture(this, { deviceId, portFixture: 'mixed-version-ports' });
});

Given('device {string} has ports without service version values', async function (this: DeviceDetailPortsWorld, deviceId: string) {
  await seedPortsFixture(this, { deviceId, portFixture: 'no-version-ports' });
});

Given('a device with open port data exists for {string}', async function (this: DeviceDetailPortsWorld, deviceId: string) {
  await seedPortsFixture(this, { deviceId, portFixture: 'mixed-version-ports' });
});

Then(
  'the Ports & Services table shows {string}, {string}, and {string} as its primary columns',
  async function (this: DeviceDetailPortsWorld, first: string, second: string, third: string) {
    const detail = await ensurePortsPanel(this);
    await expect.poll(() => detail.portHeaderLabels()).toEqual([first, second, third]);
  },
);

Then('the Ports & Services table does not show a standalone {string} column', async function (this: DeviceDetailPortsWorld, columnName: string) {
  const detail = await ensurePortsPanel(this);
  await expect(detail.portVersionHeader).toHaveCount(0);
  await expect(detail.portTable).not.toContainText(columnName);
});

Then(
  'the matching service rows show their version detail inline with the service name',
  async function (this: DeviceDetailPortsWorld) {
    const detail = await ensurePortsPanel(this);
    await expect(detail.portServiceCell(0)).toContainText('ssh');
    await expect(detail.portServiceCell(0)).toContainText('OpenSSH 9.7');
  },
);

Then(
  'the operator can still scan the table by port and protocol without an extra sparse column',
  async function (this: DeviceDetailPortsWorld) {
    const detail = await ensurePortsPanel(this);
    await expect(this.page.getByTestId('port-table-port-0')).toBeVisible();
    await expect(this.page.getByTestId('port-table-protocol-0')).toBeVisible();
    await expect(detail.portVersionHeader).toHaveCount(0);
  },
);

Then('the service rows show the service names without empty version placeholders', async function (this: DeviceDetailPortsWorld) {
  const detail = await ensurePortsPanel(this);
  await expect(detail.portServiceCell(0)).toContainText(/dns|snmp/);
  await expect(detail.portServiceCell(0)).not.toContainText('—');
});

Then(
  'the Ports & Services table remains aligned without a blank version-only column',
  async function (this: DeviceDetailPortsWorld) {
    const detail = await ensurePortsPanel(this);
    await expect(detail.portVersionHeader).toHaveCount(0);
    await expect(detail.portTable).not.toContainText('Version');
  },
);

When('an authenticated client requests the ports snapshot for {string}', async function (this: DeviceDetailPortsWorld, deviceId: string) {
  this.latestResponse = await this.request.get(`/api/v1/devices/${deviceId}/ports`);
  this.latestResponseJson = await this.latestResponse.json();
});

Then(
  'the response includes service-version fields for ports that have detected version data',
  async function (this: DeviceDetailPortsWorld) {
    const data = latestJson(this).data;
    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        service: expect.any(String),
        version: expect.any(String),
      }),
    ]));
  },
);

Then('the response remains compatible with exports or future advanced port views', async function (this: DeviceDetailPortsWorld) {
  expect(latestJson(this)).toMatchObject({
    data: expect.arrayContaining([
      expect.objectContaining({
        port: expect.any(Number),
        protocol: expect.any(String),
        service: expect.any(String),
      }),
    ]),
    meta: expect.objectContaining({
      timestamp: expect.any(String),
    }),
  });
});
