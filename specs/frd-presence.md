# FRD: Online/Offline Presence Tracking

## Feature ID
F8

## Overview
Track device presence on the network over time by recording first-seen and last-seen timestamps for every device, detecting offline transitions after a configurable number of missed scans, and calculating availability percentages. A per-device presence timeline enables historical analysis of when devices were online or offline.

## PRD References
- PRD Feature: F8 — Online/Offline Presence Tracking
- Related Features: F1 (Discovery), F2 (Fingerprinting), F3 (Scheduled Scanning), F4 (Storage), F10 (Dashboard)

## User Stories

1. **As a home network admin**, I want to see when each device was first discovered on my network so I can identify when new devices were added.
2. **As a small business IT admin**, I want to know which devices are currently offline so I can investigate connectivity issues.
3. **As a security-conscious user**, I want to see a timeline of when a specific device was online/offline so I can detect unusual access patterns (e.g., a device appearing at odd hours).
4. **As an IT admin**, I want to see availability percentages for critical devices (e.g., printers, servers) so I can track uptime and justify infrastructure investments.
5. **As a home network admin**, I want the system to automatically detect when a device goes offline without requiring me to configure thresholds for every device.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F8.1 | Record the first-seen timestamp for every device | Must | Set once on initial discovery; immutable thereafter |
| F8.2 | Update the last-seen timestamp on every scan where the device is found | Must | Reflects most recent confirmation of presence |
| F8.3 | Detect when a device has gone offline (not seen in last N scans) | Must | Default threshold: 2 missed scans |
| F8.4 | Calculate uptime/availability percentage over a configurable time range | Should | Formula defined below |
| F8.5 | Provide a historical presence timeline per device | Should | Ordered list of online/offline transition events |
| F8.6 | Track current presence status as `online`, `offline`, or `unknown` | Must | `unknown` used for devices seen only once (insufficient data) |
| F8.7 | Record presence transitions (online→offline, offline→online) as discrete events | Must | Stored in device history for timeline queries |
| F8.8 | Support configurable offline detection threshold per device or globally | Should | Global default with per-device override |
| F8.9 | Expose presence data via REST API (F11) | Must | Status, first-seen, last-seen, availability, timeline |

## Acceptance Criteria

### AC-1: First-Seen Timestamp Immutability
- **Given** a device is discovered for the first time
- **When** the scan results are processed
- **Then** the device's `first_seen` timestamp is recorded as the scan's timestamp
- **And** the `first_seen` value never changes on subsequent scans

### AC-2: Last-Seen Update
- **Given** a device is already known to the system
- **When** the device is found in a new scan
- **Then** the device's `last_seen` timestamp is updated to the current scan's timestamp

### AC-3: Offline Detection
- **Given** a device was last seen 3 scans ago and the offline threshold is 2 missed scans
- **When** the current scan completes without finding the device
- **Then** the device's status transitions to `offline`
- **And** an offline transition event is recorded with the timestamp

### AC-4: Online Re-detection
- **Given** a device is currently marked as `offline`
- **When** the device is found in a new scan
- **Then** the device's status transitions to `online`
- **And** an online transition event is recorded
- **And** the `last_seen` timestamp is updated

### AC-5: Availability Calculation
- **Given** a device has been seen in 20 of the last 24 hourly scans
- **When** the availability is calculated for a 24-hour window
- **Then** the availability is reported as approximately 83%

### AC-6: Presence Timeline Query
- **Given** a device has had multiple online/offline transitions over the past 7 days
- **When** the presence timeline is queried via the API for that 7-day range
- **Then** an ordered list of transition events is returned, each with a timestamp and status (`online` or `offline`)

### AC-7: Unknown Status for New Devices
- **Given** a device has been seen in only one scan
- **When** the device status is queried
- **Then** the status is `unknown` (insufficient data to determine presence reliability)
- **And** after the device is seen in a second scan, the status transitions to `online`

## Technical Considerations

### Offline Detection Algorithm

```
For each known device after a scan completes:
  1. Count consecutive scans where the device was NOT found (missed_scans).
  2. If missed_scans >= offline_threshold (default: 2):
     a. If device.status != 'offline':
        - Set device.status = 'offline'
        - Record transition event: { device_id, from: 'online', to: 'offline', timestamp }
  3. If device IS found in the current scan:
     a. Reset missed_scans to 0
     b. Update last_seen timestamp
     c. If device.status == 'offline' or device.status == 'unknown':
        - Set device.status = 'online'
        - Record transition event: { device_id, from: previous_status, to: 'online', timestamp }
```

### Availability Calculation Formula

```
availability(device_id, time_range) =
  (scans_where_device_found / total_scans_in_range) × 100

Where:
  - time_range = { start: Date, end: Date }
  - total_scans_in_range = COUNT(scans WHERE scan.timestamp BETWEEN start AND end)
  - scans_where_device_found = COUNT(scan_results WHERE device_id present
                                AND scan.timestamp BETWEEN start AND end)
```

If `total_scans_in_range` is 0, availability is reported as `null` (no data).

### Presence Timeline Data Model

```sql
-- Presence transitions table
CREATE TABLE presence_events (
  id          TEXT PRIMARY KEY,            -- UUID
  device_id   TEXT NOT NULL REFERENCES devices(id),
  from_status TEXT NOT NULL,               -- 'online', 'offline', 'unknown'
  to_status   TEXT NOT NULL,               -- 'online', 'offline'
  timestamp   TEXT NOT NULL,               -- ISO 8601
  scan_id     TEXT REFERENCES scans(id)    -- scan that triggered the transition
);

CREATE INDEX idx_presence_device_time ON presence_events(device_id, timestamp);
```

Device table additions:
```sql
ALTER TABLE devices ADD COLUMN first_seen     TEXT NOT NULL;  -- ISO 8601, immutable
ALTER TABLE devices ADD COLUMN last_seen      TEXT NOT NULL;  -- ISO 8601, updated each scan
ALTER TABLE devices ADD COLUMN status         TEXT NOT NULL DEFAULT 'unknown';  -- online/offline/unknown
ALTER TABLE devices ADD COLUMN missed_scans   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN offline_threshold INTEGER;     -- NULL = use global default
```

### Scan-Device Association

Each scan records which devices were found. This powers both presence detection and availability calculation:

```sql
CREATE TABLE scan_device_results (
  scan_id    TEXT NOT NULL REFERENCES scans(id),
  device_id  TEXT NOT NULL REFERENCES devices(id),
  ip_address TEXT NOT NULL,
  PRIMARY KEY (scan_id, device_id)
);
```

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Device behind intermittent firewall | May fluctuate between online/offline rapidly; the missed_scans threshold (default 2) dampens single-scan misses |
| Device responds only to certain scan types (e.g., ARP but not ICMP) | Presence is determined by ANY discovery method finding the device; combined scan results (F1.8) feed into presence |
| Scan fails or is aborted | Failed scans do NOT increment `missed_scans` — only completed scans count toward offline detection |
| Application restart mid-scan | On restart, `missed_scans` is recalculated from stored scan history rather than relying on in-memory counter |
| Device with randomized MAC re-appears with new MAC | If fingerprint matching (F2.4) links to existing device, presence continues seamlessly; if not, treated as a new device with its own timeline |
| Clock skew or NTP jump | Timestamps use monotonic scan sequence numbers for ordering; ISO timestamps are for display only |
| Very high scan frequency (every 1 min) | Timeline stores transitions only (not every scan hit), keeping storage bounded regardless of scan frequency |
| Device present on first scan only, then never again | Status transitions: `unknown` → remains `unknown` until offline_threshold is met → then `offline` |
| Offline threshold changed while device is being tracked | New threshold applies on next scan; `missed_scans` counter is not reset |

## Configuration

| Parameter | Env Var | Config Key | Default | Description |
|-----------|---------|------------|---------|-------------|
| Offline threshold | `PRESENCE_OFFLINE_THRESHOLD` | `presence.offline_threshold` | `2` | Number of missed scans before a device is marked offline |
| Default availability window | `PRESENCE_AVAILABILITY_WINDOW` | `presence.availability_window_hours` | `24` | Default time range (hours) for availability calculations |

## Dependencies

- **F1 (Discovery):** Scan results are the input signal for presence detection — a device is "seen" if any discovery method finds it.
- **F2 (Fingerprinting):** Device identity determines which presence timeline to update; MAC randomization handling (F2.3/F2.4) affects continuity.
- **F3 (Scheduled Scanning):** Scan frequency directly affects offline detection granularity and availability accuracy.
- **F4 (Storage):** Presence events, transition history, and scan-device associations persisted in SQLite.
- **F10 (Dashboard):** Presence status displayed on device list and detail views; timeline rendered as a visual chart.
- **F11 (REST API):** Presence data exposed via device endpoints and dedicated timeline endpoint.
