# FRD: Dashboard & Visualization

## Feature ID
F10

## Overview
Provide a web-based dashboard for viewing network status, device inventory, scan history, and historical trends. The dashboard is the primary interface for all user personas — from casual home network admins checking device counts to security-conscious users drilling into port change histories. It consumes data exclusively through the REST API (F11).

## PRD References
- PRD Feature: F10 (Dashboard & Visualization)
- Related Features: F11 (REST API — data source), F9 (Tagging & Naming — device metadata), F8 (Presence Tracking — timeline data), F5 (Port & Service Detection — port history), F2 (Fingerprinting — device identity), F3 (Scheduled Scanning — scan status), F4 (Historical Data Storage — retention-aware queries)

## User Stories

1. **US-10.1:** As a home network admin, I want to see an overview of my network at a glance so I can quickly tell how many devices are connected and whether anything new has appeared.
2. **US-10.2:** As a small business IT user, I want to search, filter, and sort my device list so I can quickly find specific devices by name, tag, vendor, or status.
3. **US-10.3:** As a security-conscious user, I want to view a device's full history (IPs, ports, presence) so I can investigate suspicious changes.
4. **US-10.4:** As a home network admin, I want to see scan history with expandable results so I can understand what was discovered in each scan.
5. **US-10.5:** As a small business IT user, I want charts showing device count over time and device type breakdown so I can track network growth trends.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F10.1 | Overview dashboard displays metric cards in order: Total Devices, New (24h), Online, Offline, Last Scan (timestamp and status) | Must | 5 cards in a single row; Online = totalDevices − offlineDevices; cards link to filtered views |
| F10.2 | Device list view with full-text search across name, MAC, IP, hostname, vendor, tags | Must | Search is client-side for datasets ≤500 devices |
| F10.3 | Device list supports filtering by: tag, online/offline status, vendor, first-seen date range | Must | Filters are combinable (AND logic) |
| F10.4 | Device list supports sorting by: name, IP, vendor, first-seen, last-seen, status | Must | Default sort: IP address ascending; user-selected sort persists when returning from device detail |
| F10.5 | Device detail view — Identity section: display name, MAC, vendor (OUI), all hostnames, fingerprint confidence, known/unknown flag | Must | |
| F10.6 | Device detail view — IP History section: table of all IPs used, with first-seen and last-seen per IP | Must | Sorted by last-seen descending |
| F10.7 | Device detail view — Port History section: current open ports with services, and a changelog of port opens/closes with timestamps | Must | |
| F10.8 | Device detail view — Presence Timeline: visual timeline or chart showing online/offline periods over a selectable date range | Should | Default range: last 30 days |
| F10.9 | Device detail view — Tags & Notes section: display and edit tags, display and edit freeform notes | Must | Inline editing, auto-save |
| F10.10 | Scan history view: paginated list of past scans showing start time, duration, devices found, new devices, errors | Must | |
| F10.11 | Scan history: expandable row showing per-scan device list with status changes detected | Must | |
| F10.12 | Device Breakdown chart: full-width horizontal bar chart with a dropdown selector. Dropdown options: Vendor (default), Tag, Status, Discovery Method, Device Age, Known/Unknown. Bars sorted descending by count. | Must | Replaces previous pie chart and device trend. Data computed client-side from device list. Device Age buckets: <1 day, 1–7 days, 7–30 days, 30+ days. |
| F10.13 | Responsive layout: desktop (≥1024px), tablet (768–1023px) | Must | No mobile-first requirement; tablet is minimum |
| F10.14 | Scan progress indicator: show real-time progress when a scan is in progress | Should | Poll GET /api/scans/current every 5 seconds during active scan |
| F10.15 | Manual scan trigger button on dashboard with confirmation | Must | Calls POST /api/scans; disabled while scan is in progress |
| F10.16 | Empty state handling: meaningful placeholder content when no devices or scans exist yet | Must | Guide user to trigger first scan |
| F10.17 | Device list pagination: client-side for ≤500 devices, server-side pagination via API for >500 | Should | Threshold configurable |

## Acceptance Criteria

### AC-10.1: Overview Dashboard Loads with Correct Metrics
- **Given** 50 devices are discovered and 3 are new in the last 24 hours and 5 are offline
- **When** the dashboard overview loads
- **Then** the metric cards display "50 Total Devices", "3 New (24h)", "45 Online", "5 Offline", and the last scan timestamp with status
- **And** the cards appear in order: Total Devices, New (24h), Online, Offline, Last Scan

### AC-10.2: Device Search Returns Matching Results
- **Given** a device list containing a device named "Office Printer" with vendor "HP" and tag "Printer"
- **When** the user types "printer" in the search box
- **Then** the device appears in filtered results (matching on name, vendor, or tag)

### AC-10.3: Device List Filtering by Tag and Status
- **Given** 50 devices with various tags and online/offline statuses
- **When** the user selects tag filter "IoT" AND status filter "Online"
- **Then** only devices that are both tagged "IoT" and currently online are shown

### AC-10.4: Device Detail Shows Full History
- **Given** a device that has used IPs 192.168.1.10, 192.168.1.25, and 192.168.1.42 over time
- **When** the user navigates to the device detail view
- **Then** the IP History section shows all three IPs with their first-seen and last-seen dates

### AC-10.5: Scan History is Expandable
- **Given** 10 completed scans in scan history
- **When** the user clicks on a scan row
- **Then** the row expands to show the list of devices found in that scan with any status changes

### AC-10.6: Responsive Layout on Tablet
- **Given** the dashboard is accessed from a tablet browser (768px–1023px width)
- **When** any page loads
- **Then** the layout adapts with no horizontal scrolling, stacking cards vertically as needed

### AC-10.7: Empty State Guidance
- **Given** the application has just been started with no scans run yet
- **When** the dashboard loads
- **Then** a friendly empty state is shown with a prompt to run the first scan

### AC-10.8: Scan Progress Polling
- **Given** a scan is in progress
- **When** the dashboard is open
- **Then** a progress indicator is visible and updates every 5 seconds until the scan completes

### AC-10.9: Manual Scan Trigger
- **Given** no scan is currently running
- **When** the user clicks "Scan Now" and confirms
- **Then** a scan is triggered via the API and the progress indicator appears

### AC-10.10: Device Breakdown Chart Defaults to Vendor View
- **Given** devices exist with various vendors
- **When** the dashboard loads
- **Then** a "Device Breakdown" section is displayed with a dropdown defaulting to "By Vendor"
- **And** a horizontal bar chart shows vendor names on the left, bars proportional to count, and counts on the right
- **And** bars are sorted in descending order by device count

### AC-10.11: Device Breakdown Dropdown Switches View
- **Given** the dashboard is loaded with the Device Breakdown chart visible
- **When** the user selects "By Tag" from the dropdown
- **Then** the bar chart updates to show device counts grouped by tag, sorted descending
- **When** the user selects "By Status" from the dropdown
- **Then** the bar chart updates to show device counts grouped by online/offline status

### AC-10.12: Device Breakdown Supports All Groupings
- **Given** devices exist with various attributes
- **When** the user cycles through all dropdown options: Vendor, Tag, Status, Discovery Method, Device Age, Known/Unknown
- **Then** each selection renders a valid bar chart with appropriate labels and counts
- **And** Device Age uses buckets: "< 1 day", "1–7 days", "7–30 days", "30+ days"
- **And** Known/Unknown groups by the device's isKnown flag

### AC-10.13: Network Summary and Device Trend Are Removed
- **Given** the dashboard overview loads
- **Then** there is no "Network Summary" card
- **And** there is no "Device Trend" line chart

## Technical Considerations
- The dashboard is a client-side web application served by the same container as the API.
- All data is fetched from the REST API (F11) — the dashboard has no direct database access.
- Polling (not WebSocket) is used for scan progress updates to keep infrastructure simple. Poll interval: 5 seconds during active scan, no polling when idle.
- Charts use Recharts (lightweight React charting library). The Device Breakdown bar chart is computed client-side from the device list. No server-side aggregation needed for the breakdown chart.
- Device list search and filtering is client-side for datasets up to 500 devices. For larger datasets, search/filter parameters are sent to the API for server-side processing.
- Timestamps are stored in UTC and displayed in the user's local timezone.

## Edge Cases & Error Handling
| Scenario | Handling |
|----------|----------|
| No devices discovered yet (empty state) | Show a welcome message with "Run your first scan" call-to-action |
| Very long device history (>100 IP changes) | Paginate IP history table; show most recent 20 with "Load more" |
| Large number of devices (500+) | Switch to server-side pagination, search, and filtering via API query params |
| Scan in progress when dashboard loads | Detect active scan from API and show progress indicator immediately |
| API unreachable | Show a connection error banner at the top of the page with retry option |
| Concurrent scan trigger attempt | Disable "Scan Now" button while scan is active; if API returns 409 Conflict, show message |
| Device with no hostname or vendor | Display MAC address as primary identifier; show "Unknown" for missing fields |
| Very long notes field | Truncate display to 500 characters with "Show more" toggle |

## Configuration
| Parameter | Default | Description |
|-----------|---------|-------------|
| Web UI port | `8080` | Port the dashboard is served on (from F13) |
| Polling interval (scan progress) | `5000` ms | How often to poll for scan status during active scan |
| Device list page size | `50` | Number of devices per page in list view |
| Chart default time range | `30` days | Default time range for time-series charts |

## Dependencies
- **F11 (REST API):** All dashboard data is fetched from the API. The dashboard cannot function without the API.
- **F9 (Tagging & Naming):** Device detail view displays and edits tags/notes via API.
- **F8 (Presence Tracking):** Presence timeline visualization requires historical presence data from API.
- **F5 (Port & Service Detection):** Port history section requires port change data from API.
- **F3 (Scheduled Scanning):** Scan status and manual trigger depend on the scan management API endpoints.
- **F4 (Historical Data Storage):** Chart data and history views are bounded by the configured retention period.
