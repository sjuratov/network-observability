# FRD: Device Detail Activity History Rationalization

## Overview

Rationalize the device-detail history experience by consolidating overlapping IP History and Presence surfaces into a single Activity view, and simplify the Ports & Services table by removing an almost-always-empty Version column from the primary UI. This extension addresses a broken frontend/backend history contract, reduces duplicate summary content, and keeps advanced port-version data available without dedicating visible table space to mostly empty values.

## User Stories

- As a network admin, I want one activity view that explains where a device has been and when it was online or offline so that I can understand device behavior without switching between overlapping tabs.
- As a security-conscious user, I want the IP history to actually populate so that I can investigate DHCP churn and device movement.
- As an operator, I want the presence area to show meaningful timeline data rather than repeating status facts that already appear in Overview.
- As a user reviewing ports, I want the table to focus on useful port/service information so that empty version cells do not waste space.

## Integration Points

- **Existing feature F10 (Dashboard & Visualization)** — updates `src/web/pages/DeviceDetailPage.tsx` and the related e2e page object so the tab structure, content panels, and empty states match the new Activity-centered design.
- **Existing feature F8 (Presence Tracking)** — reuses first-seen, last-seen, and presence transition events so the device-detail page can render current state plus history from the same source of truth.
- **Existing feature F4 (Historical Data Storage)** — depends on `device_history`, `scan_results`, and presence-event persistence so IP changes and online/offline transitions can be aggregated into a structured activity payload.
- **Existing feature F11 (REST API)** — upgrades `GET /api/v1/devices/:id/history` from raw history rows to the structured sections the frontend already expects, while keeping `/api/v1/devices/:id/ports` as the source for the latest open-port snapshot.
- **Existing feature F5 (Port & Service Detection)** — preserves service-version data in the API contract for advanced/conditional display even though the default ports table stops rendering a standalone Version column.

## Acceptance Criteria

- [ ] Device detail navigation is rationalized to `Overview`, `Activity`, `Ports & Services`, and `Tags & Notes`.
- [ ] The Activity tab contains a current presence summary, populated IP history, and a chronological event feed for IP changes and online/offline transitions.
- [ ] The Activity tab no longer duplicates overview-only facts without adding historical value.
- [ ] `GET /api/v1/devices/:id/history` returns structured history sections that populate the UI without frontend-only fallback logic.
- [ ] Devices with no IP churn or no presence transitions render meaningful empty states instead of an apparently broken blank table.
- [ ] The Ports & Services table no longer renders a standalone Version column.
- [ ] When a port has version information, that detail is shown as secondary service metadata only when it exists.
- [ ] The API continues to preserve raw `version` values so service-version detection remains available for exports, advanced detail, or later UX enhancements.

## Edge Cases

- Devices with a single IP and no transitions still show useful first-seen/last-seen context in Activity.
- Devices with long activity histories need a bounded initial render with a clear way to expose more records if necessary.
- Some ports in a result set may have version data while others do not; the table must remain visually stable without sparse empty cells.
- Older devices may have historical rows recorded before presence events were fully populated; the UI must tolerate partial history without failing the whole view.

## Error Handling

- If activity aggregation fails, the Activity tab shows a scoped error state and leaves the rest of the device detail page functional.
- If port data loads but no version values exist, the UI shows service data normally and never renders placeholder-only columns.
- If structured history is unavailable for a legacy record, the API returns empty arrays for the missing sections rather than a success-shaped but incompatible payload.

## Non-Functional Requirements

- Performance: the Activity payload should be compact enough to render quickly on initial device-detail load, with additional pagination or "load more" behavior if needed for deep histories.
- Accessibility: tab names and activity sections must remain screen-reader friendly and keyboard navigable.
- Maintainability: the UI should rely on explicit typed history sections rather than ad hoc fallback parsing in the client.
