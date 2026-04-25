# FRD: Scan History Pagination & Filtering

## Feature ID
F3-UI

## Overview

Align the Scan History page pagination with the established Device List pattern — client-side pagination with a "Rows per page" dropdown — and add a Status filter dropdown so operators can quickly narrow scan history to a specific status (completed, failed, in-progress, pending). The current Scan History page uses fixed server-side pagination (10 rows, no configurability) and provides no way to filter by scan status.

## PRD References
- PRD Feature: F3 (Scheduled Scanning) — scan history display
- Related Features: F10 (Dashboard & Visualization), frd-device-list-status (pagination pattern reference)

## User Stories

- As a network admin, I want rows-per-page options (10, 25, 50, 100, All) on the Scan History page so that I can browse large scan histories without being locked to batches of 10.
- As a security-conscious user, I want to filter scan history by status (e.g., show only failed scans) so that I can quickly find problematic scans.
- As a home network admin, I want the Scan History pagination to work like the Devices page so that the app feels consistent.

## Integration Points

- **Existing feature F3 (Scanning)** — uses existing `GET /api/v1/scans` endpoint with cursor/limit pagination.
- **Existing feature frd-device-list-status** — follows the same client-side pagination and rows-per-page pattern established in `DeviceTable.tsx` and `DeviceListPage.tsx`.
- **API client** — adds `getAllScans()` method mirroring the existing `getAllDevices()` pattern for full client-side pagination.

## Acceptance Criteria

- [ ] AC-1: The Scan History page exposes a rows-per-page control with options: `10`, `25`, `50`, `100`, and `All`.
- [ ] AC-2: The default page size is `10`.
- [ ] AC-3: A Status filter dropdown is displayed above the scan table with options: All, Completed, Failed, In Progress, Pending.
- [ ] AC-4: Selecting a status filter narrows the displayed scans to only those with the matching status.
- [ ] AC-5: Changing the status filter or page size resets the current page to 1.
- [ ] AC-6: Pagination info displays "Showing X–Y of Z scans" with correct values after filtering.
- [ ] AC-7: When no scans match the selected filter, a "no matching scans" message is shown (distinct from the "No Scans Yet" empty state).
- [ ] AC-8: Selecting `All` for page size shows all filtered scans without pagination.
- [ ] AC-9: The existing expandable row and scan detail behavior is preserved.
- [ ] AC-10: The "Scan Now" button continues to work and refreshes the scan list after triggering.

## Edge Cases

- If the `All` fetch fails, keep the previous page size and show an inline error (matching Device List behavior).
- If scans are added or removed between fetches, pagination must not show blank pages (clamp current page to valid range).
- Page number buttons should be capped (e.g., current ± 2 with first/last) to avoid rendering hundreds of buttons for large histories.

## Error Handling

- If `getAllScans()` fails, display an error banner and do not replace previously loaded data with empty state.
- Guard against stale async responses using cancellation pattern (matching Device List).

## Non-Functional Requirements

- Switching page sizes should feel instantaneous for data already in memory.
- Status dropdown and pagination controls must be keyboard operable.
