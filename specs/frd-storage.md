# FRD: Historical Data Storage

## Feature ID
F4

## Overview
Persist all network scan results and device state changes in an embedded SQLite database with configurable retention policies. The storage layer serves as the backbone for the entire application — every feature that displays, queries, or exports data depends on it. It must handle high-frequency scanning scenarios (every 15 minutes) without performance degradation and ensure data durability across container restarts via Docker volume mounting.

## PRD References
- PRD Feature: F4 (Historical Data Storage)
- Related Features: F1 (Discovery — produces scan results to store), F2 (Fingerprinting — device identity records), F3 (Scheduler — scan frequency drives data volume), F5 (Port Detection — port state stored per scan), F6 (DNS Resolution — cached name resolutions), F8 (Presence Tracking — online/offline derived from stored scans), F10 (Dashboard — reads stored data), F11 (REST API — queries stored data), F12 (Data Export — exports stored data)

## User Stories

1. **As a home network admin**, I want all scan results stored with timestamps so that I can look back and see what devices were on my network at any point in time.
2. **As a small business IT admin**, I want configurable data retention so that I can comply with data management policies without manually purging old records.
3. **As a security-conscious user**, I want device state changes (IP changes, new ports, hostname changes) tracked so that I can investigate suspicious changes retroactively.
4. **As a user running high-frequency scans**, I want the database to handle frequent writes without degrading query performance so that the dashboard remains responsive.
5. **As an operator**, I want the database to survive container restarts and unexpected shutdowns without data loss so that I don't have to re-scan from scratch.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F4.1 | Store all scan results with timestamps (start time, end time, devices found, errors) | Must | Each scan creates a `scans` record |
| F4.2 | Configurable data retention period (default: 1 year, minimum: 1 day) | Must | Configured via `DATA_RETENTION_DAYS` env var |
| F4.3 | Automatic cleanup of data beyond the retention period | Must | Runs after each scan completes and on application startup |
| F4.4 | Track device state changes over time (IP, ports, hostname, online/offline transitions) | Must | Diff consecutive scan results per device; store only deltas |
| F4.5 | Use SQLite as the embedded database with no external dependencies | Must | Single file, WAL mode enabled |
| F4.6 | Handle high-frequency scanning (every 15 minutes) without performance degradation | Should | Indexing strategy, periodic VACUUM |
| F4.7 | Support schema migrations for future upgrades | Should | Versioned migration files applied on startup |
| F4.8 | Database file stored in a configurable path for Docker volume mounting | Must | Default: `/data/network-observability.db` |
| F4.9 | Record per-device per-scan snapshots linking devices to scan results | Must | Captures the state of each device at each scan point |
| F4.10 | Provide database health metrics (size, row counts, last vacuum) | Should | Exposed via `GET /api/v1/db/stats` |
| F4.11 | Provide an on-demand manual cleanup endpoint | Should | `POST /api/v1/db/cleanup` with `keepDays` parameter. Deletes temporal data (scans, scan_results, device_history) older than N days. `keepDays: 0` deletes all temporal data. Preserves devices, device_tags, runtime_config, schema_migrations. |
| F4.12 | Provide a factory reset endpoint | Should | `POST /api/v1/db/factory-reset` wipes ALL user data (devices, device_tags, scans, scan_results, device_history). Preserves only runtime_config and schema_migrations. Requires confirmation parameter. |

## Acceptance Criteria

### AC-1: Retention Cleanup
- **Given** a retention period of 6 months is configured
- **When** the retention cleanup job runs
- **Then** all scan results, scan_results snapshots, and device_history entries older than 6 months are deleted
- **And** device records themselves are NOT deleted (devices are permanent identities)
- **And** the cleanup operation completes without locking the database for reads

### AC-2: Device State Change Tracking
- **Given** a device had IP 192.168.1.50 in the previous scan
- **When** the next scan discovers the same device (same MAC) at 192.168.1.75
- **Then** a `device_history` record is created with `field=ip`, `old_value=192.168.1.50`, `new_value=192.168.1.75`, and the scan timestamp
- **And** the device's current IP is updated to 192.168.1.75

### AC-3: High-Frequency Write Performance
- **Given** scanning is configured to run every 15 minutes on a /24 subnet with ~100 devices
- **When** the system has been running for 30 days (~2,880 scans, ~288,000 scan_result rows)
- **Then** inserting a new scan's results completes in under 2 seconds
- **And** querying the device list with latest state completes in under 500ms

### AC-4: Database Durability
- **Given** the application is writing scan results to the database
- **When** the container is unexpectedly killed (SIGKILL)
- **Then** the database is not corrupted on restart (WAL mode ensures crash recovery)
- **And** the most recent fully committed scan is intact

### AC-5: Startup Initialization
- **Given** the application starts for the first time with no existing database
- **When** the startup sequence runs
- **Then** the database file is created at the configured path
- **And** all tables are created via the migration system
- **And** WAL mode is enabled
- **And** no errors are logged

### AC-6: Docker Volume Persistence
- **Given** the database is stored at `/data/network-observability.db`
- **When** the Docker container is stopped and restarted with the same volume mount
- **Then** all previously stored data is intact and queryable

### AC-7: Database Statistics Endpoint (F4.10)
- **Given** the application is running with data in the database
- **When** a GET request is made to `/api/v1/db/stats` with a valid API key
- **Then** the response contains row counts for each table (devices, scans, scan_results, device_history, device_tags)
- **And** the response contains the database file size in bytes
- **And** the response contains the WAL file size in bytes
- **And** the response contains the configured retention period in days
- **And** the response contains the timestamp of the last retention cleanup (or null if never run)

### AC-8: Manual Cleanup Endpoint (F4.11)
- **Given** the application is running with expired data in the database
- **When** a POST request is made to `/api/v1/db/cleanup` with `{ "keepDays": 7 }`
- **Then** all scans, scan_results, and device_history older than 7 days are deleted
- **And** scans, scan_results, and device_history from the last 7 days are preserved
- **And** device records are NOT deleted (permanent identities)
- **And** device_tags are NOT deleted (user configuration)
- **And** the response contains counts of deleted rows and duration in milliseconds

### AC-9: Manual Cleanup Delete All Temporal Data (F4.11)
- **Given** the application is running with data in the database
- **When** a POST request is made to `/api/v1/db/cleanup` with `{ "keepDays": 0 }`
- **Then** all scans, scan_results, and device_history are deleted
- **And** device records are preserved
- **And** device_tags are preserved

### AC-10: Manual Cleanup Validation (F4.11)
- **Given** a POST request is made to `/api/v1/db/cleanup`
- **When** the request body contains an invalid keepDays value (negative or non-integer)
- **Then** the response is 400 with error code `VALIDATION_ERROR`
- **And** no data is deleted

### AC-11: Factory Reset (F4.12)
- **Given** the application is running with devices, scans, and tags in the database
- **When** a POST request is made to `/api/v1/db/factory-reset` with `{ "confirm": true }`
- **Then** all rows from devices, device_tags, scans, scan_results, and device_history are deleted
- **And** runtime_config is preserved
- **And** schema_migrations is preserved
- **And** the response confirms the reset with row counts deleted per table

### AC-12: Factory Reset Requires Confirmation (F4.12)
- **Given** a POST request is made to `/api/v1/db/factory-reset`
- **When** the request body is missing or `confirm` is not `true`
- **Then** the response is 400 with error code `VALIDATION_ERROR`
- **And** no data is deleted

## Technical Considerations

### Database Schema

```sql
-- Core tables
CREATE TABLE devices (
    id TEXT PRIMARY KEY,              -- UUID
    mac_address TEXT NOT NULL UNIQUE,
    display_name TEXT,                -- User-assigned name
    hostname TEXT,                    -- Discovered hostname
    vendor TEXT,                      -- OUI vendor lookup result
    first_seen_at TEXT NOT NULL,      -- ISO 8601 timestamp
    last_seen_at TEXT NOT NULL,       -- ISO 8601 timestamp
    is_online INTEGER DEFAULT 1,     -- 0=offline, 1=online
    is_known INTEGER DEFAULT 0,      -- 0=unknown, 1=marked known (suppresses alerts)
    fingerprint_data TEXT,           -- JSON blob of composite fingerprint signals
    notes TEXT,                       -- User notes
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE scans (
    id TEXT PRIMARY KEY,              -- UUID
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',  -- pending, in_progress, completed, failed
    subnets_scanned TEXT,            -- JSON array of scanned subnets
    devices_found INTEGER DEFAULT 0,
    new_devices INTEGER DEFAULT 0,
    errors TEXT,                      -- JSON array of error messages
    scan_type TEXT DEFAULT 'scheduled', -- scheduled, manual
    intensity TEXT DEFAULT 'normal'    -- quick, normal, thorough
);

CREATE TABLE scan_results (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES devices(id),
    ip_address TEXT NOT NULL,
    mac_address TEXT NOT NULL,
    hostname TEXT,
    open_ports TEXT,                  -- JSON array of {port, protocol, service, version}
    dns_names TEXT,                   -- JSON array of resolved names
    mdns_names TEXT,                  -- JSON array of mDNS names
    ssdp_info TEXT,                   -- JSON blob of SSDP/UPnP data
    response_time_ms INTEGER,
    discovered_via TEXT,             -- JSON array: ["arp", "icmp", "tcp_syn"]
    created_at TEXT NOT NULL
);

CREATE TABLE device_history (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    field TEXT NOT NULL,             -- ip, hostname, ports, status, vendor
    old_value TEXT,
    new_value TEXT,
    changed_at TEXT NOT NULL
);

CREATE TABLE device_tags (
    device_id TEXT NOT NULL REFERENCES devices(id),
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (device_id, tag)
);

CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT
);
```

### SQLite Configuration
- **WAL mode**: Enabled on every connection open (`PRAGMA journal_mode=WAL`) for crash safety and concurrent read/write
- **Foreign keys**: Enabled (`PRAGMA foreign_keys=ON`)
- **Busy timeout**: Set to 5000ms (`PRAGMA busy_timeout=5000`) to handle concurrent access
- **Synchronous**: Set to NORMAL (`PRAGMA synchronous=NORMAL`) for a balance of durability and performance
- **Cache size**: Set to 10MB (`PRAGMA cache_size=-10000`)

### Indexing Strategy
```sql
CREATE INDEX idx_scan_results_scan_id ON scan_results(scan_id);
CREATE INDEX idx_scan_results_device_id ON scan_results(device_id);
CREATE INDEX idx_device_history_device_id ON device_history(device_id);
CREATE INDEX idx_device_history_changed_at ON device_history(changed_at);
CREATE INDEX idx_scans_started_at ON scans(started_at);
CREATE INDEX idx_scans_status ON scans(status);
CREATE INDEX idx_devices_mac_address ON devices(mac_address);
CREATE INDEX idx_devices_is_online ON devices(is_online);
```

### Data Volume Estimates

| Scan Frequency | Devices | Scans/Year | scan_results Rows/Year | Est. DB Size |
|----------------|---------|------------|------------------------|--------------|
| Every 6 hours (default) | 50 | 1,460 | 73,000 | ~50 MB |
| Every 1 hour | 50 | 8,760 | 438,000 | ~300 MB |
| Every 15 minutes | 50 | 35,040 | 1,752,000 | ~1.2 GB |
| Every 15 minutes | 200 | 35,040 | 7,008,000 | ~4.5 GB |

### Retention Cleanup Strategy
1. Runs automatically after each scan completes (non-blocking, in a background task)
2. Also runs once on application startup
3. Deletes in batches of 1,000 rows to avoid long-running transactions
4. Deletion order: `device_history` → `scan_results` → `scans` (respects FK cascade)
5. A `PRAGMA incremental_vacuum` runs after cleanup if >20% of pages are free

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Database file corruption | On startup, run `PRAGMA integrity_check`. If it fails, log an error, rename the corrupted file to `*.corrupt.{timestamp}`, and create a fresh database. Alert the user via logs. |
| Disk space exhaustion | Before each scan write, check available disk space. If below a configurable threshold (default: 100MB), skip the scan write, log a warning, and trigger an early retention cleanup. |
| Concurrent scan writes | SQLite WAL mode supports one writer + many readers. The busy timeout (5s) handles brief contention. If a write still fails after timeout, retry once then log the error. |
| Schema migration failure | If a migration fails mid-way, roll back the transaction. The `schema_migrations` table only records successfully applied versions. Log the error and exit with a non-zero code. |
| Large retention cleanup | Batch deletions (1,000 rows per transaction) to avoid locking the database for extended periods. Yield between batches to allow other operations. |
| Time zone handling | All timestamps stored as ISO 8601 UTC strings. Conversion to local time happens only in the presentation layer. |
| Container restart during write | WAL mode ensures atomic commits. Incomplete transactions are rolled back on recovery. |

## Configuration

| Parameter | Env Var | Default | Description |
|-----------|---------|---------|-------------|
| Database path | `DB_PATH` | `/data/network-observability.db` | Path to the SQLite database file |
| Retention period | `DATA_RETENTION_DAYS` | `365` | Days to keep historical data (min: 30) |
| Disk space threshold | `DB_MIN_DISK_MB` | `100` | Minimum free disk space in MB before skipping writes |
| Auto-vacuum | `DB_AUTO_VACUUM` | `true` | Run incremental vacuum after retention cleanup |
| Migration directory | `DB_MIGRATIONS_PATH` | `./migrations` | Path to schema migration SQL files |

## Dependencies

- **SQLite3**: Embedded database engine (via `better-sqlite3` or `sql.js` npm package)
- **uuid**: For generating primary key UUIDs
- **F1 (Discovery)**: Produces the raw device data that gets stored
- **F2 (Fingerprinting)**: Provides the device identity (MAC-based) for linking scan results to devices
- **F3 (Scheduler)**: Determines scan frequency, which drives data volume
- **F5 (Port Detection)**: Port scan results stored in `scan_results.open_ports`
- **F6 (DNS Resolution)**: Name resolution results stored in `scan_results.dns_names`, `mdns_names`, `ssdp_info`
