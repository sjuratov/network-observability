import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { generateApiKey, getEnvOverriddenFields, redactApiKey, redactSmtpConfig, validateConfig, detectSubnets } from '../config/loader.js';
import { writeRuntimeConfig } from '../config/runtime-store.js';
import { setApiKey } from '../middleware/auth.js';
import { sendEmailAlert, sendWebhookAlert } from '../alerts/notifier.js';
import type {
  SettingsConfigResponse,
  SettingsConfigUpdateRequest,
  SettingsConfigUpdateResponse,
  SettingsApiKeyRevealResponse,
  SettingsApiKeyRegenerateResponse,
  SettingsEmailTestRequest,
  SettingsEmailTestResponse,
  SettingsErrorResponse,
  SettingsSubnetsResponse,
  SettingsValidationErrorDetail,
  SettingsWebhookTestRequest,
  SettingsWebhookTestResponse,
} from '@shared/types/settings-ui.js';
import type { AppConfig } from '@shared/types/config.js';
import type { ScanScheduler } from '../scanner/scheduler.js';

type AppWithConfig = FastifyInstance & {
  appConfig: AppConfig;
  scanScheduler?: ScanScheduler;
};

const RESTART_REQUIRED_FIELDS = new Set(['scanIntensity', 'subnets']);
const KNOWN_MUTABLE_FIELDS = new Set<keyof SettingsConfigUpdateRequest>([
  'subnets',
  'scanCadence',
  'scanIntensity',
  'presenceOfflineThreshold',
  'dataRetentionDays',
  'portRange',
  'alertWebhookUrl',
  'alertEmailSmtp',
  'alertCooldownSeconds',
  'logLevel',
]);

let updateQueue: Promise<void> = Promise.resolve();

function now() {
  return new Date().toISOString();
}

function errorResponse(
  reply: FastifyReply,
  statusCode: number,
  code: SettingsErrorResponse['error']['code'],
  message: string,
  details?: SettingsValidationErrorDetail[],
) {
  reply.status(statusCode);
  return {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
    meta: { timestamp: now() },
  } satisfies SettingsErrorResponse;
}

function getConfig(fastify: FastifyInstance): AppConfig {
  return (fastify as AppWithConfig).appConfig;
}

function toConfigResponse(config: AppConfig): SettingsConfigResponse {
  return {
    data: {
      ...config,
      apiKey: redactApiKey(config.apiKey),
      alertEmailSmtp: redactSmtpConfig(config.alertEmailSmtp),
    },
    meta: {
      timestamp: now(),
      configSources: ['defaults', 'yaml', 'runtime', 'env'],
      envOverridden: getEnvOverriddenFields(),
      restartRequired: false,
    },
  };
}

function validationDetails(errors: string[]): SettingsValidationErrorDetail[] {
  return errors.map((message) => {
    if (message.includes('scan.cadence')) {
      return { field: 'scanCadence', message };
    }
    if (message.includes('storage.retention_days')) {
      return { field: 'dataRetentionDays', message };
    }
    if (message.includes('scan.intensity')) {
      return { field: 'scanIntensity', message };
    }
    if (message.includes('presence.offline_threshold')) {
      return { field: 'presenceOfflineThreshold', message };
    }
    if (message.includes('log_level')) {
      return { field: 'logLevel', message };
    }
    if (message.includes('subnet')) {
      return { field: 'subnets', message };
    }
    return { field: 'config', message };
  });
}

function persistApiKey(dbPath: string, apiKey: string): void {
  const keyDir = path.dirname(dbPath);
  const keyFile = path.join(keyDir, '.api-key');
  fs.mkdirSync(keyDir, { recursive: true });
  fs.writeFileSync(keyFile, apiKey, { mode: 0o600 });
}

function buildSettingsAlertPayload() {
  return {
    event: 'new_device_detected' as const,
    timestamp: now(),
    device: {
      id: 'settings-test-device',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '10.0.0.10',
      vendor: 'Settings',
      hostname: 'settings-test-host',
      services: [],
      first_seen: now(),
      mac_randomized: false,
    },
  };
}

function validateWebhookTestRequest(payload: Partial<SettingsWebhookTestRequest>): SettingsValidationErrorDetail[] {
  const details: SettingsValidationErrorDetail[] = [];
  if (!payload.url) {
    details.push({ field: 'url', message: 'Webhook URL is required' });
    return details;
  }

  try {
    const parsed = new URL(payload.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      details.push({ field: 'url', message: 'Webhook URL must use HTTP or HTTPS' });
    }
  } catch {
    details.push({ field: 'url', message: 'Webhook URL must be a valid URL' });
  }

  return details;
}

function validateEmailTestRequest(payload: Partial<SettingsEmailTestRequest>): SettingsValidationErrorDetail[] {
  const details: SettingsValidationErrorDetail[] = [];

  if (!payload.host) {
    details.push({ field: 'host', message: 'SMTP host is required' });
  }
  if (!Number.isFinite(payload.port) || (payload.port ?? 0) < 1 || (payload.port ?? 0) > 65535) {
    details.push({ field: 'port', message: 'SMTP port must be between 1 and 65535' });
  }
  if (!payload.recipient) {
    details.push({ field: 'recipient', message: 'Recipient email is required' });
  }

  return details;
}

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/config', async () => {
    return toConfigResponse(getConfig(fastify));
  });

  fastify.get('/config/api-key', async () => {
    return {
      data: { apiKey: getConfig(fastify).apiKey },
      meta: { timestamp: now() },
    } satisfies SettingsApiKeyRevealResponse;
  });

  fastify.get('/config/subnets', async () => {
    const config = getConfig(fastify);
    return {
      data: {
        detected: detectSubnets().map((cidr) => ({ cidr, source: 'auto' as const })),
        configured: config.subnets.map((cidr) => ({ cidr, source: 'user' as const })),
        effective: config.subnets,
      },
      meta: { timestamp: now() },
    } satisfies SettingsSubnetsResponse;
  });

  fastify.post('/config/test-webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = (request.body ?? {}) as Partial<SettingsWebhookTestRequest>;
    const details = validateWebhookTestRequest(payload);
    if (details.length > 0) {
      return errorResponse(reply, 400, 'VALIDATION_ERROR', 'Webhook test validation failed', details);
    }

    const delivery = await sendWebhookAlert(payload.url!, buildSettingsAlertPayload());
    if (delivery.status === 'failed') {
      return errorResponse(reply, 502, 'WEBHOOK_TEST_FAILED', delivery.error ?? 'Webhook test delivery failed');
    }

    return {
      data: {
        success: true,
        statusCode: 200,
        message: 'Success - webhook responded with 200 OK',
      },
      meta: { timestamp: now() },
    } satisfies SettingsWebhookTestResponse;
  });

  fastify.post('/config/test-email', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = (request.body ?? {}) as Partial<SettingsEmailTestRequest>;
    const details = validateEmailTestRequest(payload);
    if (details.length > 0) {
      return errorResponse(reply, 400, 'VALIDATION_ERROR', 'Email test validation failed', details);
    }

    const delivery = await sendEmailAlert({
      host: payload.host!,
      port: payload.port!,
      user: payload.user,
      pass: payload.password,
      from: payload.user || 'alerts@netobserver.local',
      to: [payload.recipient!],
    }, buildSettingsAlertPayload());

    if (delivery.status === 'failed') {
      return errorResponse(reply, 502, 'EMAIL_TEST_FAILED', delivery.error ?? 'Email test delivery failed');
    }

    return {
      data: {
        success: true,
        message: 'Success',
      },
      meta: { timestamp: now() },
    } satisfies SettingsEmailTestResponse;
  });

  fastify.patch('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = (request.body ?? {}) as SettingsConfigUpdateRequest;
    const filteredEntries = Object.entries(payload).filter(
      ([key, value]) => KNOWN_MUTABLE_FIELDS.has(key as keyof SettingsConfigUpdateRequest) && value !== undefined,
    );

    if (filteredEntries.length === 0) {
      return errorResponse(reply, 400, 'BAD_REQUEST', 'No configuration fields provided');
    }

    const filteredPayload = Object.fromEntries(filteredEntries) as Partial<AppConfig>;
    const validation = validateConfig(filteredPayload);
    if (!validation.valid) {
      return errorResponse(reply, 400, 'VALIDATION_ERROR', 'Configuration validation failed', validationDetails(validation.errors));
    }

    const config = getConfig(fastify);
    const applied = Object.keys(filteredPayload).filter((field) => !RESTART_REQUIRED_FIELDS.has(field));
    const restartRequired = Object.keys(filteredPayload).filter((field) => RESTART_REQUIRED_FIELDS.has(field));

    await (updateQueue = updateQueue.then(async () => {
      Object.assign(config, filteredPayload);
      writeRuntimeConfig(config.dbPath, filteredPayload);
    }));

    // Hot-reload scheduler if scanCadence changed
    if (filteredPayload.scanCadence) {
      const scheduler = (fastify as AppWithConfig).scanScheduler;
      if (scheduler?.reschedule) {
        scheduler.reschedule(filteredPayload.scanCadence as string);
      }
    }

    return {
      data: toConfigResponse(config).data,
      meta: {
        timestamp: now(),
        applied,
        restartRequired,
        rejected: [],
      },
    } satisfies SettingsConfigUpdateResponse;
  });

  fastify.post('/config/regenerate-key', async () => {
    const config = getConfig(fastify);
    const apiKey = generateApiKey();
    config.apiKey = apiKey;
    writeRuntimeConfig(config.dbPath, { apiKey });
    persistApiKey(config.dbPath, apiKey);
    setApiKey(apiKey);

    return {
      data: {
        apiKey,
        message: 'API key regenerated. The old key is no longer valid.',
      },
      meta: { timestamp: now() },
    } satisfies SettingsApiKeyRegenerateResponse;
  });
}
