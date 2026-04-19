# FRD: REST API

## Feature ID
F11

## Overview
Provide a RESTful API for programmatic access to all application data and operations, serving as the single data access layer for both the web dashboard (F10) and external integrations. The API uses URL-based versioning (`/api/v1/`), API key authentication, and consistent JSON response envelopes with pagination for all list endpoints.

## PRD References
- PRD Feature: F11 (REST API)
- Related Features: F10 (Dashboard — primary consumer), F12 (Data Export — export endpoints), F1 (Discovery — scan trigger), F2 (Fingerprinting — device identity), F3 (Scheduling — scan management), F4 (Storage — data source), F5 (Port Detection — port data), F8 (Presence — device status), F9 (Tagging — device metadata), F13 (Configuration — API key), F14 (Settings UI — config management endpoints)

## User Stories

1. **US-11.1:** As a developer, I want a well-documented RESTful API so I can integrate network observability data into my monitoring scripts and dashboards.
2. **US-11.2:** As a small business IT user, I want to trigger scans and retrieve device data via API so I can automate inventory reporting.
3. **US-11.3:** As a security-conscious user, I want the API to require authentication so that unauthorized users cannot access my network data.
4. **US-11.4:** As a developer, I want consistent error responses so I can handle failures programmatically without parsing HTML or guessing error formats.
5. **US-11.5:** As a small business IT user, I want to paginate through large device lists so I can process data in manageable chunks.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F11.1 | URL-based API versioning: all endpoints under `/api/v1/` | Must | Future versions at `/api/v2/` etc. |
| F11.2 | API key authentication via `X-API-Key` header on all endpoints except `/api/v1/docs` | Must | 401 for missing/invalid key |
| F11.3 | Consistent JSON response envelope for all responses | Must | See Response Format below |
| F11.4 | Cursor-based pagination for all list endpoints | Must | `cursor` and `limit` query params |
| F11.5 | `GET /api/v1/devices` — list all devices with pagination, filtering, sorting | Must | |
| F11.6 | `GET /api/v1/devices/:id` — get single device with full detail | Must | |
| F11.7 | `PATCH /api/v1/devices/:id` — update device display name, tags, notes, known flag | Must | No create/delete of discovered devices |
| F11.8 | `POST /api/v1/devices/:id/merge` — merge two device identities | Must | Request body: `{ "mergeWithDeviceId": "..." }` |
| F11.9 | `POST /api/v1/devices/:id/split` — split a merged device identity | Must | |
| F11.10 | `GET /api/v1/devices/:id/history` — get device history (IP changes, port changes, presence) | Must | Supports date range filter |
| F11.11 | `GET /api/v1/tags` — list all tags with device counts | Must | |
| F11.12 | `POST /api/v1/tags` — create a new tag | Must | |
| F11.13 | `DELETE /api/v1/tags/:id` — delete a tag (removes from all devices) | Must | |
| F11.14 | `GET /api/v1/scans` — list scan history with pagination and date range filter | Must | |
| F11.15 | `GET /api/v1/scans/:id` — get scan detail with device results | Must | |
| F11.16 | `POST /api/v1/scans` — trigger a manual scan | Must | Returns scan ID; 409 if scan already running |
| F11.17 | `GET /api/v1/scans/current` — get current scan status (or null if idle) | Must | Used for progress polling |
| F11.18 | `GET /api/v1/stats/overview` — get dashboard overview metrics | Must | Total devices, new (24h), offline, last scan |
| F11.19 | `GET /api/v1/stats/charts/device-count` — get device count over time series | Should | Query param: `range` (7d, 30d, 90d, 1y) |
| F11.20 | `GET /api/v1/stats/charts/device-types` — get device type/vendor breakdown | Should | Returns label/count pairs |
| F11.21 | `GET /api/v1/export/devices` — export devices in CSV or JSON | Must | Query param: `format=csv|json` |
| F11.22 | `GET /api/v1/export/scans` — export scan results in CSV or JSON | Must | Query params: `format`, `from`, `to` |
| F11.23 | `GET /api/v1/docs` — serve OpenAPI/Swagger documentation UI | Must | No authentication required |
| F11.24 | OpenAPI 3.0 specification auto-generated from route definitions | Must | Spec available at `/api/v1/docs/openapi.json` |
| F11.25 | Rate limiting: 100 requests per minute per API key | Should | 429 Too Many Requests when exceeded |

### Response Format

**Success (single item):**
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

**Success (list):**
```json
{
  "data": [ ... ],
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "pagination": {
      "limit": 50,
      "nextCursor": "eyJpZCI6MTAwfQ==",
      "prevCursor": "eyJpZCI6NTB9",
      "hasMore": true,
      "totalCount": 250
    }
  }
}
```

**Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": [
      { "field": "from", "message": "Invalid date format. Use ISO 8601." }
    ]
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Error Codes

| HTTP Status | Error Code | When |
|-------------|------------|------|
| 400 | `VALIDATION_ERROR` | Invalid query params, malformed body |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | Device, scan, or tag not found |
| 409 | `CONFLICT` | Scan already in progress (POST /scans), merge conflict |
| 422 | `UNPROCESSABLE_ENTITY` | Valid JSON but semantically invalid (e.g., merge device with itself) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Filtering & Sorting (Device List)

| Query Param | Type | Description | Example |
|-------------|------|-------------|---------|
| `search` | string | Full-text search across name, MAC, IP, hostname, vendor, tags | `?search=printer` |
| `tag` | string | Filter by tag name (repeatable for OR logic) | `?tag=IoT&tag=Critical` |
| `status` | string | Filter by online/offline | `?status=online` |
| `vendor` | string | Filter by vendor name (partial match) | `?vendor=Apple` |
| `firstSeenFrom` | ISO date | Devices first seen after this date | `?firstSeenFrom=2024-01-01` |
| `firstSeenTo` | ISO date | Devices first seen before this date | `?firstSeenTo=2024-06-01` |
| `sort` | string | Sort field | `?sort=lastSeen` |
| `order` | string | Sort direction: `asc` or `desc` (default: `desc`) | `?order=asc` |
| `limit` | integer | Page size (default: 50, max: 200) | `?limit=100` |
| `cursor` | string | Pagination cursor from previous response | `?cursor=eyJpZCI6MTAwfQ==` |

## Acceptance Criteria

### AC-11.1: Authenticated Device List
- **Given** a valid API key in the `X-API-Key` header
- **When** `GET /api/v1/devices` is called
- **Then** a paginated JSON list of devices is returned with the standard response envelope

### AC-11.2: Unauthorized Access Rejected
- **Given** no API key or an invalid API key
- **When** any API endpoint (except `/api/v1/docs`) is called
- **Then** a 401 response with error code `UNAUTHORIZED` is returned

### AC-11.3: Manual Scan Trigger
- **Given** a valid API key and no scan is currently running
- **When** `POST /api/v1/scans` is called
- **Then** a manual scan is triggered and the response contains the scan ID with status `in-progress`

### AC-11.4: Concurrent Scan Prevention
- **Given** a scan is already in progress
- **When** `POST /api/v1/scans` is called
- **Then** a 409 response with error code `CONFLICT` is returned with a message indicating a scan is already running

### AC-11.5: Date Range Filtering on Scans
- **Given** 20 scans exist spanning January through June 2024
- **When** `GET /api/v1/scans?from=2024-03-01&to=2024-04-01` is called
- **Then** only scans with start times within March 2024 are returned

### AC-11.6: Device Update
- **Given** a device with ID "abc-123" exists
- **When** `PATCH /api/v1/devices/abc-123` is called with `{ "displayName": "Living Room TV", "tags": ["Media", "IoT"] }`
- **Then** the device is updated and the response contains the updated device data

### AC-11.7: OpenAPI Documentation Accessible
- **Given** the API is running
- **When** `GET /api/v1/docs` is accessed (with or without API key)
- **Then** the Swagger UI is served with the full API specification

### AC-11.8: Cursor-Based Pagination
- **Given** 150 devices exist and default limit is 50
- **When** `GET /api/v1/devices` is called
- **Then** the response contains 50 devices, `hasMore: true`, and a `nextCursor` value
- **When** `GET /api/v1/devices?cursor={nextCursor}` is called
- **Then** the next 50 devices are returned

### AC-11.9: Consistent Error Format
- **Given** any error occurs (400, 401, 404, 409, 422, 429, 500)
- **When** the error response is returned
- **Then** it follows the standard error envelope with `code`, `message`, and optional `details`

## Technical Considerations
- The API is built with Express.js (or similar Node.js framework) and serves both the REST API and the static dashboard files.
- Cursor-based pagination is preferred over offset-based to avoid issues with shifting data during active scans. Cursors are base64-encoded JSON containing the sort field value and ID.
- OpenAPI spec is auto-generated from route definitions using a library such as `swagger-jsdoc` or route-level decorators. The spec is regenerated on server startup.
- API key is auto-generated on first run and stored in the database. The key can be viewed via a dedicated endpoint or CLI command.
- Rate limiting is implemented per API key using an in-memory sliding window counter. Resets on server restart (acceptable for single-instance deployment).
- All timestamps in request/response are ISO 8601 UTC strings.

## Edge Cases & Error Handling
| Scenario | Handling |
|----------|----------|
| Concurrent scan trigger (POST /scans while scan running) | Return 409 Conflict with scan ID of the running scan |
| Invalid filter values (e.g., `?status=maybe`) | Return 400 with VALIDATION_ERROR listing the invalid field |
| Invalid cursor (expired or tampered) | Return 400 with VALIDATION_ERROR; client should restart pagination |
| Large export request (>10K devices) | Stream response for CSV; paginate for JSON (see F12) |
| Device not found (invalid ID) | Return 404 NOT_FOUND |
| Merge device with itself | Return 422 UNPROCESSABLE_ENTITY |
| Merge device that was already merged | Return 409 CONFLICT |
| Request body exceeds size limit | Return 400; max body size: 1MB |
| Database locked during write | Retry with exponential backoff (3 attempts), then 500 |

## Configuration
| Parameter | Default | Description |
|-----------|---------|-------------|
| API key | Auto-generated on first run | Authentication key for API access (from F13) |
| Rate limit | 100 req/min | Maximum requests per minute per API key |
| Default page size | 50 | Default `limit` for paginated endpoints |
| Max page size | 200 | Maximum allowed `limit` value |
| Request body max size | 1MB | Maximum request body size |

## Dependencies
- **F4 (Historical Data Storage):** All data is read from and written to the embedded database.
- **F3 (Scheduled Scanning):** Scan trigger and status endpoints interact with the scan scheduler.
- **F2 (Fingerprinting):** Device identity model, merge/split operations use the fingerprinting engine.
- **F9 (Tagging & Naming):** Tag CRUD and device metadata updates.
- **F8 (Presence Tracking):** Device status (online/offline) and presence data for history endpoints.
- **F5 (Port & Service Detection):** Port and service data included in device detail and history.
- **F13 (Configuration):** API key management and server port configuration.
- **F14 (Settings UI):** Runtime config management endpoints: `GET /api/v1/config`, `PATCH /api/v1/config`, `GET /api/v1/config/api-key`, `GET /api/v1/config/subnets`, `POST /api/v1/config/test-webhook`, `POST /api/v1/config/test-email`, `POST /api/v1/config/regenerate-key`. See `specs/frd-settings-ui.md` for full API contract.
