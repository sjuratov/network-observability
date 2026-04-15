# FRD: Data Export

## Feature ID
F12

## Overview
Enable users to export device inventory and scan result data in CSV and JSON formats, accessible via both the web dashboard (download button) and the REST API. Exports support date range filtering for historical data and use streaming for large datasets to avoid memory exhaustion.

## PRD References
- PRD Feature: F12 (Data Export)
- Related Features: F11 (REST API — export endpoints), F10 (Dashboard — export UI), F4 (Historical Data Storage — data source), F2 (Fingerprinting — device identity), F5 (Port Detection — port data in exports)

## User Stories

1. **US-12.1:** As a small business IT user, I want to export my device inventory as CSV so I can import it into a spreadsheet for compliance reporting.
2. **US-12.2:** As a developer, I want to export device data as JSON via the API so I can feed it into my monitoring pipeline.
3. **US-12.3:** As a small business IT user, I want to export scan results for a specific date range so I can produce monthly audit reports.
4. **US-12.4:** As a home network admin, I want to click a download button in the dashboard to get a device list without needing API knowledge.
5. **US-12.5:** As a developer, I want large exports to stream efficiently so that exporting 50K+ device records doesn't time out or crash the server.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F12.1 | Export device inventory as CSV via `GET /api/v1/export/devices?format=csv` | Must | |
| F12.2 | Export device inventory as JSON via `GET /api/v1/export/devices?format=json` | Must | |
| F12.3 | Export scan results as CSV via `GET /api/v1/export/scans?format=csv` | Must | |
| F12.4 | Export scan results as JSON via `GET /api/v1/export/scans?format=json` | Must | |
| F12.5 | Date range filtering via `from` and `to` query parameters (ISO 8601 dates) | Must | Applies to both device and scan exports |
| F12.6 | Dashboard "Export CSV" and "Export JSON" buttons on device list and scan history views | Must | Triggers browser download |
| F12.7 | CSV exports use streaming (chunked transfer encoding) for datasets >1000 rows | Must | Prevents memory exhaustion |
| F12.8 | JSON exports use buffered response for ≤10K items; streaming JSON array for >10K items | Should | Streaming uses newline-delimited JSON or JSON array with chunked writes |
| F12.9 | Export file naming convention: `{type}_{YYYY-MM-DD}_{HH-mm-ss}.{ext}` | Must | E.g., `devices_2024-06-15_14-30-00.csv` |
| F12.10 | Content-Disposition header set for browser downloads | Must | `attachment; filename="devices_2024-06-15_14-30-00.csv"` |
| F12.11 | Tag filter on device export: `?tag=IoT` exports only devices with that tag | Should | Reuses API filter params from F11 |
| F12.12 | Status filter on device export: `?status=online` exports only online devices | Should | |

### CSV Column Definitions

**Device Inventory Export (`/api/v1/export/devices?format=csv`):**

| Column | Description | Example |
|--------|-------------|---------|
| `id` | Internal device identifier | `d-a1b2c3` |
| `display_name` | User-assigned name or auto-detected hostname | `Living Room TV` |
| `mac_address` | MAC address | `AA:BB:CC:DD:EE:FF` |
| `current_ip` | Most recently observed IP address | `192.168.1.42` |
| `vendor` | OUI-derived manufacturer | `Samsung Electronics` |
| `hostname` | Network-reported hostname | `samsung-tv.local` |
| `status` | Online or Offline | `Online` |
| `tags` | Semicolon-separated list of tags | `Media;IoT` |
| `first_seen` | First discovery timestamp (ISO 8601 UTC) | `2024-01-15T08:30:00Z` |
| `last_seen` | Most recent observation (ISO 8601 UTC) | `2024-06-15T14:00:00Z` |
| `open_ports` | Semicolon-separated list of open ports with service | `22/ssh;80/http;443/https` |
| `notes` | User-assigned notes (double-quoted, newlines escaped) | `"Main media device"` |
| `is_known` | Whether device is marked as known | `true` |

**Scan Results Export (`/api/v1/export/scans?format=csv`):**

| Column | Description | Example |
|--------|-------------|---------|
| `scan_id` | Scan identifier | `s-x1y2z3` |
| `started_at` | Scan start time (ISO 8601 UTC) | `2024-06-15T14:00:00Z` |
| `completed_at` | Scan completion time (ISO 8601 UTC) | `2024-06-15T14:03:45Z` |
| `duration_seconds` | Scan duration in seconds | `225` |
| `status` | Scan status | `completed` |
| `devices_found` | Total devices discovered in this scan | `47` |
| `new_devices` | Devices seen for the first time | `2` |
| `device_mac` | MAC of a discovered device (one row per device per scan) | `AA:BB:CC:DD:EE:FF` |
| `device_ip` | IP observed during this scan | `192.168.1.42` |
| `device_name` | Display name at time of scan | `Living Room TV` |
| `device_status_change` | Change detected: `new`, `ip_changed`, `port_changed`, `returned_online`, or empty | `ip_changed` |

### JSON Structure

**Device Inventory JSON (`/api/v1/export/devices?format=json`):**
```json
{
  "exportedAt": "2024-06-15T14:30:00Z",
  "filters": { "from": null, "to": null, "tag": null, "status": null },
  "totalCount": 47,
  "devices": [
    {
      "id": "d-a1b2c3",
      "displayName": "Living Room TV",
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "currentIp": "192.168.1.42",
      "vendor": "Samsung Electronics",
      "hostname": "samsung-tv.local",
      "status": "online",
      "tags": ["Media", "IoT"],
      "firstSeen": "2024-01-15T08:30:00Z",
      "lastSeen": "2024-06-15T14:00:00Z",
      "openPorts": [
        { "port": 80, "protocol": "tcp", "service": "http" }
      ],
      "notes": "Main media device",
      "isKnown": true
    }
  ]
}
```

**Scan Results JSON (`/api/v1/export/scans?format=json`):**
```json
{
  "exportedAt": "2024-06-15T14:30:00Z",
  "filters": { "from": "2024-06-01", "to": "2024-06-15" },
  "totalCount": 30,
  "scans": [
    {
      "id": "s-x1y2z3",
      "startedAt": "2024-06-15T14:00:00Z",
      "completedAt": "2024-06-15T14:03:45Z",
      "durationSeconds": 225,
      "status": "completed",
      "devicesFound": 47,
      "newDevices": 2,
      "devices": [
        {
          "macAddress": "AA:BB:CC:DD:EE:FF",
          "ip": "192.168.1.42",
          "displayName": "Living Room TV",
          "statusChange": "ip_changed"
        }
      ]
    }
  ]
}
```

## Acceptance Criteria

### AC-12.1: Device CSV Export via API
- **Given** 50 devices exist in the system
- **When** `GET /api/v1/export/devices?format=csv` is called with a valid API key
- **Then** a CSV file is returned with all 50 devices, the correct columns, and `Content-Disposition` header with filename

### AC-12.2: Device JSON Export via API
- **Given** 50 devices exist in the system
- **When** `GET /api/v1/export/devices?format=json` is called with a valid API key
- **Then** a JSON response is returned with the export envelope including `exportedAt`, `totalCount: 50`, and all device objects

### AC-12.3: Scan Export with Date Range
- **Given** 100 scans exist from January through June 2024
- **When** `GET /api/v1/export/scans?format=csv&from=2024-03-01&to=2024-04-01` is called
- **Then** only scans with start times in March 2024 are included in the CSV

### AC-12.4: Dashboard Export Button
- **Given** the user is viewing the device list in the dashboard
- **When** the user clicks "Export CSV"
- **Then** a CSV file is downloaded to the browser with the currently visible (filtered) devices

### AC-12.5: Large Dataset Streaming
- **Given** 50,000 devices exist in the system
- **When** `GET /api/v1/export/devices?format=csv` is called
- **Then** the response streams using chunked transfer encoding without loading all rows into memory at once

### AC-12.6: Empty Result Set Export
- **Given** a date range filter that matches zero scans
- **When** `GET /api/v1/export/scans?format=csv&from=2099-01-01&to=2099-12-31` is called
- **Then** a CSV file is returned with only the header row and zero data rows

### AC-12.7: Export During Active Scan
- **Given** a scan is currently in progress
- **When** an export is requested
- **Then** the export proceeds using the latest completed data (does not include partial in-progress scan results)

## Technical Considerations
- CSV generation uses streaming writes — rows are flushed in chunks (e.g., every 100 rows) to the HTTP response using chunked transfer encoding. This prevents buffering the entire dataset in memory.
- JSON exports for datasets ≤10K items use standard `JSON.stringify` with a buffered response. For >10K items, use streaming JSON array writes (opening `[`, comma-separated objects, closing `]`).
- The export endpoints reuse the same database queries as the list API endpoints (F11) but bypass pagination — they iterate through the full result set.
- CSV values containing commas, quotes, or newlines are properly escaped per RFC 4180.
- The dashboard export buttons call the API export endpoints with the current filter parameters and any active API key. The browser handles the download via the `Content-Disposition` header.
- Export requests are subject to the same API key authentication as other endpoints.

## Edge Cases & Error Handling
| Scenario | Handling |
|----------|----------|
| Export during active scan | Export only completed data; exclude partial in-progress scan results |
| Empty result set (no matching data) | Return valid file with headers only (CSV) or empty array (JSON) |
| Very large exports (>100K rows) | Stream response; set no explicit Content-Length (chunked encoding). Log a warning for exports >100K rows. |
| Invalid date format in `from`/`to` | Return 400 VALIDATION_ERROR with message specifying expected ISO 8601 format |
| `from` date is after `to` date | Return 400 VALIDATION_ERROR with message indicating invalid range |
| Invalid `format` parameter | Return 400 VALIDATION_ERROR; supported values: `csv`, `json` |
| Export request times out (client disconnects mid-stream) | Server detects closed connection and stops streaming; log the interrupted export |
| Device notes contain CSV-special characters (commas, newlines, quotes) | Properly escape per RFC 4180 (double-quote wrapping, quote doubling) |
| Tags contain semicolons (CSV delimiter for multi-value) | Use semicolon as tag separator in CSV; document this in API docs |
| Concurrent export requests | Allow concurrent exports; each streams independently. No server-side file generation. |

## Configuration
| Parameter | Default | Description |
|-----------|---------|-------------|
| CSV streaming chunk size | 100 rows | Number of rows buffered before flushing to response |
| JSON streaming threshold | 10,000 items | Item count above which JSON exports switch to streaming |
| Max export rows (warning) | 100,000 | Log a warning when export exceeds this count |

## Dependencies
- **F11 (REST API):** Export endpoints are part of the API and use its authentication, error format, and routing infrastructure.
- **F10 (Dashboard):** Dashboard provides the UI trigger (export buttons) that calls the export API endpoints.
- **F4 (Historical Data Storage):** All exported data is queried from the embedded database.
- **F2 (Fingerprinting):** Device identity fields (MAC, vendor, hostname) are sourced from the fingerprinting engine.
- **F5 (Port & Service Detection):** Open ports column in device export sourced from port scan data.
- **F9 (Tagging & Naming):** Tags and notes columns in device export sourced from user metadata.
