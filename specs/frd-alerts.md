# FRD: New Device Alerts

## Feature ID
F7

## Overview
Alert users when a previously unknown device appears on the network via configurable notification channels. The system supports webhook (HTTP POST) and email (SMTP) delivery, with deduplication via cooldown periods and a "known device" marking workflow to suppress repeat alerts for trusted devices.

## PRD References
- PRD Feature: F7 — New Device Alerts
- Related Features: F1 (Discovery), F2 (Fingerprinting), F8 (Presence Tracking), F13 (Configuration)

## User Stories

1. **As a security-conscious user**, I want to receive a webhook notification when a new device joins my network so I can investigate unauthorized access immediately.
2. **As a home network admin**, I want to receive an email alert when an unknown device appears so I can check whether it belongs to a guest or an intruder.
3. **As a small business IT admin**, I want to mark trusted devices as "known" so I stop receiving alerts every time an employee's laptop reconnects.
4. **As a security-conscious user**, I want alert cooldown to prevent notification storms during large network events (e.g., office opens Monday morning) so I don't get overwhelmed.
5. **As an IT admin**, I want failed alert deliveries to be retried automatically so I don't miss critical new-device notifications due to transient network issues.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F7.1 | Detect when a previously unseen MAC address (or fingerprint) appears | Must | Compare against known device store after each scan |
| F7.2 | Support webhook (HTTP POST) alert channel | Must | Configurable URL, optional custom headers |
| F7.3 | Support email (SMTP) alert channel | Should | Configurable SMTP host, port, credentials, recipient(s) |
| F7.4 | Alert payload includes device details: MAC, IP, vendor, hostname, discovered services | Must | See webhook payload schema below |
| F7.5 | Configurable alert cooldown period to prevent duplicate alerts (default: 1 hour) | Must | Per-device cooldown tracked by fingerprint ID |
| F7.6 | Allow marking devices as "known" to suppress future alerts for that device | Must | Via API and UI; stored as boolean flag on device record |
| F7.7 | Support configurable alert templates | Should | Mustache/Handlebars-style variables in email subject/body |
| F7.8 | Queue failed alerts for retry with exponential backoff | Should | Max 5 retries, backoff: 30s, 60s, 120s, 240s, 480s |
| F7.9 | Log all alert attempts (success/failure) with timestamps | Must | Structured log entries for audit trail |
| F7.10 | Support multiple webhook URLs | Should | Array of URLs; each receives the same payload independently |
| F7.11 | Support enabling/disabling alert channels independently | Must | e.g., webhook enabled, email disabled |

## Acceptance Criteria

### AC-1: Webhook Alert Delivery
- **Given** alerting is enabled with a webhook URL configured
- **When** a new device (unseen MAC/fingerprint) is discovered during a scan
- **Then** an HTTP POST is sent to the configured URL with a JSON payload containing MAC, IP, vendor, hostname, and discovered services
- **And** the response status code is logged

### AC-2: Alert Cooldown / Deduplication
- **Given** a device was alerted on 5 minutes ago and the cooldown period is 1 hour
- **When** the same device is seen again in a subsequent scan
- **Then** no duplicate alert is sent
- **And** the cooldown resets only after the full cooldown period elapses

### AC-3: Known Device Suppression
- **Given** a device has been marked as "known" by the user
- **When** that device reappears after being offline
- **Then** no new-device alert is triggered for that device

### AC-4: Email Alert Delivery
- **Given** alerting is enabled with SMTP settings configured
- **When** a new device is discovered
- **Then** an email is sent to the configured recipient(s) with device details in the body
- **And** the email subject contains the device hostname or MAC address

### AC-5: Alert Retry on Failure
- **Given** a webhook endpoint returns a 5xx error or connection timeout
- **When** the alert delivery fails
- **Then** the system retries up to 5 times with exponential backoff (30s, 60s, 120s, 240s, 480s)
- **And** each retry attempt is logged with the attempt number and error

### AC-6: Alert Storm Protection
- **Given** a scan discovers 20 new devices simultaneously (e.g., after a network event)
- **When** alerts are generated for all new devices
- **Then** alerts are queued and sent sequentially with a minimum inter-alert delay of 1 second
- **And** webhook endpoints are not overwhelmed with concurrent requests

### AC-7: Marking Device as Known via API
- **Given** a device exists in the system with `known: false`
- **When** a `PATCH /api/devices/:id` request sets `known: true`
- **Then** the device is marked as known
- **And** no future new-device alerts are generated for this device's fingerprint

## Technical Considerations

### Webhook Payload Schema

```json
{
  "event": "new_device_detected",
  "timestamp": "2024-01-15T10:30:00Z",
  "device": {
    "id": "uuid-string",
    "mac": "AA:BB:CC:DD:EE:FF",
    "ip": "192.168.1.42",
    "vendor": "Apple, Inc.",
    "hostname": "iPhone-Living-Room",
    "services": [
      { "port": 62078, "protocol": "tcp", "service": "iphone-sync" }
    ],
    "first_seen": "2024-01-15T10:30:00Z",
    "mac_randomized": false
  },
  "scan_id": "uuid-string"
}
```

### Email Template Structure

- **Subject:** `[Network Alert] New device detected: {{hostname || mac}}`
- **Body (plain text + HTML):**
  - Device summary: MAC, IP, vendor, hostname
  - Discovered services table
  - Timestamp and scan ID
  - Link to device detail page (if Web UI is accessible)
  - "Mark as Known" quick-action link (deep-link to API)

### Alert Deduplication Algorithm

1. After each scan, compare discovered device fingerprints against the known device store.
2. For each new fingerprint, check the `alert_cooldown` table for a recent alert (within the cooldown period).
3. If no recent alert exists and the device is not marked as `known`, enqueue the alert.
4. Record the alert timestamp in the cooldown table keyed by device fingerprint ID.
5. Cooldown entries expire automatically after the configured cooldown period.

### Alert Queue

- In-memory queue with SQLite-backed persistence for crash recovery.
- Alerts are processed sequentially with a minimum 1-second inter-alert delay.
- Failed alerts enter the retry queue with exponential backoff.
- After max retries exhausted, the alert is logged as `delivery_failed` and moved to a dead-letter record.

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Webhook endpoint is down | Retry with exponential backoff (5 attempts); log each failure; after max retries, log as `delivery_failed` |
| SMTP authentication failure | Log error with details; do not retry auth failures (not transient); mark email channel as `error` in health status |
| Alert storm (many new devices at once) | Queue alerts; process sequentially with 1s delay; respect per-device cooldown |
| Webhook returns 3xx redirect | Follow up to 3 redirects; log final destination URL |
| Webhook returns 4xx client error | Do not retry (client error is not transient); log the error and response body |
| Device marked as known then unknown | Re-enable alerting for that device; next appearance triggers a new alert |
| Network partition during alert delivery | Alerts remain in queue; retried when connectivity is restored |
| Very large payload (device with many services) | Truncate services list to top 20 ports in payload; full details available via API link |
| Duplicate webhook URLs configured | Deduplicate URLs at config load time; warn in logs |

## Configuration

| Parameter | Env Var | Config Key | Default | Description |
|-----------|---------|------------|---------|-------------|
| Webhook URL(s) | `ALERT_WEBHOOK_URL` | `alerts.webhook.urls` | *(none — disabled)* | Comma-separated list of webhook URLs |
| Webhook timeout | `ALERT_WEBHOOK_TIMEOUT` | `alerts.webhook.timeout_ms` | `5000` | HTTP request timeout in milliseconds |
| SMTP host | `ALERT_SMTP_HOST` | `alerts.email.smtp_host` | *(none — disabled)* | SMTP server hostname |
| SMTP port | `ALERT_SMTP_PORT` | `alerts.email.smtp_port` | `587` | SMTP server port |
| SMTP username | `ALERT_SMTP_USER` | `alerts.email.smtp_user` | *(none)* | SMTP auth username |
| SMTP password | `ALERT_SMTP_PASS` | `alerts.email.smtp_pass` | *(none)* | SMTP auth password |
| Email from | `ALERT_EMAIL_FROM` | `alerts.email.from` | `noreply@network-observer` | Sender email address |
| Email to | `ALERT_EMAIL_TO` | `alerts.email.to` | *(none)* | Comma-separated recipient list |
| Alert cooldown | `ALERT_COOLDOWN` | `alerts.cooldown_seconds` | `3600` | Per-device cooldown in seconds |
| Max retries | `ALERT_MAX_RETRIES` | `alerts.max_retries` | `5` | Maximum delivery retry attempts |
| Alert enabled | `ALERTS_ENABLED` | `alerts.enabled` | `true` | Master switch for all alerting |

## Dependencies

- **F1 (Discovery):** Scan results provide the trigger for new-device detection.
- **F2 (Fingerprinting):** Composite fingerprint determines device identity for deduplication and known-device matching.
- **F4 (Storage):** Alert history, cooldown state, and dead-letter records persisted in the database.
- **F13 (Configuration):** All alert parameters loaded from config system with env var overrides.
- **F11 (REST API):** API endpoints for marking devices as known and querying alert history.
