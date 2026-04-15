# Component Inventory — NetObserver

> **Purpose:** Document all reusable UI components with `data-testid` selectors for E2E test generation and implementation.
>
> **Consumed by:** E2E Generation (POM selectors), Gherkin (scenario vocabulary), Implementation (component structure)

---

## Navigation & Layout

### NavHeader
- **data-testid:** `nav-header`
- **Description:** Application header bar with logo/title and primary navigation links (Dashboard, Devices, Scans, Settings).
- **Variants:** None
- **Used on:** All screens (persistent)
- **Key child selectors:**
  - `nav-header-logo` — app logo / title ("NetObserver")
  - `nav-header-link-dashboard` — Dashboard nav link
  - `nav-header-link-devices` — Devices nav link
  - `nav-header-link-scans` — Scans nav link
  - `nav-header-link-settings` — Settings nav link
  - `nav-header-scan-button` — "Scan Now" quick-action button

### TabBar
- **data-testid:** `tab-bar`
- **Description:** Horizontal tab navigation for switching between sections within a view (e.g., device detail tabs, settings tabs).
- **Variants:** None
- **Used on:** Device Detail, Settings
- **Key child selectors:**
  - `tab-bar-tab-{name}` — individual tab button (e.g., `tab-bar-tab-history`, `tab-bar-tab-ports`, `tab-bar-tab-presence`, `tab-bar-tab-tags`)
  - `tab-bar-active-indicator` — visual indicator on the active tab

### Pagination
- **data-testid:** `pagination`
- **Description:** Page navigation controls with previous/next buttons, page numbers, and a page-size selector dropdown.
- **Variants:** None
- **Used on:** Device List, Scan History
- **Key child selectors:**
  - `pagination-prev` — previous page button
  - `pagination-next` — next page button
  - `pagination-page-{n}` — page number button (e.g., `pagination-page-1`)
  - `pagination-page-size` — page size dropdown selector
  - `pagination-info` — "Showing X–Y of Z" text

---

## Dashboard

### MetricCard
- **data-testid:** `metric-card-{metric}` (e.g., `metric-card-total-devices`, `metric-card-new-devices`, `metric-card-offline-devices`, `metric-card-last-scan`)
- **Description:** Dashboard summary card displaying a single numeric value, a label, and an optional trend indicator. Clickable to navigate to a filtered view.
- **Variants:** `metric=total-devices | new-devices | offline-devices | last-scan`
- **Used on:** Dashboard Overview
- **Key child selectors:**
  - `metric-card-{metric}-value` — the numeric value (e.g., "50")
  - `metric-card-{metric}-label` — the descriptive label (e.g., "Total Devices")
  - `metric-card-{metric}-trend` — trend arrow/badge (up/down/neutral)

### ScanProgressBar
- **data-testid:** `scan-progress-bar`
- **Description:** Horizontal progress indicator showing scan completion percentage and status text. Visible only when a scan is actively running. Polls the API every 5 seconds.
- **Variants:** `status=in-progress | completed | failed`
- **Used on:** Dashboard Overview, Device List (top banner)
- **Key child selectors:**
  - `scan-progress-bar-fill` — the filled portion of the progress bar
  - `scan-progress-bar-percentage` — percentage text (e.g., "62%")
  - `scan-progress-bar-status` — status label (e.g., "Scanning…")

### EmptyState
- **data-testid:** `empty-state`
- **Description:** Placeholder content shown when a list or view has no data. Includes an icon, a message, and a call-to-action button (e.g., "Run your first scan").
- **Variants:** `context=devices | scans | tags | search-results`
- **Used on:** Dashboard (first run), Device List (no devices), Scan History (no scans), search with no results
- **Key child selectors:**
  - `empty-state-icon` — illustrative icon
  - `empty-state-title` — heading text (e.g., "No Devices Yet")
  - `empty-state-message` — descriptive body text
  - `empty-state-action` — call-to-action button

---

## Device List

### SearchBar
- **data-testid:** `search-bar`
- **Description:** Full-text search input that searches across device name, MAC, IP, hostname, vendor, and tags. Triggers client-side filtering for ≤500 devices; sends query to API for larger datasets.
- **Variants:** None
- **Used on:** Device List
- **Key child selectors:**
  - `search-bar-input` — the text input field
  - `search-bar-clear` — clear/reset button (visible when input has text)

### FilterChips
- **data-testid:** `filter-chips`
- **Description:** Horizontal row of selectable filter chip groups for narrowing the device list. Filters are combinable with AND logic.
- **Variants:** `category=status | tag | vendor`
- **Used on:** Device List
- **Key child selectors:**
  - `filter-chips-status` — status filter group
  - `filter-chips-status-{value}` — individual status chip (e.g., `filter-chips-status-online`, `filter-chips-status-offline`)
  - `filter-chips-tag` — tag filter group
  - `filter-chips-tag-{value}` — individual tag chip (e.g., `filter-chips-tag-iot`)
  - `filter-chips-vendor` — vendor filter group
  - `filter-chips-vendor-{value}` — individual vendor chip
  - `filter-chips-clear` — clear all filters button

### DeviceTable
- **data-testid:** `device-table`
- **Description:** Sortable, filterable table displaying the full device inventory. Supports column-header sorting, row selection (checkboxes), and click-to-navigate to device detail.
- **Variants:** None
- **Used on:** Device List
- **Key child selectors:**
  - `device-table-header` — table header row
  - `device-table-sort-{column}` — sortable column header (e.g., `device-table-sort-name`, `device-table-sort-ip`, `device-table-sort-vendor`, `device-table-sort-last-seen`, `device-table-sort-status`)
  - `device-table-select-all` — "select all" checkbox in header
  - `device-table-body` — table body container
  - `device-table-row-count` — result count text (e.g., "47 devices")

### DeviceRow
- **data-testid:** `device-row-{deviceId}`
- **Description:** Single row in the device table representing one discovered device. Shows status dot, display name, MAC address, current IP, vendor, tags, and last-seen timestamp.
- **Variants:** `status=online | offline | new | unknown`
- **Used on:** Device List (inside DeviceTable)
- **Key child selectors:**
  - `device-row-{deviceId}-checkbox` — row selection checkbox
  - `device-row-{deviceId}-status` — StatusBadge for this device
  - `device-row-{deviceId}-name` — device display name (clickable link to detail)
  - `device-row-{deviceId}-mac` — MAC address
  - `device-row-{deviceId}-ip` — current IP address
  - `device-row-{deviceId}-vendor` — vendor name
  - `device-row-{deviceId}-tags` — tag pill container
  - `device-row-{deviceId}-last-seen` — last-seen timestamp

### BulkActionBar
- **data-testid:** `bulk-action-bar`
- **Description:** Contextual toolbar that appears when one or more device rows are selected. Provides bulk actions: tag, untag, mark known, export selected.
- **Variants:** None
- **Used on:** Device List
- **Key child selectors:**
  - `bulk-action-bar-count` — number of selected devices (e.g., "3 selected")
  - `bulk-action-bar-tag` — "Tag Selected" button
  - `bulk-action-bar-untag` — "Remove Tag" button
  - `bulk-action-bar-merge` — "Merge" button
  - `bulk-action-bar-export` — "Export Selected" button
  - `bulk-action-bar-clear` — "Clear Selection" button

---

## Device Detail

### DeviceIdentityCard
- **data-testid:** `device-identity-card`
- **Description:** Header card on the device detail page displaying the device's primary identity: display name, MAC, vendor (OUI), hostnames, fingerprint confidence score, and known/unknown flag.
- **Variants:** `known=true | false`
- **Used on:** Device Detail
- **Key child selectors:**
  - `device-identity-card-name` — display name (editable inline)
  - `device-identity-card-mac` — MAC address
  - `device-identity-card-vendor` — vendor name
  - `device-identity-card-hostname` — hostname(s)
  - `device-identity-card-confidence` — fingerprint confidence badge
  - `device-identity-card-known-flag` — known/unknown toggle
  - `device-identity-card-status` — StatusBadge (current online/offline)

### IPHistoryTable
- **data-testid:** `ip-history-table`
- **Description:** Table listing all IP addresses the device has used over time, with first-seen and last-seen timestamps per IP. Sorted by last-seen descending.
- **Variants:** None
- **Used on:** Device Detail → History tab
- **Key child selectors:**
  - `ip-history-table-header` — table header
  - `ip-history-table-row-{index}` — individual row
  - `ip-history-table-ip-{index}` — IP address cell
  - `ip-history-table-first-seen-{index}` — first-seen timestamp
  - `ip-history-table-last-seen-{index}` — last-seen timestamp
  - `ip-history-table-load-more` — "Load more" button (shown when >20 entries)

### PortTable
- **data-testid:** `port-table`
- **Description:** Table showing currently open ports with service names and protocol, plus a changelog of port opens/closes with timestamps.
- **Variants:** None
- **Used on:** Device Detail → Ports tab
- **Key child selectors:**
  - `port-table-header` — table header
  - `port-table-row-{index}` — individual port row
  - `port-table-port-{index}` — port number cell
  - `port-table-protocol-{index}` — protocol cell (tcp/udp)
  - `port-table-service-{index}` — service name cell
  - `port-table-changelog` — port change history section
  - `port-table-change-{index}` — individual change entry

### PresenceTimeline
- **data-testid:** `presence-timeline`
- **Description:** Bar chart visualization of device online/offline periods over a selectable date range (default: last 30 days). Green segments = online, gray = offline.
- **Variants:** `range=7d | 30d | 90d | 1y`
- **Used on:** Device Detail → Presence tab
- **Key child selectors:**
  - `presence-timeline-chart` — the chart/canvas element
  - `presence-timeline-range-selector` — date range dropdown
  - `presence-timeline-legend` — chart legend (online/offline colors)

---

## Tags

### StatusBadge
- **data-testid:** `status-badge-{status}` (e.g., `status-badge-online`, `status-badge-offline`)
- **Description:** Small colored badge indicating device network status. Color-coded dot with label.
- **Variants:** `status=online (green) | offline (gray) | new (blue) | unknown (yellow)`
- **Used on:** Device List (DeviceRow), Device Detail (DeviceIdentityCard)
- **Key child selectors:**
  - `status-badge-{status}-dot` — colored status dot
  - `status-badge-{status}-label` — status text label

### TagPill
- **data-testid:** `tag-pill-{tagName}` (e.g., `tag-pill-iot`, `tag-pill-critical`)
- **Description:** Colored pill-shaped label showing a tag name. Optionally includes a remove button (×) for editable contexts.
- **Variants:** `removable=true | false`
- **Used on:** Device List (DeviceRow tags column), Device Detail (Tags tab), Filter Chips
- **Key child selectors:**
  - `tag-pill-{tagName}-label` — tag name text
  - `tag-pill-{tagName}-remove` — remove/× button (only in editable contexts)

### TagInput
- **data-testid:** `tag-input`
- **Description:** Autocomplete input for adding tags to a device. Shows dropdown of existing/suggested tags as the user types. Creates new tags on Enter if no match.
- **Variants:** None
- **Used on:** Device Detail (Tags tab), Bulk Action Bar (tag modal)
- **Key child selectors:**
  - `tag-input-field` — the text input
  - `tag-input-dropdown` — autocomplete suggestion dropdown
  - `tag-input-suggestion-{index}` — individual suggestion item
  - `tag-input-create-new` — "Create new tag" option at bottom of dropdown

---

## Scan

### ScanHistoryTable
- **data-testid:** `scan-history-table`
- **Description:** Paginated table of past scans showing start time, duration, devices found, new devices, and error count. Rows are expandable to show per-scan device list.
- **Variants:** None
- **Used on:** Scan History
- **Key child selectors:**
  - `scan-history-table-header` — table header row
  - `scan-history-table-row-{scanId}` — scan row (clickable to expand)
  - `scan-history-table-row-{scanId}-time` — start time
  - `scan-history-table-row-{scanId}-duration` — duration
  - `scan-history-table-row-{scanId}-devices` — devices found count
  - `scan-history-table-row-{scanId}-new` — new devices count
  - `scan-history-table-row-{scanId}-status` — scan status badge
  - `scan-history-table-row-{scanId}-expand` — expand/collapse toggle
  - `scan-history-table-row-{scanId}-details` — expanded detail panel (per-scan device list)

---

## Settings

### SettingsForm
- **data-testid:** `settings-form`
- **Description:** Sectioned form for application configuration. Divided into tabs: Scanning, Retention, Alerts, API. Each section has labeled fields with validation.
- **Variants:** `tab=scanning | retention | alerts | api`
- **Used on:** Settings
- **Key child selectors:**
  - `settings-form-tab-scanning` — Scanning settings tab content
  - `settings-form-scan-cadence` — scan interval selector
  - `settings-form-scan-subnets` — subnet configuration input
  - `settings-form-tab-retention` — Retention settings tab content
  - `settings-form-retention-days` — retention period input (days)
  - `settings-form-tab-alerts` — Alerts settings tab content
  - `settings-form-webhook-url` — webhook URL input
  - `settings-form-webhook-test` — "Test Webhook" button
  - `settings-form-webhook-status` — webhook test result indicator
  - `settings-form-email-enabled` — email alerts toggle
  - `settings-form-tab-api` — API settings tab content
  - `settings-form-api-key` — API key display (masked)
  - `settings-form-api-key-reveal` — reveal/copy API key button
  - `settings-form-save` — save settings button
  - `settings-form-cancel` — cancel/reset button

---

## Actions & Feedback

### ExportButton
- **data-testid:** `export-button`
- **Description:** Download trigger button with format selection. Clicking opens a small dropdown to choose between CSV and JSON export formats.
- **Variants:** `context=devices | scans`
- **Used on:** Device List, Scan History
- **Key child selectors:**
  - `export-button-trigger` — main button face ("Export")
  - `export-button-dropdown` — format selection dropdown
  - `export-button-csv` — "Export CSV" option
  - `export-button-json` — "Export JSON" option

### ConfirmDialog
- **data-testid:** `confirm-dialog`
- **Description:** Modal confirmation dialog for destructive or significant actions (e.g., triggering a scan, merging devices, deleting tags). Blocks interaction until dismissed.
- **Variants:** `intent=destructive | neutral` (destructive uses red confirm button)
- **Used on:** Dashboard (scan trigger), Device List (merge/bulk actions), Settings (reset)
- **Key child selectors:**
  - `confirm-dialog-title` — dialog title
  - `confirm-dialog-message` — descriptive body text
  - `confirm-dialog-confirm` — confirm/proceed button
  - `confirm-dialog-cancel` — cancel button

### AlertBanner
- **data-testid:** `alert-banner`
- **Description:** Toast-style notification banner displayed at the top of the viewport. Auto-dismisses after a timeout or can be closed manually.
- **Variants:** `type=success (green) | error (red) | warning (amber) | info (blue)`
- **Used on:** All screens (appears contextually after actions)
- **Key child selectors:**
  - `alert-banner-icon` — status icon
  - `alert-banner-message` — notification message text
  - `alert-banner-dismiss` — close/dismiss button
