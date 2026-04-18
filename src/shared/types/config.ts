export interface AppConfig {
  subnets: string[];
  scanCadence: string;
  scanIntensity: 'quick' | 'normal' | 'thorough';
  presenceOfflineThreshold: number;
  dataRetentionDays: number;
  portRange: string;
  alertWebhookUrl?: string;
  alertEmailSmtp?: SmtpConfig;
  alertCooldownSeconds: number;
  apiKey: string;
  webUiPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  dbPath: string;
  configFilePath?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  recipient: string;
}
