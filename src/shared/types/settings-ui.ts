import type { AppConfig, SmtpConfig } from './config.js';

export type SettingsConfigSource = 'defaults' | 'yaml' | 'runtime' | 'env';

export type SettingsMutableField =
  | 'subnets'
  | 'scanCadence'
  | 'scanIntensity'
  | 'presenceOfflineThreshold'
  | 'dataRetentionDays'
  | 'portRange'
  | 'alertWebhookUrl'
  | 'alertEmailSmtp'
  | 'alertCooldownSeconds'
  | 'logLevel';

export type SettingsReadOnlyField = 'webUiPort' | 'dbPath' | 'apiKey';

export interface RedactedSmtpConfig extends Omit<SmtpConfig, 'password'> {
  password: '****';
}

export interface SettingsConfigView extends Omit<AppConfig, 'apiKey' | 'alertEmailSmtp'> {
  apiKey: string;
  alertEmailSmtp?: RedactedSmtpConfig;
}

export interface SettingsConfigMeta {
  timestamp: string;
  configSources: SettingsConfigSource[];
  envOverridden: Array<SettingsMutableField | SettingsReadOnlyField>;
  restartRequired: boolean;
}

export interface SettingsConfigResponse {
  data: SettingsConfigView;
  meta: SettingsConfigMeta;
}

export interface SettingsApiKeyRevealResponse {
  data: {
    apiKey: string;
  };
  meta: {
    timestamp: string;
  };
}

export interface SettingsApiKeyRegenerateResponse {
  data: {
    apiKey: string;
    message: string;
  };
  meta: {
    timestamp: string;
  };
}

export interface SettingsValidationErrorDetail {
  field: string;
  message: string;
}

export interface SettingsErrorBody {
  code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'WEBHOOK_TEST_FAILED' | 'EMAIL_TEST_FAILED';
  message: string;
  details?: SettingsValidationErrorDetail[];
}

export interface SettingsErrorResponse {
  error: SettingsErrorBody;
  meta: {
    timestamp: string;
  };
}

export interface SettingsSubnetEntry {
  cidr: string;
  source: 'auto' | 'user';
  interface?: string;
}

export interface SettingsSubnetsResponse {
  data: {
    detected: SettingsSubnetEntry[];
    configured: SettingsSubnetEntry[];
    effective: string[];
  };
  meta: {
    timestamp: string;
  };
}

export interface SettingsWebhookTestRequest {
  url: string;
}

export interface SettingsWebhookTestResult {
  success: true;
  statusCode: number;
  message: string;
}

export interface SettingsWebhookTestResponse {
  data: SettingsWebhookTestResult;
  meta: {
    timestamp: string;
  };
}

export type SettingsEmailTestRequest = SmtpConfig;

export interface SettingsEmailTestResult {
  success: true;
  message: string;
}

export interface SettingsEmailTestResponse {
  data: SettingsEmailTestResult;
  meta: {
    timestamp: string;
  };
}

export interface SettingsConfigUpdateRequest {
  subnets?: string[];
  scanCadence?: string;
  scanIntensity?: AppConfig['scanIntensity'];
  presenceOfflineThreshold?: number;
  dataRetentionDays?: number;
  portRange?: string;
  alertWebhookUrl?: string | null;
  alertEmailSmtp?: SmtpConfig;
  alertCooldownSeconds?: number;
  logLevel?: AppConfig['logLevel'];
}

export interface SettingsConfigUpdateMeta {
  timestamp: string;
  applied: string[];
  restartRequired: string[];
  rejected: string[];
}

export interface SettingsConfigUpdateResponse {
  data: SettingsConfigView;
  meta: SettingsConfigUpdateMeta;
}

export type SettingsGeneralField = 'scanCadence' | 'scanIntensity' | 'dataRetentionDays';

export interface SettingsGeneralConfig {
  scanCadence: AppConfig['scanCadence'];
  scanIntensity: AppConfig['scanIntensity'];
  dataRetentionDays: AppConfig['dataRetentionDays'];
}

export interface SettingsGeneralLoadMeta {
  timestamp: string;
  envOverridden: Array<SettingsGeneralField | SettingsReadOnlyField>;
}

export interface SettingsGeneralLoadResponse {
  data: SettingsGeneralConfig;
  meta: SettingsGeneralLoadMeta;
}

export type SettingsGeneralUpdateRequest = Partial<SettingsGeneralConfig>;

export interface SettingsGeneralUpdateMeta {
  timestamp: string;
  applied: SettingsGeneralField[];
  restartRequired: SettingsGeneralField[];
  rejected: SettingsGeneralField[];
}

export interface SettingsGeneralUpdateResponse {
  data: SettingsGeneralConfig;
  meta: SettingsGeneralUpdateMeta;
}

export type SettingsGeneralValidationErrors = Partial<Record<SettingsGeneralField, string>>;
