# FRD: Settings UI Management

## Feature ID
F14

## Overview
Wire the existing Settings dashboard page to real backend configuration APIs, enabling users to view, modify, test, and persist application settings through the web UI. The Settings page currently exists as a UI scaffold with hardcoded values and no backend connectivity. This FRD bridges F13 (Configuration Management — backend config system) and F10 (Dashboard — web UI) by defining the API endpoints for runtime config management and the frontend behavior for each settings tab.

## PRD References
- PRD Feature: F13 — Configuration Management (backend config system)
- PRD Feature: F10 — Dashboard & Visualization (web UI)
- Related Features: F7 (Alerts — webhook/SMTP delivery), F11 (REST API — endpoint suite), F3 (Scheduling — scan cadence)

## UI/UX References
- Screen Map: §6 Settings (`/settings`) — 4 tabs: General, Network, Alerts, API
- Flow Walkthrough: Flow 6 (Configure Scan Settings), Flow 7 (Set Up Webhook Alerts)
- Component Inventory: Settings form controls, tab bar, alert banners

## Current Implementation (Brownfield Context)

### What Exists — Backend
- `src/api/config/loader.ts`: Loads config at startup via layered precedence (defaults → YAML → env vars). Config is loaded ONCE and passed to `createServer()`. No runtime update mechanism.
- `src/shared/types/config.ts`: `AppConfig` and `SmtpConfig` interfaces define all config fields.
- `src/api/alerts/notifier.ts`: `sendWebhookAlert()` and `sendEmailAlert()` functions work but are only called from the scan pipeline — no test delivery endpoints.
- `src/api/middleware/auth.ts`: `setApiKey()` exists for runtime key updates but nothing calls it post-startup.
- `src/api/config/loader.ts` `validateConfig()`: Partial config validation exists.
- **No `GET /api/v1/config` endpoint** — frontend cannot read current config.
- **No `PATCH /api/v1/config` endpoint** — frontend cannot update config.
- **No `POST /api/v1/config/reload` endpoint** — mentioned in README and FRD-F13.9 but not implemented.
- **No test webhook/email endpoints.**
- **No API key regeneration endpoint.**

### What Exists — Frontend
- `src/web/pages/SettingsPage.tsx`: 4-tab layout (General, Network, Alerts, API) with complete form controls. All state is local `useState()` — no `useApi()`, no `fetch()`, no `useEffect()` for loading.
- Hardcoded API key: `const apiKey = 'nobs_a1b2c3d4e5f6g7h8i9j0klmn'` (not the real key).
- Hardcoded subnet list: `useState([{cidr:'192.168.1.0/24',...}, ...])`.
- All "Save Changes" buttons have no `onClick` handlers.
- "Test Webhook" and "Test Email" buttons have no handlers.
- "Regenerate Key" toggles a confirmation state but performs no actual regeneration.
- `e2e/settings.spec.ts`: E2E tests verify controls render; no functional tests.

### Gap Summary
The UI scaffold is complete. The backend config system loads config at startup. The missing piece is the **runtime config API layer** (read/write/test endpoints) and **frontend wiring** (loading state from API, saving changes, testing delivery channels, managing API keys).

## User Stories

1. **As a network admin**, I want to view the current application settings in the dashboard so I can understand how the system is configured without checking config files or environment variables.
2. **As a network admin**, I want to change scan cadence, intensity, and retention period from the UI so I don't have to edit YAML files and restart the container.
3. **As a network admin**, I want to manage monitored subnets from the UI — seeing auto-detected subnets and adding manual ones — so I can control what gets scanned.
4. **As a network admin**, I want to configure webhook and email alert delivery from the UI, including testing that delivery works before saving, so I can be confident alerts will reach me.
5. **As a network admin**, I want to view, copy, and regenerate my API key from the UI so I can manage API access without server-side commands.
6. **As a user**, I want clear feedback when settings are saved (success/error toasts) and indication of which settings require a restart to take effect.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F14.1 | `GET /api/v1/config` returns the current effective configuration with secrets redacted | Must | API key shown as `nobs_****...last4`; SMTP password as `****` |
| F14.2 | `PATCH /api/v1/config` updates runtime-changeable configuration parameters | Must | Accepts partial updates (section-based); server validates before applying |
| F14.3 | `POST /api/v1/config/test-webhook` sends a test webhook to a candidate URL | Must | Accepts `{ url: string }` in body — tests before saving, not only persisted config |
| F14.4 | `POST /api/v1/config/test-email` sends a test email via candidate SMTP settings | Must | Accepts full SMTP config in body — tests before saving |
| F14.5 | `POST /api/v1/config/regenerate-key` generates a new API key and returns it | Must | Returns the new key once; subsequent `GET /config` shows it redacted |
| F14.6 | `GET /api/v1/config/subnets` returns detected, configured, and effective subnet lists | Must | Response includes `{ detected: [...], configured: [...], effective: [...] }` |
| F14.7 | Settings page loads current config from `GET /api/v1/config` on mount | Must | Shows loading spinner until data arrives; shows error state on failure |
| F14.8 | Each tab's "Save Changes" button sends `PATCH /api/v1/config` with that tab's fields | Must | Only sends changed fields; shows success/error toast |
| F14.9 | Settings that require restart are visually indicated in the UI | Should | Badge or tooltip: "Requires restart to take effect" |
| F14.10 | "Test Webhook" sends candidate URL (from the form field, not persisted value) to test endpoint | Must | Shows delivery result: success with status code, or error with details |
| F14.11 | "Test Email" sends candidate SMTP settings (from the form fields) to test endpoint | Must | Shows delivery result: success or error with SMTP diagnostics |
| F14.12 | API key is loaded from server (redacted); "Reveal" fetches the full key via `GET /api/v1/config/api-key` | Must | Full key shown only when user explicitly reveals |
| F14.13 | "Regenerate Key" shows confirmation dialog, then calls regenerate endpoint | Must | Displays the new key once; warns that old key is immediately invalidated |
| F14.14 | Network tab loads subnets from `GET /api/v1/config/subnets` showing detected vs. configured | Must | Auto-detected subnets shown as read-only; configured subnets are editable |
| F14.15 | Server-side validation errors are surfaced in the UI per field | Should | e.g., "Invalid cron expression", "Retention must be ≥ 30 days" |
| F14.16 | Runtime config changes are persisted to a runtime config store (survives restart) | Must | See persistence design below |
| F14.17 | `GET /api/v1/config/api-key` returns the full (unredacted) API key | Must | Requires authentication; used by the "Reveal" toggle |

## Acceptance Criteria

### AC-1: Load Settings on Mount
- **Given** the Settings page is opened
- **When** the page mounts
- **Then** a loading state is shown, `GET /api/v1/config` is called, and all form fields are populated with the current server config values
- **And** the API key field shows the redacted form (e.g., `nobs_****...a1b2`)

### AC-2: Save General Settings
- **Given** the General tab is active and the user changes scan cadence from "every 6 hours" to "every 1 hour"
- **When** the user clicks "Save Changes"
- **Then** `PATCH /api/v1/config` is sent with `{ scanCadence: "0 */1 * * *" }`
- **And** a success toast "Settings saved successfully" appears
- **And** the save button is disabled during the request (loading state)
- **And** a "Requires restart" indicator is shown for scan cadence

### AC-3: Save Network Settings
- **Given** the Network tab shows auto-detected subnets and configured subnets
- **When** the user adds a new subnet `10.0.0.0/24` and clicks "Save Changes"
- **Then** `PATCH /api/v1/config` is sent with the updated subnets list
- **And** the new subnet appears in the configured list after save

### AC-4: Test Webhook Before Saving
- **Given** the Alerts tab is active and the webhook URL field contains `https://hooks.example.com/netobserver`
- **When** the user clicks "Test Webhook" (before saving)
- **Then** `POST /api/v1/config/test-webhook` is sent with `{ url: "https://hooks.example.com/netobserver" }`
- **And** a result indicator shows "Success — webhook responded with 200 OK" or an error with details

### AC-5: Test Email Before Saving
- **Given** the Alerts tab has SMTP fields filled (host, port, user, password, recipient)
- **When** the user clicks "Test Email"
- **Then** `POST /api/v1/config/test-email` is sent with the candidate SMTP config from the form
- **And** a result indicator shows delivery success or SMTP error details

### AC-6: Save Alert Settings
- **Given** the Alerts tab has been modified (webhook URL, cooldown seconds)
- **When** the user clicks "Save Changes"
- **Then** `PATCH /api/v1/config` is sent with alert-related fields
- **And** the persisted config is updated and takes effect on the next alert evaluation

### AC-7: Reveal API Key
- **Given** the API tab shows the API key in redacted form
- **When** the user clicks "Reveal"
- **Then** `GET /api/v1/config/api-key` is called and the full key is displayed
- **And** clicking "Hide" re-redacts the display (no new API call)

### AC-8: Copy API Key
- **Given** the API key is revealed
- **When** the user clicks "Copy"
- **Then** the full API key is copied to the clipboard
- **And** a "Copied!" feedback is shown

### AC-9: Regenerate API Key
- **Given** the user clicks "Regenerate Key"
- **When** the confirmation dialog appears and the user confirms
- **Then** `POST /api/v1/config/regenerate-key` is called
- **And** the new key is displayed (revealed) once
- **And** the old key is immediately invalidated
- **And** the frontend updates its stored API key for subsequent requests

### AC-10: Validation Errors
- **Given** the user enters an invalid cron expression in the scan cadence field
- **When** the user clicks "Save Changes"
- **Then** the server returns a 400 with validation errors
- **And** the UI shows per-field error messages (e.g., "Invalid cron expression")
- **And** the config is NOT updated

### AC-11: Restart-Required Indicators
- **Given** the user changes a restart-required setting (scan cadence, subnets, intensity)
- **When** the save succeeds
- **Then** the UI shows an informational banner: "Some changes require a restart to take effect"
- **And** the affected fields have a visual indicator (e.g., info icon with tooltip)

### AC-12: Error Handling — Network Failure
- **Given** the backend is unreachable
- **When** the Settings page loads or a save is attempted
- **Then** an error state is shown: "Unable to load settings. Check server connection."
- **And** a retry option is available

### AC-13: Subnet Display
- **Given** the Network tab is active
- **When** config is loaded
- **Then** auto-detected subnets are shown with a "Detected" badge (read-only)
- **And** user-configured subnets are shown with edit/remove controls
- **And** the user can add new subnets via the add form

## API Contract

### GET /api/v1/config
Returns the current effective configuration with secrets redacted.

**Response 200:**
```json
{
  "data": {
    "scanCadence": "0 */6 * * *",
    "scanIntensity": "normal",
    "dataRetentionDays": 365,
    "presenceOfflineThreshold": 1,
    "portRange": "",
    "alertWebhookUrl": "https://hooks.example.com/nobs",
    "alertCooldownSeconds": 300,
    "alertEmailSmtp": {
      "host": "smtp.example.com",
      "port": 587,
      "user": "alerts@example.com",
      "password": "****",
      "recipient": "admin@example.com"
    },
    "apiKey": "nobs_****...a1b2",
    "webUiPort": 8080,
    "logLevel": "info",
    "subnets": ["192.168.1.0/24", "10.0.0.0/24"]
  },
  "meta": {
    "configSources": ["defaults", "yaml", "env", "runtime"],
    "restartRequired": false
  }
}
```

### GET /api/v1/config/api-key
Returns the full (unredacted) API key. Requires authentication.

**Response 200:**
```json
{
  "data": {
    "apiKey": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
  }
}
```

### PATCH /api/v1/config
Updates one or more configuration parameters. Accepts partial updates.

**Request body:**
```json
{
  "scanCadence": "0 */1 * * *",
  "dataRetentionDays": 180
}
```

**Response 200:**
```json
{
  "data": { "...updated effective config..." },
  "meta": {
    "applied": ["dataRetentionDays"],
    "restartRequired": ["scanCadence"],
    "rejected": []
  }
}
```

**Response 400 (validation error):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Configuration validation failed",
    "details": [
      { "field": "scanCadence", "message": "Invalid cron expression" }
    ]
  }
}
```

### POST /api/v1/config/test-webhook
Tests a webhook URL by sending a test payload. Accepts a candidate URL (not necessarily persisted).

**Request body:**
```json
{
  "url": "https://hooks.example.com/netobserver"
}
```

**Response 200:**
```json
{
  "data": {
    "success": true,
    "statusCode": 200,
    "responseTime": 142
  }
}
```

**Response 200 (delivery failed):**
```json
{
  "data": {
    "success": false,
    "error": "Connection refused",
    "statusCode": null,
    "responseTime": null
  }
}
```

### POST /api/v1/config/test-email
Tests SMTP delivery by sending a test email. Accepts candidate SMTP settings.

**Request body:**
```json
{
  "host": "smtp.example.com",
  "port": 587,
  "user": "alerts@example.com",
  "password": "secret",
  "recipient": "admin@example.com"
}
```

**Response 200:**
```json
{
  "data": {
    "success": true,
    "message": "Test email sent to admin@example.com"
  }
}
```

### POST /api/v1/config/regenerate-key
Generates a new API key. The old key is immediately invalidated.

**Response 200:**
```json
{
  "data": {
    "apiKey": "new_key_hex_string_64_chars...",
    "message": "API key regenerated. The old key is no longer valid."
  }
}
```

### GET /api/v1/config/subnets
Returns subnet information: auto-detected, user-configured, and effective.

**Response 200:**
```json
{
  "data": {
    "detected": [
      { "cidr": "192.168.1.0/24", "interface": "eth0", "source": "auto" }
    ],
    "configured": [
      { "cidr": "10.0.0.0/24", "source": "user" }
    ],
    "effective": ["192.168.1.0/24", "10.0.0.0/24"]
  }
}
```

## Persistence Design

### Runtime Config Store
Runtime configuration changes made via the Settings UI are persisted to a **`config` table in the existing SQLite database**. This ensures changes survive application restarts without requiring YAML file writes or environment variable changes.

**Precedence order (highest wins):**
1. Environment variables (always override — cannot be changed from UI; shown as read-only)
2. Runtime config store (UI-modified values)
3. YAML config file
4. Defaults

**Behavior:**
- `PATCH /api/v1/config` writes to the runtime config store.
- On startup, `loadConfig()` merges: defaults → YAML → runtime store → env vars.
- Fields set via environment variables are marked as "externally managed" in the `GET /config` response and shown as read-only in the UI.
- The `config` table schema: `CREATE TABLE IF NOT EXISTS runtime_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`.

### Runtime Apply vs Restart-Required

| Parameter | Runtime Changeable | Apply Behavior |
|-----------|-------------------|----------------|
| `alertWebhookUrl` | ✅ Yes | Used on next alert delivery |
| `alertEmailSmtp.*` | ✅ Yes | Used on next email delivery |
| `alertCooldownSeconds` | ✅ Yes | Used on next alert evaluation |
| `presenceOfflineThreshold` | ✅ Yes | Applied on next scan completion |
| `dataRetentionDays` | ✅ Yes | Applied on next cleanup cycle |
| `logLevel` | ✅ Yes | Changes log verbosity immediately |
| `scanCadence` | ❌ Restart required | Scheduler initialized at startup |
| `scanIntensity` | ❌ Restart required | Scan profile compiled at startup |
| `subnets` | ❌ Restart required | Scanner targets set at startup |
| `webUiPort` | ❌ Read-only | HTTP server binds port at startup |
| `dbPath` | ❌ Read-only | Database connection at startup |

**Note:** `PATCH` accepts restart-required fields — they are persisted and will take effect on next restart. The response `meta.restartRequired` array indicates which saved fields need a restart.

## Validation Rules (Server-Side — Single Source of Truth)

| Field | Rule | Error Message |
|-------|------|---------------|
| `scanCadence` | Valid cron expression (5-field) | "Invalid cron expression: {value}" |
| `scanIntensity` | One of: `quick`, `normal`, `thorough` | "Scan intensity must be 'quick', 'normal', or 'thorough'" |
| `dataRetentionDays` | Integer ≥ 30 | "Retention period must be at least 30 days" |
| `presenceOfflineThreshold` | Integer ≥ 1 | "Offline threshold must be at least 1" |
| `alertCooldownSeconds` | Integer ≥ 0 | "Cooldown must be a non-negative number" |
| `alertWebhookUrl` | Valid URL starting with `http://` or `https://` (or empty to disable) | "Invalid webhook URL" |
| `alertEmailSmtp.host` | Non-empty string when SMTP is configured | "SMTP host is required" |
| `alertEmailSmtp.port` | Integer 1–65535 | "SMTP port must be between 1 and 65535" |
| `alertEmailSmtp.recipient` | Valid email format | "Invalid email address for recipient" |
| `subnets[*]` | Valid CIDR notation (e.g., `192.168.1.0/24`) | "Invalid CIDR notation: {value}" |
| `logLevel` | One of: `debug`, `info`, `warn`, `error` | "Log level must be 'debug', 'info', 'warn', or 'error'" |

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Settings page opened with backend unreachable | Show error state with retry button; disable save buttons |
| Save fails due to network error | Show error toast: "Failed to save settings. Check server connection." |
| Save returns validation errors | Show per-field error messages; do not clear the form |
| Test webhook URL is empty | Disable "Test Webhook" button; show "Enter a URL to test" hint |
| Test webhook returns non-2xx | Show warning: "Webhook responded with {status}. Check the URL." |
| Test webhook connection refused | Show error: "Could not connect to webhook URL" |
| Test email with incomplete SMTP | Disable "Test Email" button until all required fields are filled |
| SMTP connection timeout | Show error with diagnostics: "SMTP connection timed out after 10s" |
| API key regeneration while other clients use old key | Warn in confirmation dialog: "All existing API clients will need the new key" |
| Concurrent saves from multiple tabs/users | Last-write-wins (no optimistic locking for v1); consider ETag in future |
| Env-var-overridden field edited in UI | Field is read-only with "Set via environment variable" badge |
| Empty PATCH body | Return 400: "No configuration fields provided" |
| Unknown field in PATCH body | Ignore unknown fields; return only known fields in response |
| Save of only restart-required fields | Persist and return `meta.restartRequired` list; show banner in UI |

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Settings page load time (API call + render) | < 500ms |
| Config save round-trip | < 300ms |
| Test webhook timeout | 10 seconds |
| Test email timeout | 15 seconds |
| API key length | 64 hex characters |
| Concurrent config writes | Serialized (mutex) |

## Dependencies

- **F13 (Configuration Management):** Backend config loading, validation, `AppConfig` schema
- **F7 (Alerts):** `sendWebhookAlert()` and `sendEmailAlert()` functions (reused for test endpoints)
- **F11 (REST API):** API key auth middleware, JSON response envelope, error response format
- **F10 (Dashboard):** Settings page route, sidebar navigation, toast notification system

## Out of Scope (v1)

- Config file editing via UI (only runtime store is written)
- Import/export settings as YAML
- Settings change audit log (who changed what, when)
- Multi-user role-based settings access
- Undo/revert to previous settings
- Real-time config sync across multiple UI sessions
