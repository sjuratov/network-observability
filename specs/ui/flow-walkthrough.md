# Flow Walkthrough — NetObserver

> **Purpose:** Source of truth for E2E test generation. Each flow describes a complete user journey with specific `data-testid` selectors and expected system responses.
>
> **Consumed by:** E2E Generation (Playwright specs + POMs), Gherkin (scenario context)

---

## Flow 1: First-Run Experience

**Starting screen:** Dashboard Overview
**Ending screen:** Device List (populated)
**Preconditions:** Fresh install — no scans have been run, no devices discovered, database is empty.

1. User navigates to the application root URL.
2. System renders the Dashboard Overview with `nav-header` visible.
3. System displays `empty-state` with title "No Devices Yet" and message guiding the user to run their first scan.
4. User clicks `empty-state-action` ("Run Your First Scan") button.
5. System shows `confirm-dialog` asking "Start a network scan?" with confirm/cancel options.
6. User clicks `confirm-dialog-confirm`.
7. System triggers `POST /api/v1/scans` and displays `scan-progress-bar` with status "Scanning…".
8. System polls `GET /api/v1/scans/current` every 5 seconds, updating `scan-progress-bar-percentage` and `scan-progress-bar-fill`.
9. Scan completes — `scan-progress-bar` shows 100% briefly, then hides.
10. System refreshes metric cards: `metric-card-total-devices-value` shows the count of discovered devices, `metric-card-new-devices-value` shows the same count (all are new).
11. User clicks `nav-header-link-devices` to navigate to the Device List.
12. System displays `device-table` populated with the discovered devices. Each device appears as a `device-row-{deviceId}` with status, name, MAC, IP, and vendor.

---

## Flow 2: Browse and Search Devices

**Starting screen:** Device List
**Ending screen:** Device Detail
**Preconditions:** At least 10 devices exist with various names, vendors, statuses, and tags.

1. User navigates to Device List via `nav-header-link-devices`.
2. System displays `device-table` with all devices, showing 50 rows per page and default-sorted by IP address ascending.
3. User types "printer" into `search-bar-input`.
4. System filters `device-table` in real-time — only devices matching "printer" in name, MAC, IP, hostname, vendor, or tags are shown. `device-table-row-count` updates.
5. User clicks `filter-chips-status-online` to further filter by online status.
6. System narrows results to devices matching "printer" AND status = online.
7. User clicks `device-table-sort-last-seen` column header to sort by last-seen.
8. System reorders the visible rows by last-seen (toggles asc/desc on repeated click).
9. User clicks `device-row-{deviceId}-name` on a specific device row.
10. System navigates to Device Detail view for the selected device, displaying `device-identity-card`.
11. When the user returns to Device List, the previously chosen rows-per-page and sort settings are restored.

---

## Flow 3: View Device Details

**Starting screen:** Device Detail
**Ending screen:** Device Detail (Tags tab, after saving)
**Preconditions:** Device exists with IP history, open ports, presence data, and at least one existing tag.

1. System displays `device-identity-card` with device name, MAC, vendor, hostname, confidence score, and known/unknown flag.
2. System shows `tab-bar` with tabs: History, Ports, Presence, Tags.
3. Default tab (History) is active — `ip-history-table` is displayed showing all historical IPs with first-seen and last-seen dates.
4. User clicks `tab-bar-tab-ports`.
5. System switches to the Ports tab — `port-table` displays currently open ports with service names, protocols, and the port changelog below.
6. User clicks `tab-bar-tab-presence`.
7. System switches to the Presence tab — `presence-timeline-chart` renders a bar chart of online/offline periods. `presence-timeline-range-selector` defaults to "30 days".
8. User selects "90 days" from `presence-timeline-range-selector`.
9. System re-renders the chart with 90 days of presence data.
10. User clicks `tab-bar-tab-tags`.
11. System switches to the Tags tab — existing tags are displayed as `tag-pill-{tagName}` components. A notes area is visible below.
12. User clicks into `tag-input-field` and types "Serv".
13. System shows `tag-input-dropdown` with matching suggestions (e.g., "Server").
14. User clicks `tag-input-suggestion-0` to select "Server".
15. System adds `tag-pill-server` to the device's tags and saves via `PATCH /api/v1/devices/:id`.
16. System shows `alert-banner` with type=success and message "Tag added".

---

## Flow 4: Tag Multiple Devices

**Starting screen:** Device List
**Ending screen:** Device List (tags applied)
**Preconditions:** At least 5 devices exist. The tag "IoT" exists in the system.

1. User navigates to Device List via `nav-header-link-devices`.
2. System displays `device-table` with all devices.
3. User clicks `device-row-{deviceId1}-checkbox` to select the first device.
4. System shows `bulk-action-bar` with `bulk-action-bar-count` showing "1 selected".
5. User clicks `device-row-{deviceId2}-checkbox` and `device-row-{deviceId3}-checkbox` to select two more devices.
6. `bulk-action-bar-count` updates to "3 selected".
7. User clicks `bulk-action-bar-tag` ("Tag Selected") button.
8. System opens a dialog/popover containing `tag-input` for selecting a tag.
9. User types "IoT" in `tag-input-field`.
10. System shows `tag-input-dropdown` with "IoT" suggestion.
11. User selects `tag-input-suggestion-0` ("IoT").
12. System shows `confirm-dialog` asking "Apply tag 'IoT' to 3 devices?".
13. User clicks `confirm-dialog-confirm`.
14. System sends `POST /api/v1/devices/bulk-tag` with the 3 device IDs and tag "IoT".
15. System shows `alert-banner` with type=success and message "Tag 'IoT' applied to 3 devices".
16. Each selected device row now shows `tag-pill-iot` in its tags column.
17. `bulk-action-bar` dismisses and checkboxes are deselected.

---

## Flow 5: Trigger Manual Scan

**Starting screen:** Dashboard Overview
**Ending screen:** Dashboard Overview (updated metrics)
**Preconditions:** No scan is currently in progress. At least one prior scan has been completed.

1. User is on the Dashboard Overview page.
2. Metric cards (`metric-card-total-devices`, `metric-card-new-devices`, etc.) display current values.
3. User clicks `nav-header-scan-button` ("Scan Now").
4. System shows `confirm-dialog` with title "Start Network Scan?" and message "This will scan your network for devices."
5. User clicks `confirm-dialog-confirm`.
6. System sends `POST /api/v1/scans` — API returns the new scan ID.
7. `scan-progress-bar` appears with `scan-progress-bar-status` = "Scanning…" and `scan-progress-bar-percentage` = "0%".
8. `nav-header-scan-button` becomes disabled (grayed out) to prevent duplicate triggers.
9. System polls `GET /api/v1/scans/current` every 5 seconds. `scan-progress-bar-fill` and `scan-progress-bar-percentage` update with each poll.
10. Scan completes — `scan-progress-bar` shows 100%, then fades out after 2 seconds.
11. `nav-header-scan-button` re-enables.
12. Metric cards refresh: `metric-card-total-devices-value`, `metric-card-new-devices-value`, `metric-card-offline-devices-value`, and `metric-card-last-scan-value` all update to reflect the latest scan results.

---

## Flow 6: Configure Scan Settings

**Starting screen:** Settings
**Ending screen:** Settings (saved confirmation)
**Preconditions:** Application is running with default settings.

1. User clicks `nav-header-link-settings` to navigate to Settings.
2. System displays `settings-form` with `tab-bar` showing tabs: Scanning, Retention, Alerts, API.
3. Default tab (Scanning) is active — `settings-form-tab-scanning` content is visible.
4. User changes `settings-form-scan-cadence` from "every 1 hour" to "every 4 hours" using the dropdown.
5. User clicks `tab-bar-tab-retention` to switch to the Retention tab.
6. System shows `settings-form-tab-retention` content.
7. User changes `settings-form-retention-days` from "365" to "180" by clearing and typing "180".
8. User clicks `settings-form-save`.
9. System sends the updated settings to the API.
10. System shows `alert-banner` with type=success and message "Settings saved successfully".

---

## Flow 7: Set Up Webhook Alerts

**Starting screen:** Settings
**Ending screen:** Settings (Alerts tab, saved)
**Preconditions:** Application is running. No webhook URL is currently configured.

1. User navigates to Settings via `nav-header-link-settings`.
2. User clicks `tab-bar-tab-alerts` to switch to the Alerts tab.
3. System shows `settings-form-tab-alerts` content with an empty `settings-form-webhook-url` field.
4. User types "https://hooks.example.com/netobserver" into `settings-form-webhook-url`.
5. User clicks `settings-form-webhook-test` ("Test Webhook") button.
6. System sends a test payload to the webhook URL.
7. `settings-form-webhook-status` shows a green checkmark with "Success — webhook responded with 200 OK".
8. User clicks `settings-form-save`.
9. System persists the webhook URL to configuration.
10. System shows `alert-banner` with type=success and message "Alert settings saved".

---

## Flow 8: Export Device Data

**Starting screen:** Device List
**Ending screen:** Device List (file downloaded)
**Preconditions:** At least 10 devices exist. User may have active filters applied.

1. User navigates to Device List via `nav-header-link-devices`.
2. System displays `device-table` with all devices.
3. User optionally applies filters (e.g., clicks `filter-chips-status-online` to show only online devices).
4. User clicks `export-button-trigger` ("Export").
5. System shows `export-button-dropdown` with two options: "Export CSV" and "Export JSON".
6. User clicks `export-button-csv`.
7. System calls `GET /api/v1/export/devices?format=csv` (including any active filter query params).
8. Browser downloads a file named `devices_YYYY-MM-DD_HH-mm-ss.csv` containing all visible (filtered) devices.
9. `export-button-dropdown` closes.
10. System shows `alert-banner` with type=success and message "Export complete — file downloaded".

---

## Flow 9: View Scan History

**Starting screen:** Scan History
**Ending screen:** Scan History (expanded scan row)
**Preconditions:** At least 5 completed scans exist in the system.

1. User clicks `nav-header-link-scans` to navigate to Scan History.
2. System displays `scan-history-table` with a paginated list of past scans, most recent first.
3. Each row (`scan-history-table-row-{scanId}`) shows start time, duration, devices found, new devices, and status badge.
4. User clicks `scan-history-table-row-{scanId}-expand` on the most recent scan.
5. System expands the row to reveal `scan-history-table-row-{scanId}-details` — a nested list of devices discovered in that scan, with status change indicators (e.g., "new", "ip_changed", "returned_online").
6. User scrolls through the expanded detail to review which devices were found and what changed.
7. User clicks `scan-history-table-row-{scanId}-expand` again to collapse the row.
8. User clicks `pagination-next` to view older scans.
9. System loads the next page of scan history rows.

---

## Flow 10: Device Identity Merge

**Starting screen:** Device List
**Ending screen:** Device Detail (merged device)
**Preconditions:** Two devices exist that represent the same physical device (e.g., one entry from wired MAC, one from wireless MAC). User has identified them as duplicates.

1. User navigates to Device List via `nav-header-link-devices`.
2. User clicks `device-row-{deviceIdA}-checkbox` to select the first duplicate device.
3. User clicks `device-row-{deviceIdB}-checkbox` to select the second duplicate device.
4. `bulk-action-bar` appears with `bulk-action-bar-count` showing "2 selected".
5. User clicks `bulk-action-bar-merge` ("Merge") button.
6. System shows `confirm-dialog` with title "Merge Devices" and a message displaying both device names, asking the user to choose the primary device.
7. Dialog shows a radio selection or similar control for picking the primary device identity.
8. User selects Device A as the primary.
9. User clicks `confirm-dialog-confirm`.
10. System sends `POST /api/v1/devices/{deviceIdA}/merge` with `{ "mergeWithDeviceId": "{deviceIdB}" }`.
11. System shows `alert-banner` with type=success and message "Devices merged successfully".
12. Device List refreshes — only the primary device (Device A) remains. Device B is removed from the list.
13. User clicks `device-row-{deviceIdA}-name` to open the merged device's detail.
14. `device-identity-card` shows the combined identity. `ip-history-table` includes IP history from both original devices. Tags from both devices are combined.
