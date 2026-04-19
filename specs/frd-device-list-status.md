# FRD: Device List Status & Pagination Controls

## Overview

Correct the device list so connectivity status reflects real presence data, offline filtering returns meaningful results, and operators can choose how many devices to see at once. This extension closes the gap between the existing presence model in the specs and the current dashboard implementation, which still relies on a hard-coded 10-row table and a boolean `isOnline` value that is not driven by the full offline-detection flow.

## User Stories

- As a network admin, I want device list page size options of 10, 25, 50, 100, or All so that I can browse small and large networks without being locked to batches of 10.
- As a small business IT user, I want the Offline filter to return devices that are actually offline so that I can investigate connectivity problems quickly.
- As a security-conscious user, I want the status indicator to show online/offline truth rather than a purple "new" dot so that I can distinguish connectivity problems from onboarding state.
- As an operator, I want dashboard offline counts and device-list filtering to agree so that the overview cards are trustworthy entry points into the device inventory.

## Integration Points

- **Existing feature F10 (Dashboard & Visualization)** — updates `src/web/pages/DeviceListPage.tsx`, `src/web/components/DeviceTable.tsx`, and `src/web/components/StatusBadge.tsx` so the list view, pagination copy, and status column match the new interaction model.
- **Existing feature F8 (Presence Tracking)** — uses the presence state machine as the source of truth for connectivity instead of relying on the current scan upsert behavior that always forces `devices.is_online = 1` when a host is seen.
- **Existing feature F11 (REST API)** — extends `GET /api/v1/devices`, `GET /api/v1/devices/:id`, and `GET /api/v1/stats/overview` so device status, offline counts, and page-size retrieval are consistent and support the UI options.
- **Existing storage and scan pipeline** — requires prerequisite reconciliation in `src/api/routes/scans.ts`, `src/api/routes/devices.ts`, `src/api/routes/stats.ts`, and the SQLite schema so offline transitions, unknown status, and backward-compatible `isOnline` mapping can coexist safely.

## Acceptance Criteria

- [ ] The Device List page exposes a rows-per-page control with exactly these options: `10`, `25`, `50`, `100`, and `All`.
- [ ] The first visit defaults to 50 rows with the device list sorted by IP address ascending.
- [ ] When a user changes the rows-per-page or sort order, the device list restores those preferences when they navigate to a device detail page and return to the list.
- [ ] Selecting `All` loads the full filtered result set rather than silently stopping at the current API cap of 100 records.
- [ ] Selecting the `Offline` status filter returns only devices whose derived presence status is `offline`.
- [ ] The dashboard offline metric and the device list filtered by `Offline` return the same count for the same dataset.
- [ ] The Status column represents connectivity only: online devices render green, offline devices render red, and unknown devices render amber.
- [ ] "New" or "known" state is no longer encoded as the status dot in the device list; that lifecycle information is surfaced separately and does not override connectivity color.
- [ ] Device payloads remain backward-compatible for current consumers by preserving a derived `isOnline` boolean while also exposing the richer status contract needed by the UI.

## Edge Cases

- Devices seen only once retain an `unknown` status until enough scan evidence exists; they must not be counted as offline unless the presence threshold is exceeded.
- During an active scan, the list continues to reflect the latest completed presence state until the new scan is committed.
- On networks larger than 100 devices, `All` must still retrieve the full filtered set without truncation.
- Known/new lifecycle state and online/offline presence may diverge; the UI must display both without conflating them.

## Error Handling

- If the full-result retrieval required for `All` fails, the UI keeps the previous page size, surfaces an inline error, and does not replace trustworthy data with partial results.
- If presence reconciliation cannot determine a reliable status for a device, the API returns `unknown` rather than a false positive `online`.
- If the status filter query is invalid, the API returns a structured validation error instead of silently defaulting to `all`.

## Non-Functional Requirements

- Performance: switching between 10/25/50/100 rows should feel instantaneous for datasets already in memory; the `All` option should complete within acceptable bounds for the full filtered dataset and degrade gracefully on large inventories.
- Accessibility: rows-per-page controls and status indicators must be keyboard operable and expose readable text labels so color is not the only signal.
- Security: all supporting API calls continue to require the existing API key authentication flow.
