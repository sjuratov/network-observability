# FRD: Scheduled Scanning

## Feature ID
F3

## Overview
Scheduled Scanning manages the execution lifecycle of network scans — triggering them on a configurable cron-based schedule, supporting on-demand manual triggers, preventing concurrent scan conflicts, and providing visibility into scan status and history. It acts as the orchestration layer between the scheduler/user and the underlying discovery engine (F1), ensuring scans run reliably, are properly tracked, and adapt their behavior based on configurable intensity profiles.

## PRD References
- PRD Feature: F3 (Scheduled Scanning)
- Related Features: F1 (Discovery — the scan engine that F3 triggers), F4 (Storage — persists scan records), F11 (REST API — exposes manual scan trigger and scan status), F13 (Configuration — provides cadence and intensity settings)

## User Stories
- As a **Home Network Admin**, I want scans to run automatically on a schedule, so that my device inventory stays up to date without manual intervention.
- As a **Security-Conscious User**, I want to trigger a manual scan immediately when I suspect an unauthorized device, so that I get instant visibility without waiting for the next scheduled scan.
- As a **Small Business IT** operator, I want to configure scan frequency using cron expressions, so that I can align scanning windows with off-peak hours (e.g., nightly at 2 AM).
- As a **Home Network Admin**, I want to see the status of the current and past scans, so that I know if scanning is working correctly.
- As a **Small Business IT** operator, I want to choose between quick and thorough scan profiles, so that I can balance scan depth against network impact and duration.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F3.1 | Support configurable scan cadence with a default of every 6 hours | Must | Default cron expression: `0 */6 * * *`. Applied on startup. Schedule persists across restarts (reads config, not runtime state). |
| F3.2 | Support cron-like scheduling expressions | Must | Parse standard 5-field cron expressions (`minute hour day-of-month month day-of-week`). Validate on startup — reject invalid expressions with a clear error message and exit. Support common shorthands: `@hourly`, `@daily`, `@weekly`. |
| F3.3 | Allow on-demand manual scan trigger via UI and API | Must | `POST /api/scans` triggers an immediate scan. UI provides a "Scan Now" button. Manual scans use the currently configured intensity profile unless overridden in the request. Manual scans are recorded with `trigger: "manual"` vs `trigger: "scheduled"`. |
| F3.4 | Report scan status: pending, in-progress, completed, failed | Must | Each scan has a lifecycle: `pending` (queued but not started) → `running` (actively scanning) → `completed` (finished successfully) OR `failed` (terminated with error). Store status transitions with timestamps. |
| F3.5 | Support configurable scan intensity profiles | Should | Three profiles: `quick`, `normal`, `thorough`. Each profile adjusts: discovery methods used, timeout per host, rate limit, and TCP probe port list. See Configuration section for profile definitions. |
| F3.6 | Prevent overlapping scans (skip or queue if a scan is already running) | Must | If a scheduled scan fires while another scan is running, skip it and log: "Scheduled scan skipped — scan [ID] already in progress". If a manual scan is requested while scanning, return HTTP 409 Conflict with body: `{ "error": "scan_in_progress", "scanId": "...", "startedAt": "..." }`. |
| F3.7 | Record scan results summary | Must | Each completed scan record includes: scan ID, trigger type, start time, end time, duration, intensity profile, subnets scanned, total devices found, new devices found, devices gone offline, errors encountered. |
| F3.8 | Execute scan-on-startup option | Should | Configurable flag to trigger an immediate scan when the application starts (default: true). Ensures the device inventory is populated immediately rather than waiting for the first scheduled interval. |
| F3.9 | Persist scan schedule across container restarts | Must | The schedule is derived from configuration (env var / config file), not runtime state. On restart, the scheduler reads the configured cron expression and resumes. No "catch-up" scans for missed intervals during downtime. |

## Acceptance Criteria

### AC-1: Default Schedule
- Given the default configuration (no `SCAN_CADENCE` env var set)
- When the application starts
- Then the scheduler is initialized with cron expression `0 */6 * * *`
- And the next scheduled scan time is logged at info level
- And scans execute every 6 hours

### AC-2: Custom Cron Schedule
- Given `SCAN_CADENCE=0 */4 * * *` is configured
- When the application starts and runs for 24 hours
- Then exactly 6 scans are triggered (every 4 hours)
- And each scan record has `trigger: "scheduled"`

### AC-3: Invalid Cron Expression
- Given `SCAN_CADENCE=invalid-cron` is configured
- When the application starts
- Then it exits with a non-zero exit code
- And logs an error: "Invalid scan cadence: 'invalid-cron' is not a valid cron expression"

### AC-4: Manual Scan Trigger via API
- Given the application is idle (no scan running)
- When `POST /api/scans` is called with a valid API key
- Then a scan starts immediately
- And the response includes the scan ID and status "running"
- And the scan record has `trigger: "manual"`

### AC-5: Manual Scan During Active Scan
- Given a scan is currently in progress (status: "running", ID: "scan-123")
- When `POST /api/scans` is called
- Then the response is HTTP 409 Conflict
- And the body contains `{ "error": "scan_in_progress", "scanId": "scan-123", "startedAt": "..." }`

### AC-6: Scheduled Scan During Active Scan
- Given a scan is currently in progress
- When the cron scheduler fires the next scheduled scan
- Then the scheduled scan is skipped (not queued)
- And a log entry records: "Scheduled scan skipped — scan [ID] already in progress"
- And the cron schedule continues normally (next fire time is calculated from cron, not from skip)

### AC-7: Scan Lifecycle Tracking
- Given a scan is triggered
- Then the scan record transitions through states: `pending` → `running` → `completed` (or `failed`)
- And each transition is timestamped
- And the completed record includes: start_time, end_time, duration_ms, devices_found, new_devices, errors

### AC-8: Scan Failure Handling
- Given a scan encounters a fatal error (e.g., all network interfaces unavailable)
- When the error is caught
- Then the scan status is set to "failed"
- And the error message is recorded in the scan record
- And the scheduler continues to fire future scans on schedule (one failure does not stop the scheduler)

### AC-9: Quick Scan Intensity
- Given `SCAN_INTENSITY=quick` is configured
- When a scan runs
- Then only ARP discovery is used (ICMP and TCP SYN are skipped)
- And the scan completes significantly faster than "normal" intensity
- And the scan record indicates `intensity: "quick"`

### AC-10: Thorough Scan Intensity
- Given `SCAN_INTENSITY=thorough` is configured
- When a scan runs
- Then all discovery methods are used (ARP + ICMP + TCP SYN)
- And TCP SYN probes scan an expanded port list (top 100 ports)
- And host timeout is increased to 10 seconds
- And the scan record indicates `intensity: "thorough"`

### AC-11: Scan-on-Startup
- Given `SCAN_ON_STARTUP=true` (the default)
- When the application starts
- Then a scan is triggered immediately (before the first cron interval)
- And the scan record has `trigger: "startup"`

### AC-12: Scan Duration Exceeds Cadence
- Given `SCAN_CADENCE=*/15 * * * *` (every 15 minutes) and a scan takes 20 minutes
- When the cron fires at minute 15 while the first scan is still running
- Then the minute-15 scan is skipped (per AC-6)
- And the next scan fires at minute 30 (if the first scan has completed by then)
- And no scan queue builds up

## Technical Considerations
- **Cron parsing**: Use a well-maintained cron parsing library (e.g., `node-cron`, `cron-parser`, or `croner`). Must support standard 5-field cron and common shorthands. Validate at startup before scheduling.
- **Scan lock mechanism**: Use an in-memory mutex/flag to prevent concurrent scans. The flag is checked atomically before starting any scan. Since this is a single-process application, an in-memory lock is sufficient (no need for distributed locking).
- **Scan ID generation**: Use UUIDs (v4) or ULID for scan IDs. ULIDs have the advantage of being sortable by time.
- **Intensity profiles**: The profiles adjust parameters passed to the F1 Discovery engine. The scheduler does not perform scanning itself — it configures and triggers F1.
- **Container restart recovery**: On restart, read the cron expression from config and start the scheduler fresh. Do not attempt to determine "missed" scans during downtime. If scan-on-startup is enabled, the first scan runs immediately, effectively catching up.
- **Scan timeout**: Reuse F1's `SCAN_TIMEOUT` configuration. If a scan exceeds the timeout, mark it as "failed" with reason "timeout" and release the scan lock so subsequent scans can run.
- **Graceful shutdown**: On SIGTERM/SIGINT, if a scan is running, allow it a grace period (configurable, default: 30 seconds) to complete. If it doesn't finish within the grace period, abort and mark as "failed" with reason "shutdown".

## Edge Cases & Error Handling
- **Scan takes longer than cadence interval**: Handled by the concurrent scan prevention (F3.6). The overlapping scheduled scan is skipped. The cron schedule is not affected — it continues to fire at its normal times. No queue accumulates.
- **Container restart during scan**: The in-progress scan is lost (in-memory lock is cleared on restart). On startup, check for scan records with status "running" and no end_time — mark them as "failed" with reason "interrupted". Then proceed with scan-on-startup if configured.
- **Rapid manual scan requests**: Rate-limit manual scan triggers — reject with HTTP 429 if a manual scan was triggered within the last 60 seconds (configurable). This prevents accidental rapid-fire scans.
- **Clock drift / timezone**: Cron expressions are evaluated in the container's local timezone. Document this behavior. If the user needs UTC, they should set the container's timezone to UTC.
- **Cron expression edge cases**: Expressions like `* * * * *` (every minute) are technically valid but would create very high scan frequency. Log a warning if the effective interval is less than 5 minutes: "Warning: scan cadence is less than 5 minutes. This may cause scan overlap and high network load."
- **Empty scan results**: If a scan completes with zero devices found, record it as "completed" (not "failed") but log a warning: "Scan completed with 0 devices found. Check subnet configuration and network connectivity."
- **Multiple subnets — partial failure**: If scanning one subnet succeeds but another fails (e.g., network unreachable), record the scan as "completed" with partial results and include the errors for the failed subnet. Do not mark the entire scan as "failed" for a partial failure.

## Configuration

| Parameter | Env Variable | Default | Description |
|-----------|-------------|---------|-------------|
| Scan cadence | `SCAN_CADENCE` | `0 */6 * * *` | Cron expression for scheduled scans. Supports 5-field cron and shorthands (`@hourly`, `@daily`). |
| Scan intensity | `SCAN_INTENSITY` | `normal` | Default intensity profile: `quick`, `normal`, or `thorough` |
| Scan on startup | `SCAN_ON_STARTUP` | `true` | Whether to trigger a scan immediately on application start |
| Manual scan cooldown | `MANUAL_SCAN_COOLDOWN` | `60` (seconds) | Minimum interval between manual scan requests |
| Shutdown grace period | `SHUTDOWN_GRACE_PERIOD` | `30` (seconds) | Time to wait for a running scan to complete on shutdown |

### Scan Intensity Profile Definitions

| Parameter | Quick | Normal | Thorough |
|-----------|-------|--------|----------|
| Discovery methods | ARP only | ARP + ICMP | ARP + ICMP + TCP SYN |
| TCP probe ports | *(none)* | 22, 53, 80, 443, 445, 8080 | Top 100 common ports |
| Host timeout | 2 seconds | 5 seconds | 10 seconds |
| Rate limit (pps) | 1000 | 500 | 200 |
| Estimated /24 duration | < 1 minute | < 5 minutes | < 15 minutes |

## Dependencies
- **Features this depends on:** F1 (Discovery — the scan engine invoked by the scheduler), F13 (Configuration — provides cadence, intensity, and startup settings)
- **Features that depend on this:** F4 (Storage — persists scan records and results), F10 (Dashboard — displays scan history and status), F11 (REST API — exposes manual scan trigger and scan status endpoints)
