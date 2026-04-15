# FRD: Configuration Management

## Feature ID
F13

## Overview
Manage all application parameters through a layered configuration system with sensible defaults, optional YAML config file, and environment variable overrides. The application runs with zero configuration out of the box by auto-detecting subnets and generating an API key on first run. Startup validation catches invalid values early with clear error messages.

## PRD References
- PRD Feature: F13 — Configuration Management
- Related Features: F1 (Discovery — subnet config), F3 (Scheduling — cadence), F5 (Ports — port range), F7 (Alerts — webhook/SMTP settings), F11 (REST API — API key, port)

## User Stories

1. **As a home network admin**, I want the application to work out of the box with zero configuration so I can just start the Docker container and have it scan my network.
2. **As an IT admin**, I want to use a YAML configuration file to manage complex settings (multiple subnets, alert rules) so I can version-control my configuration.
3. **As a DevOps engineer**, I want environment variables to override config file values so I can customize deployments in CI/CD and container orchestrators without modifying config files.
4. **As a user**, I want clear error messages on startup if my configuration is invalid so I can fix problems before the application silently misbehaves.
5. **As a first-time user**, I want an API key to be auto-generated so I can start using the REST API immediately without a manual setup step.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F13.1 | All parameters configurable via environment variables | Must | Flat namespace with underscore separation (e.g., `SCAN_CADENCE`) |
| F13.2 | Support YAML configuration file as alternative/supplement to env vars | Should | Default path: `/config/config.yaml` (Docker volume mount) |
| F13.3 | Environment variables override config file values, config file overrides defaults | Must | Loading order: defaults → config file → env vars |
| F13.4 | Sensible defaults for all parameters (application runs with zero configuration) | Must | See defaults table below |
| F13.5 | Validate configuration on startup and report clear error messages | Must | Validation rules defined below |
| F13.6 | Auto-detect local subnets from container's network interfaces | Must | Reads interfaces, excludes loopback and link-local |
| F13.7 | Auto-generate API key on first run if none is configured | Must | 256-bit random key, stored persistently |
| F13.8 | Distinguish runtime-changeable vs restart-required configuration | Should | See changeable table below |
| F13.9 | Support configuration reload via API (for runtime-changeable params) | Should | `POST /api/config/reload` — requires API key |
| F13.10 | Log the effective (merged) configuration at startup (redacting secrets) | Must | SMTP password, API key shown as `****` |

## Acceptance Criteria

### AC-1: Zero-Configuration Startup
- **Given** no configuration file exists and no environment variables are set
- **When** the application starts
- **Then** it runs with all defaults: auto-detected subnets, 6-hour scan cadence, 1-year retention, auto-generated API key
- **And** logs the effective configuration at `info` level

### AC-2: Environment Variable Override
- **Given** `SCAN_CADENCE=0 */2 * * *` is set as an environment variable
- **When** the application starts
- **Then** scans run every 2 hours, overriding the default 6-hour cadence

### AC-3: Config File + Env Var Precedence
- **Given** a config file sets `scan.cadence: "0 */4 * * *"` and the environment variable `SCAN_CADENCE=0 */2 * * *` is also set
- **When** the application starts
- **Then** the env var value takes precedence and scans run every 2 hours

### AC-4: Invalid Configuration Rejection
- **Given** an invalid cron expression `not-a-cron` is configured for scan cadence
- **When** the application starts
- **Then** it exits with a non-zero exit code
- **And** the error message clearly identifies: the parameter name, the invalid value, and what a valid value looks like

### AC-5: Subnet Auto-Detection
- **Given** no subnets are manually configured
- **When** the application starts in a Docker container with host networking
- **Then** it reads the container's network interfaces
- **And** identifies all non-loopback, non-link-local IPv4 subnets
- **And** uses them as scan targets

### AC-6: API Key Auto-Generation
- **Given** no API key is configured and the application has never run before
- **When** the application starts for the first time
- **Then** a 256-bit random API key is generated
- **And** the key is stored persistently (survives container restart)
- **And** the key is logged once at startup (or written to a well-known file) for the user to retrieve

### AC-7: Config Reload via API
- **Given** a runtime-changeable parameter (e.g., `alerts.cooldown_seconds`) is updated in the config file
- **When** `POST /api/config/reload` is called with a valid API key
- **Then** the changed parameter takes effect without restarting the application
- **And** the response confirms which parameters were reloaded

### AC-8: Secret Redaction in Logs
- **Given** SMTP password and API key are configured
- **When** the effective configuration is logged at startup
- **Then** the SMTP password is shown as `****`
- **And** the API key is shown as the last 4 characters prefixed with `****`

## Technical Considerations

### Config Loading Order

```
1. Load hardcoded defaults (compiled into the application)
2. If config file exists at CONFIG_PATH (default: /config/config.yaml):
   a. Parse YAML
   b. Validate structure
   c. Merge into config (overrides defaults)
3. Read environment variables matching known parameter names
   a. Merge into config (overrides file values)
4. Run validation on the final merged config
5. If validation fails → exit with error
6. If validation passes → log effective config (secrets redacted) and proceed
```

### Config File Format (YAML)

```yaml
# /config/config.yaml — Network Observability Configuration

scan:
  subnets:                     # Override auto-detection
    - "192.168.1.0/24"
    - "10.0.0.0/24"
  cadence: "0 */6 * * *"      # Cron expression
  intensity: "normal"          # quick | normal | thorough
  port_range: "top1000"        # top1000 | 1-1024 | 1-65535 | custom list

storage:
  retention_days: 365
  db_path: "/data/network-observer.db"

alerts:
  enabled: true
  cooldown_seconds: 3600
  webhook:
    urls:
      - "https://hooks.example.com/network-alerts"
    timeout_ms: 5000
  email:
    smtp_host: "smtp.example.com"
    smtp_port: 587
    smtp_user: "alerts@example.com"
    smtp_pass: "secret"
    from: "noreply@example.com"
    to:
      - "admin@example.com"

presence:
  offline_threshold: 2
  availability_window_hours: 24

api:
  port: 8080
  key: "your-api-key-here"     # Omit to auto-generate

logging:
  level: "info"                # debug | info | warn | error
  format: "json"               # json | text
```

### Environment Variable Mapping

| Config Path | Environment Variable | Type | Default |
|-------------|---------------------|------|---------|
| `scan.subnets` | `SCAN_SUBNETS` | Comma-separated | Auto-detected |
| `scan.cadence` | `SCAN_CADENCE` | Cron string | `0 */6 * * *` |
| `scan.intensity` | `SCAN_INTENSITY` | Enum | `normal` |
| `scan.port_range` | `SCAN_PORT_RANGE` | String | `top1000` |
| `storage.retention_days` | `STORAGE_RETENTION_DAYS` | Integer | `365` |
| `storage.db_path` | `STORAGE_DB_PATH` | File path | `/data/network-observer.db` |
| `alerts.enabled` | `ALERTS_ENABLED` | Boolean | `true` |
| `alerts.cooldown_seconds` | `ALERT_COOLDOWN` | Integer | `3600` |
| `alerts.webhook.urls` | `ALERT_WEBHOOK_URL` | Comma-separated | *(none)* |
| `alerts.webhook.timeout_ms` | `ALERT_WEBHOOK_TIMEOUT` | Integer | `5000` |
| `alerts.email.smtp_host` | `ALERT_SMTP_HOST` | String | *(none)* |
| `alerts.email.smtp_port` | `ALERT_SMTP_PORT` | Integer | `587` |
| `alerts.email.smtp_user` | `ALERT_SMTP_USER` | String | *(none)* |
| `alerts.email.smtp_pass` | `ALERT_SMTP_PASS` | String | *(none)* |
| `alerts.email.from` | `ALERT_EMAIL_FROM` | String | `noreply@network-observer` |
| `alerts.email.to` | `ALERT_EMAIL_TO` | Comma-separated | *(none)* |
| `presence.offline_threshold` | `PRESENCE_OFFLINE_THRESHOLD` | Integer | `2` |
| `presence.availability_window_hours` | `PRESENCE_AVAILABILITY_WINDOW` | Integer | `24` |
| `api.port` | `API_PORT` | Integer | `8080` |
| `api.key` | `API_KEY` | String | Auto-generated |
| `logging.level` | `LOG_LEVEL` | Enum | `info` |
| `logging.format` | `LOG_FORMAT` | Enum | `json` |

### Startup Validation Rules

| Parameter | Validation | Error Message |
|-----------|-----------|---------------|
| `scan.cadence` | Must be valid 5-field cron expression | `Invalid cron expression "{value}" for scan.cadence. Expected format: "* * * * *" (min hour dom mon dow)` |
| `scan.intensity` | Must be one of: `quick`, `normal`, `thorough` | `Invalid scan intensity "{value}". Must be one of: quick, normal, thorough` |
| `scan.subnets` | Each must be valid CIDR notation (x.x.x.x/N) | `Invalid subnet "{value}". Expected CIDR notation (e.g., 192.168.1.0/24)` |
| `storage.retention_days` | Integer ≥ 30 | `Retention days must be at least 30. Got: {value}` |
| `alerts.cooldown_seconds` | Integer ≥ 0 | `Alert cooldown must be non-negative. Got: {value}` |
| `alerts.webhook.urls` | Each must be valid HTTP(S) URL | `Invalid webhook URL "{value}". Must be a valid http:// or https:// URL` |
| `alerts.email.smtp_port` | Integer 1–65535 | `SMTP port must be between 1 and 65535. Got: {value}` |
| `api.port` | Integer 1–65535 | `API port must be between 1 and 65535. Got: {value}` |
| `logging.level` | Must be one of: `debug`, `info`, `warn`, `error` | `Invalid log level "{value}". Must be one of: debug, info, warn, error` |
| Config file YAML | Must be valid YAML syntax | `Failed to parse config file at {path}: {yaml_error}` |
| `scan.subnets` + auto-detect | If auto-detect finds 0 interfaces, warn but don't fail | `Warning: No network interfaces detected for auto-subnet discovery. Configure subnets manually.` |

### Subnet Auto-Detection Algorithm

```
1. Read all network interfaces via OS APIs (e.g., os.networkInterfaces() in Node.js)
2. For each interface:
   a. Skip loopback (127.0.0.0/8)
   b. Skip link-local (169.254.0.0/16)
   c. Skip Docker bridge networks (172.17.0.0/16) unless explicitly included
   d. Extract IPv4 address and subnet mask
   e. Calculate network address and CIDR prefix
3. Return deduplicated list of subnets
4. If empty → log warning, set subnets to empty (scans will be skipped with a clear log message)
```

### API Key Auto-Generation

```
1. On startup, check if API key is configured (env var or config file)
2. If configured → use the provided key
3. If not configured:
   a. Check persistent storage (db_path) for a previously generated key
   b. If found → use the stored key
   c. If not found (first run):
      - Generate 32 random bytes → encode as hex (64-char string)
      - Store in database: INSERT INTO config (key, value) VALUES ('api_key', generated_key)
      - Log the key at startup: "Auto-generated API key: {key}"
      - Also write to /data/.api-key file for easy retrieval
```

### Runtime vs Restart-Required Configuration

| Parameter | Runtime Changeable | Notes |
|-----------|-------------------|-------|
| `alerts.cooldown_seconds` | ✅ Yes | Takes effect on next alert evaluation |
| `alerts.webhook.urls` | ✅ Yes | New URLs used for next alert delivery |
| `alerts.email.*` | ✅ Yes | New SMTP settings used for next email |
| `alerts.enabled` | ✅ Yes | Immediately enables/disables alerting |
| `presence.offline_threshold` | ✅ Yes | Applied on next scan completion |
| `logging.level` | ✅ Yes | Changes log verbosity immediately |
| `scan.cadence` | ❌ Restart required | Scheduler must be re-initialized |
| `scan.subnets` | ❌ Restart required | Scanner must be re-initialized with new targets |
| `scan.intensity` | ❌ Restart required | Scan profile compiled at startup |
| `api.port` | ❌ Restart required | HTTP server binds port at startup |
| `storage.db_path` | ❌ Restart required | Database connection established at startup |
| `storage.retention_days` | ✅ Yes | Applied on next cleanup cycle |

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Invalid YAML in config file | Exit with error; include YAML parser error with line number |
| Config file not found at expected path | Not an error; continue with defaults + env vars; log `info: No config file found at {path}, using defaults` |
| Config file exists but is empty | Treat as no config file; continue with defaults + env vars |
| Environment variable with empty value | Treat as "not set"; fall through to config file or default |
| Conflicting settings (e.g., alerts enabled but no webhook URL and no SMTP) | Warn at startup: `Alerts enabled but no delivery channel configured. Alerts will be logged but not delivered.` |
| `SCAN_SUBNETS` set to empty string | Override auto-detection with empty list; scans will be skipped with a warning |
| Config file permissions denied | Exit with error: `Cannot read config file at {path}: permission denied` |
| API key in both env var and config file | Env var wins (standard precedence); log `info: API key from environment variable overrides config file` |
| Migration between config versions | Future-proofing: config file includes a `version: 1` field; future versions will include migration logic |
| Auto-detected subnet is /32 (single host) | Warn and skip: `Skipping /32 subnet {ip} — single host is likely the container itself` |
| Docker bridge network auto-detected | Exclude by default; include only if user explicitly adds it to `scan.subnets` |
| Config reload fails validation | Reject reload; keep current config; return 400 with validation errors |
| Concurrent config reload requests | Serialize with a mutex; second request waits for the first to complete |

## Configuration

This FRD *defines* the configuration system itself. The master parameter list is in the Environment Variable Mapping table above.

| Meta-Parameter | Env Var | Default | Description |
|----------------|---------|---------|-------------|
| Config file path | `CONFIG_PATH` | `/config/config.yaml` | Path to the YAML configuration file |
| Config version | — | `1` | Config schema version (in config file header) |

## Dependencies

- **F1 (Discovery):** Subnet configuration and scan intensity parameters.
- **F3 (Scheduling):** Scan cadence cron expression.
- **F5 (Port Detection):** Port range configuration.
- **F7 (Alerts):** Webhook URLs, SMTP settings, cooldown period.
- **F8 (Presence):** Offline threshold configuration.
- **F11 (REST API):** API port, API key, config reload endpoint.
- **NFR-3:** Zero-config first-run experience (auto-detect subnets, generate API key).
- **NFR-7/8:** Database path configuration and Docker volume persistence.
- **NFR-15:** Log level and format configuration.
