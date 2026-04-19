import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import { expect, request as playwrightRequest } from '@playwright/test';
import type { CustomWorld } from '../support/world.ts';
import { SettingsPage } from '../../../e2e/pages/SettingsPage.ts';

type SettingsApiWorld = CustomWorld & {
  pendingPayload?: Record<string, unknown>;
  settingsPage?: SettingsPage;
  configFixture?: SettingsConfigFixture;
  subnetsFixture?: SettingsSubnetsFixture;
  interceptedConfigUpdates?: Array<Record<string, unknown>>;
  interceptedWebhookTests?: Array<{ url: string }>;
  interceptedEmailTests?: Array<{
    host: string;
    port: number;
    user?: string;
    password?: string;
    recipient: string;
  }>;
  configGetCallCount?: number;
  failConfigRequest?: 'network';
  failNextSaveMessage?: string;
  failWebhookTestMessage?: string;
  interceptedApiKeyRevealCount?: number;
  currentAcceptedApiKey?: string;
  previousAcceptedApiKey?: string;
  regeneratedApiKey?: string;
};

type SettingsConfigFixture = {
  data: {
    subnets: string[];
    scanCadence: string;
    scanIntensity: 'quick' | 'normal' | 'thorough';
    dataRetentionDays: number;
    alertCooldownSeconds: number;
    alertWebhookUrl: string;
    apiKey: string;
    alertEmailSmtp: {
      host: string;
      port: number;
      user: string;
      password: string;
      recipient: string;
    };
  };
  meta: {
    configSources: string[];
    envOverridden: string[];
    restartRequired: string[] | boolean;
    timestamp: string;
  };
};

type SettingsSubnetsFixture = {
  detected: Array<{ cidr: string; source: 'auto' }>;
  configured: Array<{ cidr: string; source: 'user' }>;
  effective: string[];
};

function latestJson(world: SettingsApiWorld): Record<string, unknown> {
  return (world.latestResponseJson as Record<string, unknown> | undefined) ?? {};
}

function latestData(world: SettingsApiWorld): Record<string, unknown> {
  return (latestJson(world).data as Record<string, unknown> | undefined) ?? {};
}

function latestMeta(world: SettingsApiWorld): Record<string, unknown> {
  return (latestJson(world).meta as Record<string, unknown> | undefined) ?? {};
}

function latestError(world: SettingsApiWorld): Record<string, unknown> {
  return (latestJson(world).error as Record<string, unknown> | undefined) ?? {};
}

function defaultSettingsFixture(): SettingsConfigFixture {
  return {
    data: {
      subnets: ['10.0.0.0/24'],
      scanCadence: '0 */6 * * *',
      scanIntensity: 'normal',
      dataRetentionDays: 365,
      alertCooldownSeconds: 300,
      alertWebhookUrl: 'https://hooks.example.com/netobserver',
      apiKey: 'nobs_****...a1b2',
      alertEmailSmtp: {
        host: 'smtp.example.com',
        port: 587,
        user: 'alerts@example.com',
        password: '****',
        recipient: 'admin@example.com',
      },
    },
    meta: {
      configSources: ['defaults', 'yaml', 'runtime', 'env'],
      envOverridden: [],
      restartRequired: false,
      timestamp: new Date().toISOString(),
    },
  };
}

function currentFixture(world: SettingsApiWorld): SettingsConfigFixture {
  if (!world.configFixture) {
    world.configFixture = defaultSettingsFixture();
  }

  return world.configFixture;
}

function currentSubnetsFixture(world: SettingsApiWorld): SettingsSubnetsFixture {
  if (!world.subnetsFixture) {
    world.subnetsFixture = {
      detected: [{ cidr: '192.168.1.0/24', source: 'auto' }],
      configured: currentFixture(world).data.subnets.map((cidr) => ({ cidr, source: 'user' as const })),
      effective: [...currentFixture(world).data.subnets],
    };
  }

  return world.subnetsFixture;
}

function buildFullApiKey(suffix = 'a1b2', fill = 'a'): string {
  return `${fill.repeat(64 - suffix.length)}${suffix}`;
}

function redactApiKeyForSettings(fullApiKey: string): string {
  return `••••${fullApiKey.slice(-4)}`;
}

function unauthorizedResponse() {
  return {
    error: {
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid API key',
    },
    meta: { timestamp: new Date().toISOString() },
  };
}

function settingsLocator(world: SettingsApiWorld, testId: string) {
  const settings = world.settingsPage ?? new SettingsPage(world.page);
  world.settingsPage = settings;

  switch (testId) {
    case 'settings-loading':
      return settings.settingsLoading;
    case 'panel-general':
      return settings.panelGeneral;
    case 'input-cron':
      return settings.inputCron;
    case 'radio-quick':
      return settings.radioQuick;
    case 'radio-normal':
      return settings.radioNormal;
    case 'radio-thorough':
      return settings.radioThorough;
    case 'input-retention-days':
      return settings.inputRetentionDays;
    case 'btn-save-general':
      return settings.btnSaveGeneral;
    case 'settings-retry':
      return settings.settingsRetry;
    case 'restart-required-banner':
      return settings.restartRequiredBanner;
    case 'field-scan-cadence-restart':
      return settings.scanCadenceRestartIndicator;
    case 'field-scan-intensity-restart':
      return settings.scanIntensityRestartIndicator;
    case 'field-scan-cadence-error':
      return settings.scanCadenceError;
    case 'field-retention-days-error':
      return settings.retentionDaysError;
    case 'alert-banner':
      return settings.alertBanner;
    case 'alert-banner-message':
      return settings.alertBannerMessage;
    case 'field-scan-cadence-env-managed':
    case 'field-scan-intensity-env-managed':
      return world.page.getByTestId(testId);
    default:
      return world.page.getByTestId(testId);
  }
}

async function installSettingsRoutes(world: SettingsApiWorld): Promise<void> {
  if ((world.parameters as Record<string, unknown>).settingsRoutesInstalled) {
    return;
  }

  (world.parameters as Record<string, unknown>).settingsRoutesInstalled = true;
  world.interceptedConfigUpdates = [];
  world.interceptedWebhookTests = [];
  world.interceptedEmailTests = [];
  world.configGetCallCount = 0;
  world.interceptedApiKeyRevealCount = 0;

  await world.page.route('**/api/v1/config/subnets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: currentSubnetsFixture(world),
        meta: { timestamp: new Date().toISOString() },
      }),
    });
  });

  await world.page.route('**/api/v1/config/test-webhook', async (route) => {
    const payload = route.request().postDataJSON() as { url: string };
    world.interceptedWebhookTests?.push(payload);

    if (world.failWebhookTestMessage) {
      const message = world.failWebhookTestMessage;
      world.failWebhookTestMessage = undefined;
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'WEBHOOK_TEST_FAILED',
            message,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          success: true,
          statusCode: 200,
          message: 'Success — webhook responded with 200 OK',
        },
        meta: { timestamp: new Date().toISOString() },
      }),
    });
  });

  await world.page.route('**/api/v1/config/test-email', async (route) => {
    const payload = route.request().postDataJSON() as {
      host: string;
      port: number;
      user?: string;
      password?: string;
      recipient: string;
    };
    world.interceptedEmailTests?.push(payload);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          success: true,
          message: 'Success',
        },
        meta: { timestamp: new Date().toISOString() },
      }),
    });
  });

  await world.page.route('**/api/v1/config/api-key', async (route) => {
    const requestApiKey = route.request().headers()['x-api-key'];
    if (world.currentAcceptedApiKey && requestApiKey !== world.currentAcceptedApiKey) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify(unauthorizedResponse()),
      });
      return;
    }

    world.interceptedApiKeyRevealCount = (world.interceptedApiKeyRevealCount ?? 0) + 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          apiKey: world.currentAcceptedApiKey ?? buildFullApiKey(),
        },
        meta: { timestamp: new Date().toISOString() },
      }),
    });
  });

  await world.page.route('**/api/v1/config/regenerate-key', async (route) => {
    const requestApiKey = route.request().headers()['x-api-key'];
    if (world.currentAcceptedApiKey && requestApiKey !== world.currentAcceptedApiKey) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify(unauthorizedResponse()),
      });
      return;
    }

    const fixture = currentFixture(world);
    world.previousAcceptedApiKey = world.currentAcceptedApiKey ?? buildFullApiKey('e1f2');
    world.regeneratedApiKey = buildFullApiKey('9f0a', 'b');
    world.currentAcceptedApiKey = world.regeneratedApiKey;
    fixture.data.apiKey = redactApiKeyForSettings(world.regeneratedApiKey);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          apiKey: world.regeneratedApiKey,
          message: 'API key regenerated. The old key is no longer valid.',
        },
        meta: { timestamp: new Date().toISOString() },
      }),
    });
  });

  await world.page.route('**/api/v1/config', async (route) => {
    const fixture = currentFixture(world);
    const method = route.request().method();
    const requestApiKey = route.request().headers()['x-api-key'];

    if (world.currentAcceptedApiKey && requestApiKey !== world.currentAcceptedApiKey) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify(unauthorizedResponse()),
      });
      return;
    }

    if (method === 'GET') {
      world.configGetCallCount = (world.configGetCallCount ?? 0) + 1;

      if (world.failConfigRequest === 'network') {
        await route.abort('failed');
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixture),
      });
      return;
    }

    if (method === 'PATCH') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      world.interceptedConfigUpdates?.push(payload);

      if (world.failNextSaveMessage) {
        const message = world.failNextSaveMessage;
        world.failNextSaveMessage = undefined;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'CONFIG_SAVE_FAILED',
              message,
            },
          }),
        });
        return;
      }

      fixture.data = {
        ...fixture.data,
        ...payload,
      };
      if (Array.isArray(payload.subnets)) {
        world.subnetsFixture = {
          detected: currentSubnetsFixture(world).detected,
          configured: payload.subnets.map((cidr) => ({ cidr: String(cidr), source: 'user' as const })),
          effective: payload.subnets.map((cidr) => String(cidr)),
        };
      }
      fixture.meta.restartRequired = Object.keys(payload).filter((field) => ['scanCadence', 'scanIntensity', 'subnets'].includes(field));
      fixture.meta.timestamp = new Date().toISOString();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: fixture.data,
          meta: {
            applied: Object.keys(payload).filter((field) => !['scanCadence', 'scanIntensity', 'subnets'].includes(field)),
            restartRequired: fixture.meta.restartRequired,
            rejected: [],
            envOverridden: fixture.meta.envOverridden,
            timestamp: fixture.meta.timestamp,
          },
        }),
      });
      return;
    }

    await route.continue();
  });
}

function parseFieldValue(field: string, value: string): unknown {
  if (field === 'subnets') {
    return [value];
  }

  if (field === 'dataRetentionDays' || field === 'presenceOfflineThreshold' || field === 'alertCooldownSeconds') {
    return Number(value);
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}

function buildPayload(table: DataTable): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const row of table.hashes() as Array<{ field: string; value: string }>) {
    payload[row.field] = parseFieldValue(row.field, row.value);
  }

  return payload;
}

async function captureJson(world: SettingsApiWorld): Promise<void> {
  if (!world.latestResponse) {
    world.latestResponseJson = undefined;
    return;
  }

  world.latestResponseJson = await world.latestResponse.json();
}

async function requestEffectiveConfig(world: SettingsApiWorld): Promise<void> {
  world.latestResponse = await world.request.get('/api/v1/config');
  await captureJson(world);
}

async function patchSettings(world: SettingsApiWorld, payload: Record<string, unknown>): Promise<void> {
  world.pendingPayload = payload;
  world.latestResponse = await world.request.patch('/api/v1/config', { data: payload });
  await captureJson(world);
}

Given('an authenticated settings API client', async function (this: SettingsApiWorld) {
  expect(this.request).toBeTruthy();
});

When('the client requests the effective settings configuration', async function (this: SettingsApiWorld) {
  await requestEffectiveConfig(this);
});

When('the client requests the effective settings configuration again', async function (this: SettingsApiWorld) {
  await requestEffectiveConfig(this);
});

When('the client updates the runtime settings with:', async function (this: SettingsApiWorld, table: DataTable) {
  await patchSettings(this, buildPayload(table));
});

When('the client updates the {string} setting to {string}', async function (this: SettingsApiWorld, field: string, value: string) {
  await patchSettings(this, { [field]: parseFieldValue(field, value) });
});

When('the client submits an empty settings update', async function (this: SettingsApiWorld) {
  await patchSettings(this, {});
});

When(
  'two authenticated clients save alert cooldown values of {string} and {string} seconds',
  async function (this: SettingsApiWorld, first: string, second: string) {
    const apiKeyResponse = await this.request.get('/api/v1/config/api-key');
    const apiKeyBody = await apiKeyResponse.json() as { data?: { apiKey?: string } };
    const apiKey = apiKeyBody.data?.apiKey ?? process.env.API_KEY ?? 'test-api-key-valid';

    const secondClient = await playwrightRequest.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080',
      extraHTTPHeaders: {
        'X-API-Key': apiKey,
      },
    });

    try {
      const [firstResponse, secondResponse] = await Promise.all([
        this.request.patch('/api/v1/config', { data: { alertCooldownSeconds: Number(first) } }),
        secondClient.patch('/api/v1/config', { data: { alertCooldownSeconds: Number(second) } }),
      ]);

      expect(firstResponse.status()).toBe(200);
      this.latestResponse = secondResponse;
      await captureJson(this);
    } finally {
      await secondClient.dispose();
    }
  },
);

Then('the response status is {int}', function (this: SettingsApiWorld, statusCode: number) {
  expect(this.latestResponse?.status()).toBe(statusCode);
});

Then('the effective settings response redacts the API key and SMTP password', function (this: SettingsApiWorld) {
  expect(latestData(this)).toMatchObject({
    apiKey: expect.stringMatching(/\*{4}/),
    alertEmailSmtp: expect.objectContaining({
      password: '****',
    }),
  });
});

Then('the settings response includes config source metadata', function (this: SettingsApiWorld) {
  expect(latestMeta(this)).toMatchObject({
    configSources: expect.any(Array),
    envOverridden: expect.any(Array),
    timestamp: expect.any(String),
  });
});

Then('the effective settings response shows:', function (this: SettingsApiWorld, table: DataTable) {
  const data = latestData(this);

  for (const row of table.hashes() as Array<{ field: string; value: string }>) {
    expect(data[row.field]).toEqual(parseFieldValue(row.field, row.value));
  }
});

Then('the settings response includes {string} as a config source', function (this: SettingsApiWorld, source: string) {
  expect(latestMeta(this).configSources).toEqual(expect.arrayContaining([source]));
});

Then('the settings update response lists {string} as applied', function (this: SettingsApiWorld, field: string) {
  expect(latestMeta(this).applied).toEqual(expect.arrayContaining([field]));
});

Then('the settings update response lists {string} as restart-required', function (this: SettingsApiWorld, field: string) {
  expect(latestMeta(this).restartRequired).toEqual(expect.arrayContaining([field]));
});

Then('the validation error includes the {string} field', function (this: SettingsApiWorld, field: string) {
  const details = latestError(this).details as Array<{ field: string }> | undefined;
  expect(details).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
});

Then('the error message is {string}', function (this: SettingsApiWorld, message: string) {
  expect(latestError(this).message).toBe(message);
});

Then('the response does not include the {string} field', function (this: SettingsApiWorld, field: string) {
  expect(latestData(this)).not.toHaveProperty(field);
});

Then('a later effective settings request shows {string} as {string}', async function (this: SettingsApiWorld, field: string, value: string) {
  await requestEffectiveConfig(this);
  expect(latestData(this)[field]).toEqual(parseFieldValue(field, value));
});

Given(
  'the effective settings configuration includes scan cadence {string}, scan intensity {string}, and retention {string} days',
  async function (this: SettingsApiWorld, scanCadence: string, scanIntensity: 'quick' | 'normal' | 'thorough', retentionDays: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        scanCadence,
        scanIntensity,
        dataRetentionDays: Number(retentionDays),
      },
    };
    await installSettingsRoutes(this);
  },
);

async function openSettingsPage(world: SettingsApiWorld) {
  await installSettingsRoutes(world);
  if (world.currentAcceptedApiKey) {
    await world.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await world.page.goto('/');
    await world.page.evaluate((apiKey) => {
      localStorage.setItem('netobserver-api-key', apiKey);
    }, world.currentAcceptedApiKey);
  }
  world.settingsPage = new SettingsPage(world.page);
  await world.settingsPage.goto();
  await expect(world.settingsPage.pageContainer).toBeVisible();
}

Given('the effective settings request will fail with a connection error', async function (this: SettingsApiWorld) {
  this.failConfigRequest = 'network';
  this.configFixture = defaultSettingsFixture();
  await installSettingsRoutes(this);
});

Given(
  'the Settings page has loaded General settings with scan cadence {string}, scan intensity {string}, and retention {string} days',
  async function (this: SettingsApiWorld, scanCadence: string, scanIntensity: 'quick' | 'normal' | 'thorough', retentionDays: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        scanCadence,
        scanIntensity,
        dataRetentionDays: Number(retentionDays),
      },
    };
    this.failConfigRequest = undefined;
    await openSettingsPage(this);
  },
);

Given(
  'the Settings page has loaded General settings with scan cadence {string} and scan intensity {string}',
  async function (this: SettingsApiWorld, scanCadence: string, scanIntensity: 'quick' | 'normal' | 'thorough') {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        scanCadence,
        scanIntensity,
      },
    };
    this.failConfigRequest = undefined;
    await openSettingsPage(this);
  },
);

Given('the Settings page has loaded General settings with scan cadence {string}', async function (this: SettingsApiWorld, scanCadence: string) {
  this.configFixture = {
    ...defaultSettingsFixture(),
    data: {
      ...defaultSettingsFixture().data,
      scanCadence,
    },
  };
  this.failConfigRequest = undefined;
  await openSettingsPage(this);
});

Given('the next General settings save will fail with {string}', async function (this: SettingsApiWorld, message: string) {
  this.failNextSaveMessage = message;
  await installSettingsRoutes(this);
});

Given(
  'the server reports that {string} and {string} are managed by environment variables',
  async function (this: SettingsApiWorld, firstField: string, secondField: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      meta: {
        ...defaultSettingsFixture().meta,
        envOverridden: [firstField, secondField],
      },
    };
    await installSettingsRoutes(this);
  },
);

Given(
  'the Settings page has loaded Network settings with detected subnet {string} and configured subnet {string}',
  async function (this: SettingsApiWorld, detectedSubnet: string, configuredSubnet: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        subnets: [configuredSubnet],
      },
    };
    this.subnetsFixture = {
      detected: [{ cidr: detectedSubnet, source: 'auto' }],
      configured: [{ cidr: configuredSubnet, source: 'user' }],
      effective: [configuredSubnet],
    };
    await openSettingsPage(this);
  },
);

Given(
  'the Settings page has loaded Network settings with configured subnet {string}',
  async function (this: SettingsApiWorld, configuredSubnet: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        subnets: [configuredSubnet],
      },
    };
    this.subnetsFixture = {
      detected: [{ cidr: '192.168.1.0/24', source: 'auto' }],
      configured: [{ cidr: configuredSubnet, source: 'user' }],
      effective: [configuredSubnet],
    };
    await openSettingsPage(this);
  },
);

Given(
  'the Settings page has loaded Network settings with configured subnets {string} and {string}',
  async function (this: SettingsApiWorld, firstSubnet: string, secondSubnet: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        subnets: [firstSubnet, secondSubnet],
      },
    };
    this.subnetsFixture = {
      detected: [{ cidr: '192.168.1.0/24', source: 'auto' }],
      configured: [
        { cidr: firstSubnet, source: 'user' },
        { cidr: secondSubnet, source: 'user' },
      ],
      effective: [firstSubnet, secondSubnet],
    };
    await openSettingsPage(this);
  },
);

Given(
  'the Settings page has loaded Alerts settings with webhook URL {string}, SMTP host {string}, port {string}, recipient {string}, and cooldown {string} seconds',
  async function (this: SettingsApiWorld, webhookUrl: string, host: string, port: string, recipient: string, cooldown: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        alertWebhookUrl: webhookUrl,
        alertCooldownSeconds: Number(cooldown),
        alertEmailSmtp: {
          host,
          port: Number(port),
          user: 'alerts@example.com',
          password: '****',
          recipient,
        },
      },
    };
    await openSettingsPage(this);
  },
);

Given(
  'the Settings page has loaded Alerts settings with webhook URL {string}',
  async function (this: SettingsApiWorld, webhookUrl: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        alertWebhookUrl: webhookUrl,
      },
    };
    await openSettingsPage(this);
  },
);

Given(
  'the Settings page has loaded Alerts settings with SMTP host {string}, port {string}, user {string}, password placeholder {string}, recipient {string}, and cooldown {string} seconds',
  async function (this: SettingsApiWorld, host: string, port: string, user: string, password: string, recipient: string, cooldown: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        alertCooldownSeconds: Number(cooldown),
        alertEmailSmtp: {
          host,
          port: Number(port),
          user,
          password,
          recipient,
        },
      },
    };
    await openSettingsPage(this);
  },
);

Given(
  'the Settings page has loaded Alerts settings with SMTP host {string}, port {string}, recipient {string}, and cooldown {string} seconds',
  async function (this: SettingsApiWorld, host: string, port: string, recipient: string, cooldown: string) {
    this.configFixture = {
      ...defaultSettingsFixture(),
      data: {
        ...defaultSettingsFixture().data,
        alertCooldownSeconds: Number(cooldown),
        alertEmailSmtp: {
          host,
          port: port === '' ? Number.NaN : Number(port),
          user: '',
          password: '',
          recipient,
        },
      },
    };
    await openSettingsPage(this);
  },
);

Given('the webhook test request will fail with {string}', async function (this: SettingsApiWorld, message: string) {
  this.failWebhookTestMessage = message;
  await installSettingsRoutes(this);
});

Given('the Settings page has loaded a redacted API key ending with {string}', async function (this: SettingsApiWorld, suffix: string) {
  const fullApiKey = buildFullApiKey(suffix);
  this.currentAcceptedApiKey = fullApiKey;
  this.previousAcceptedApiKey = undefined;
  this.regeneratedApiKey = undefined;
  this.configFixture = {
    ...defaultSettingsFixture(),
    data: {
      ...defaultSettingsFixture().data,
      apiKey: redactApiKeyForSettings(fullApiKey),
    },
  };
  await openSettingsPage(this);
});

Given('the Settings page has revealed the full API key', async function (this: SettingsApiWorld) {
  const fullApiKey = buildFullApiKey('e1f2');
  this.currentAcceptedApiKey = fullApiKey;
  this.previousAcceptedApiKey = undefined;
  this.regeneratedApiKey = undefined;
  this.configFixture = {
    ...defaultSettingsFixture(),
    data: {
      ...defaultSettingsFixture().data,
      apiKey: redactApiKeyForSettings(fullApiKey),
    },
  };
  await openSettingsPage(this);
  const settings = this.settingsPage ?? new SettingsPage(this.page);
  this.settingsPage = settings;
  await settings.openApiTab();
  await settings.toggleApiKeyVisibility();
});

When('the operator opens the Settings page', async function (this: SettingsApiWorld) {
  await installSettingsRoutes(this);
  this.settingsPage = new SettingsPage(this.page);
  await this.settingsPage.goto();
});

When('the operator changes {string} to {string}', async function (this: SettingsApiWorld, testId: string, value: string) {
  const locator = settingsLocator(this, testId);
  await locator.fill(value);
});

When('the operator selects {string}', async function (this: SettingsApiWorld, testId: string) {
  await settingsLocator(this, testId).check();
});

Then('{string} appears while the General settings are loading', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeVisible();
});

Then('{string} becomes visible', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeVisible();
});

Then('{string} is selected', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeChecked();
});

Then('the operator sees {string}', async function (this: SettingsApiWorld, message: string) {
  const settings = this.settingsPage ?? new SettingsPage(this.page);
  this.settingsPage = settings;
  await expect(settings.alertBanner.or(this.page.getByText(message))).toContainText(message);
});

Then('the General settings request is retried', function (this: SettingsApiWorld) {
  expect(this.configGetCallCount ?? 0).toBeGreaterThanOrEqual(2);
});

Then('{string} becomes disabled during the save request', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeDisabled();
});

Then(
  'the General settings update includes only {string} with value {string}',
  function (this: SettingsApiWorld, field: string, value: string) {
    expect(this.interceptedConfigUpdates?.at(-1)).toEqual({ [field]: parseFieldValue(field, value) });
  },
);

Then('{string} becomes enabled again', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeEnabled();
});

Then('{string} is read-only', async function (this: SettingsApiWorld, testId: string) {
  const locator = settingsLocator(this, testId);
  await expect(locator).toHaveJSProperty('readOnly', true);
});

Then('{string} is disabled', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeDisabled();
});

Then('{string} is enabled', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeEnabled();
});

Then('{string} remains disabled', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toBeDisabled();
});

Then('the Network settings update includes the subnet {string}', function (this: SettingsApiWorld, subnet: string) {
  const payload = this.interceptedConfigUpdates?.at(-1) as { subnets?: string[] } | undefined;
  expect(payload?.subnets).toEqual(expect.arrayContaining([subnet]));
});

Then('the Network settings update does not include the subnet {string}', function (this: SettingsApiWorld, subnet: string) {
  const payload = this.interceptedConfigUpdates?.at(-1) as { subnets?: string[] } | undefined;
  expect(payload?.subnets ?? []).not.toContain(subnet);
});

Then('the webhook test request includes the candidate URL {string}', function (this: SettingsApiWorld, url: string) {
  expect(this.interceptedWebhookTests?.at(-1)).toEqual({ url });
});

Then(
  'the email test request includes SMTP host {string}, port {string}, and recipient {string}',
  function (this: SettingsApiWorld, host: string, port: string, recipient: string) {
    expect(this.interceptedEmailTests?.at(-1)).toMatchObject({
      host,
      port: Number(port),
      recipient,
    });
  },
);

Then('the Alerts settings update includes webhook URL {string}', function (this: SettingsApiWorld, url: string) {
  expect(this.interceptedConfigUpdates?.at(-1)).toMatchObject({
    alertWebhookUrl: url,
  });
});

Then(
  'the Alerts settings update includes SMTP host {string}, port {string}, recipient {string}, and cooldown {string}',
  function (this: SettingsApiWorld, host: string, port: string, recipient: string, cooldown: string) {
    expect(this.interceptedConfigUpdates?.at(-1)).toMatchObject({
      alertEmailSmtp: expect.objectContaining({
        host,
        port: Number(port),
        recipient,
      }),
      alertCooldownSeconds: Number(cooldown),
    });
  },
);

Then('{string} displays the redacted API key ending with {string}', async function (this: SettingsApiWorld, testId: string, suffix: string) {
  const text = (await settingsLocator(this, testId).textContent()) ?? '';
  expect(text).toContain(suffix);
  if (this.currentAcceptedApiKey) {
    expect(text).not.toContain(this.currentAcceptedApiKey);
  }
  if (this.regeneratedApiKey) {
    expect(text).not.toContain(this.regeneratedApiKey);
  }
});

Then('the API key reveal request count is {string}', function (this: SettingsApiWorld, count: string) {
  expect(this.interceptedApiKeyRevealCount ?? 0).toBe(Number(count));
});

Then('the API key reveal request count remains {string}', function (this: SettingsApiWorld, count: string) {
  expect(this.interceptedApiKeyRevealCount ?? 0).toBe(Number(count));
});

Then('{string} displays the full API key', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toHaveText(this.currentAcceptedApiKey ?? buildFullApiKey('e1f2'));
});

Then('the clipboard contains the full API key', async function (this: SettingsApiWorld) {
  const copiedText = await this.page.evaluate(() => navigator.clipboard.readText());
  expect(copiedText).toBe(this.currentAcceptedApiKey ?? buildFullApiKey('e1f2'));
});

Then('the API key regeneration warning is visible', async function (this: SettingsApiWorld) {
  const settings = this.settingsPage ?? new SettingsPage(this.page);
  this.settingsPage = settings;
  await expect(settings.apiKeyRegenerationWarning).toBeVisible();
});

When('the operator regenerates the API key', async function (this: SettingsApiWorld) {
  const settings = this.settingsPage ?? new SettingsPage(this.page);
  this.settingsPage = settings;
  await settings.startApiKeyRegeneration();
  await settings.confirmApiKeyRegeneration();
});

Then('{string} displays the full regenerated API key', async function (this: SettingsApiWorld, testId: string) {
  await expect(settingsLocator(this, testId)).toHaveText(this.regeneratedApiKey ?? buildFullApiKey('9f0a', 'b'));
});

Then('the stored dashboard API key matches the regenerated API key', async function (this: SettingsApiWorld) {
  const storedApiKey = await this.page.evaluate(() => localStorage.getItem('netobserver-api-key'));
  expect(storedApiKey).toBe(this.regeneratedApiKey ?? buildFullApiKey('9f0a', 'b'));
});

Then('authenticated settings requests succeed with the regenerated API key', async function (this: SettingsApiWorld) {
  const status = await this.page.evaluate(async (apiKey) => {
    const response = await fetch('/api/v1/config', {
      headers: { 'X-API-Key': apiKey },
    });
    return response.status;
  }, this.regeneratedApiKey ?? buildFullApiKey('9f0a', 'b'));
  expect(status).toBe(200);
});

Then('authenticated settings requests with the previous API key fail with status {string}', async function (this: SettingsApiWorld, statusCode: string) {
  const status = await this.page.evaluate(async (apiKey) => {
    const response = await fetch('/api/v1/config', {
      headers: { 'X-API-Key': apiKey },
    });
    return response.status;
  }, this.previousAcceptedApiKey ?? buildFullApiKey('e1f2'));
  expect(status).toBe(Number(statusCode));
});
