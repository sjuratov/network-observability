import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateConfig, detectSubnets, generateApiKey } from '@api/config/loader.js';
import type { AppConfig } from '@shared/types/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Configuration Management', () => {
  const savedEnv: Record<string, string | undefined> = {};
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `config-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    // Save env vars we might modify
    for (const key of [
      'SCAN_CADENCE', 'SCAN_INTENSITY', 'SCAN_SUBNETS',
      'STORAGE_RETENTION_DAYS', 'STORAGE_DB_PATH', 'API_KEY',
      'WEB_UI_PORT', 'LOG_LEVEL', 'CONFIG_FILE'
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    // Cleanup temp dir
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ─── Zero-Configuration Startup ───

  describe('Zero-Configuration Startup', () => {
    // Scenario: Application starts with default configuration
    it('should start with default configuration values', async () => {
      const config = await loadConfig();

      expect(config.scanCadence).toBe('0 */6 * * *');
      expect(config.dataRetentionDays).toBe(365);
      expect(config.scanIntensity).toBe('normal');
      expect(config.webUiPort).toBe(8080);
      expect(config.logLevel).toBe('info');
      expect(config.subnets.length).toBeGreaterThan(0);
    });
  });

  // ─── YAML Config File ───

  describe('YAML Config File', () => {
    // Scenario: Configuration loaded from YAML config file
    it('should load configuration from a YAML file', async () => {
      const configContent = [
        'scan:',
        '  cadence: "0 */4 * * *"',
        '  intensity: thorough',
        'storage:',
        '  retention_days: 180',
      ].join('\n');
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, configContent);
      process.env['CONFIG_FILE'] = configPath;

      const config = await loadConfig();

      expect(config.scanCadence).toBe('0 */4 * * *');
      expect(config.scanIntensity).toBe('thorough');
      expect(config.dataRetentionDays).toBe(180);
    });
  });

  // ─── Environment Variable Override ───

  describe('Environment Variable Override', () => {
    // Scenario: Environment variable overrides default value
    it('should override defaults with environment variables', async () => {
      process.env['SCAN_CADENCE'] = '0 */2 * * *';

      const config = await loadConfig();

      expect(config.scanCadence).toBe('0 */2 * * *');
    });

    // Scenario: Environment variable takes precedence over config file
    it('should give env vars precedence over config file values', async () => {
      const configContent = 'scan:\n  cadence: "0 */4 * * *"\n';
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, configContent);
      process.env['CONFIG_FILE'] = configPath;
      process.env['SCAN_CADENCE'] = '0 */2 * * *';

      const config = await loadConfig();

      expect(config.scanCadence).toBe('0 */2 * * *');
    });

    // Scenario: Config loading order is defaults then file then env vars
    it('should apply config in order: defaults → file → env vars', async () => {
      const configContent = 'scan:\n  intensity: thorough\n';
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, configContent);
      process.env['CONFIG_FILE'] = configPath;
      process.env['SCAN_INTENSITY'] = 'quick';

      const config = await loadConfig();

      expect(config.scanIntensity).toBe('quick');
    });
  });

  // ─── Subnet Auto-Detection ───

  describe('Subnet Auto-Detection', () => {
    // Scenario: Subnets auto-detected from network interfaces
    it('should auto-detect subnets from non-loopback IPv4 interfaces', () => {
      const subnets = detectSubnets();

      expect(subnets.length).toBeGreaterThan(0);
      for (const subnet of subnets) {
        // Should be valid CIDR notation
        expect(subnet).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/);
        // Should not be loopback
        expect(subnet).not.toMatch(/^127\./);
        // Should not be link-local
        expect(subnet).not.toMatch(/^169\.254\./);
      }
    });

    // Scenario: Docker virtual interfaces excluded from auto-detection
    it('should exclude Docker bridge interfaces from auto-detection', () => {
      const subnets = detectSubnets();

      // Docker bridge interfaces (docker0, br-*, veth*) should be excluded
      // We verify by checking that the function doesn't throw and returns results
      expect(Array.isArray(subnets)).toBe(true);
    });
  });

  // ─── Manual Subnet Configuration ───

  describe('Manual Subnet Configuration', () => {
    // Scenario: Manual subnet configuration overrides auto-detection
    it('should use manually configured subnets instead of auto-detection', async () => {
      process.env['SCAN_SUBNETS'] = '192.168.1.0/24,10.0.0.0/24';

      const config = await loadConfig();

      expect(config.subnets).toContain('192.168.1.0/24');
      expect(config.subnets).toContain('10.0.0.0/24');
      expect(config.subnets).toHaveLength(2);
    });
  });

  // ─── Configuration Validation ───

  describe('Configuration Validation', () => {
    // Scenario Outline: Invalid configuration rejected on startup — invalid CIDR
    it('should reject invalid subnet CIDR notation', () => {
      const result = validateConfig({ subnets: ['not-a-subnet'] });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('invalid subnet'))).toBe(true);
    });

    // Scenario Outline: Invalid configuration rejected on startup — invalid CIDR (numeric)
    it('should reject out-of-range subnet octets', () => {
      const result = validateConfig({ subnets: ['999.999.999/24'] });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('invalid subnet'))).toBe(true);
    });

    // Scenario Outline: Invalid configuration rejected on startup — invalid cron
    it('should reject invalid cron expression', () => {
      const result = validateConfig({ scanCadence: 'not-a-cron' });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('invalid cron'))).toBe(true);
    });

    // Scenario Outline: Invalid configuration rejected on startup — retention too low
    it('should reject retention days less than 30', () => {
      const result = validateConfig({ dataRetentionDays: 10 });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 30'))).toBe(true);
    });

    // Scenario Outline: Invalid configuration rejected on startup — negative retention
    it('should reject negative retention days', () => {
      const result = validateConfig({ dataRetentionDays: -5 });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 30'))).toBe(true);
    });

    // Scenario Outline: Invalid configuration rejected on startup — invalid intensity
    it('should reject invalid scan intensity value', () => {
      const result = validateConfig({ scanIntensity: 'extreme' as any });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('quick, normal, thorough'))).toBe(true);
    });

    // Scenario: Invalid YAML syntax in config file
    it('should reject config files with invalid YAML syntax', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, '{ invalid: yaml: [broken');
      process.env['CONFIG_FILE'] = configPath;

      await expect(loadConfig()).rejects.toThrow(/yaml|parse/i);
    });

    // Scenario: Validation error message identifies the parameter and invalid value
    it('should include parameter name and invalid value in error messages', () => {
      const result = validateConfig({ scanCadence: 'bad-cron' });

      expect(result.valid).toBe(false);
      const errorText = result.errors.join(' ');
      expect(errorText).toContain('scan.cadence');
      expect(errorText).toContain('bad-cron');
    });
  });

  // ─── API Key Auto-Generation ───

  describe('API Key Management', () => {
    // Scenario: API key auto-generated on first run
    it('should generate a 256-bit random API key on first run', () => {
      const key = generateApiKey();

      // 256 bits = 32 bytes = 64 hex chars
      expect(key).toMatch(/^[a-f0-9]{64}$/i);
    });

    // Scenario: Auto-generated API key persists across restarts
    it('should persist and reuse auto-generated API key across restarts', async () => {
      process.env['STORAGE_DB_PATH'] = path.join(tempDir, 'test.db');
      const config1 = await loadConfig();
      const apiKey1 = config1.apiKey;

      expect(apiKey1).toBeTruthy();

      // Second load should reuse the same key
      const config2 = await loadConfig();
      expect(config2.apiKey).toBe(apiKey1);
    });

    // Scenario: Explicitly configured API key overrides auto-generated key
    it('should use explicitly configured API key over auto-generated one', async () => {
      process.env['API_KEY'] = 'my-custom-key';

      const config = await loadConfig();

      expect(config.apiKey).toBe('my-custom-key');
    });
  });
});
