# FRD: Device Tagging & Naming

## Feature ID
F9

## Overview
Allow users to assign custom display names, freeform tags, and notes to discovered devices for organization and identification. Tags use a many-to-many relationship, support bulk operations, and persist across IP changes by binding to the device's fingerprint identity rather than its network address.

## PRD References
- PRD Feature: F9 — Device Tagging & Naming
- Related Features: F2 (Fingerprinting), F4 (Storage), F10 (Dashboard), F11 (REST API)

## User Stories

1. **As a home network admin**, I want to give my devices friendly names (e.g., "Living Room TV") so I can quickly identify them in the device list instead of reading MAC addresses.
2. **As a small business IT admin**, I want to tag devices by category (e.g., "IoT", "Printer", "Workstation") so I can filter the device list by type.
3. **As a security-conscious user**, I want to add notes to suspicious devices documenting my investigation findings so I have a record for future reference.
4. **As an IT admin**, I want to bulk-tag multiple devices at once (e.g., select all printers and tag them "Printer") so I can efficiently organize a large device inventory.
5. **As a home network admin**, I want the system to suggest common tags (e.g., "IoT", "Guest", "Critical") so I don't have to type them manually every time.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F9.1 | Assign user-defined display names to devices | Must | Max 128 characters; replaces auto-detected hostname in display contexts |
| F9.2 | Apply tags/labels to devices (many-to-many relationship) | Must | A device can have multiple tags; a tag can apply to multiple devices |
| F9.3 | Add freeform notes to device records | Must | Markdown-compatible text; max 4096 characters |
| F9.4 | Tags and names persist across IP changes (tied to device fingerprint, not IP) | Must | Bound to device identity (F2), not network address |
| F9.5 | Support bulk tagging of multiple devices | Should | Select N devices, apply/remove tag(s) in one operation |
| F9.6 | Provide a set of default suggested tags | Should | Pre-populated but not pre-applied; user can ignore or delete |
| F9.7 | CRUD operations for tags via REST API | Must | Create, read, update (rename), delete tags |
| F9.8 | Search and filter devices by tag | Must | Exact match and multi-tag intersection filters |
| F9.9 | Display tag usage count (number of devices per tag) | Should | Helps identify orphaned or overused tags |
| F9.10 | Support bulk removal of tags from devices | Should | Inverse of bulk apply |
| F9.11 | Tag names are case-insensitive for uniqueness but preserve original casing | Must | "iot" and "IoT" are the same tag |

## Acceptance Criteria

### AC-1: Device Naming Persistence
- **Given** a device is renamed to "Living Room TV"
- **When** the device changes IP address via DHCP renewal
- **Then** the device retains the name "Living Room TV"
- **And** the display name appears in the device list and detail views

### AC-2: Bulk Tagging
- **Given** 5 devices are selected in the device list
- **When** the user applies the "IoT" tag in bulk
- **Then** all 5 devices have the "IoT" tag
- **And** the operation completes as a single atomic transaction

### AC-3: Tags and Notes Display
- **Given** a device has tags ["Printer", "Critical"] and a note "Main office printer, 2nd floor"
- **When** the device detail page is viewed
- **Then** all tags are displayed as interactive labels
- **And** the note is displayed with preserved formatting

### AC-4: Tag Filtering
- **Given** devices are tagged with various labels
- **When** the user filters the device list by tag "IoT"
- **Then** only devices with the "IoT" tag are shown

### AC-5: Default Suggested Tags
- **Given** the application is running for the first time
- **When** the user opens the tag selector on any device
- **Then** the default suggested tags are available for selection
- **And** no tags are pre-applied to any device

### AC-6: Case-Insensitive Tag Uniqueness
- **Given** a tag "IoT" already exists
- **When** a user tries to create a tag "iot" or "IOT"
- **Then** the existing "IoT" tag is used instead of creating a duplicate
- **And** the user is informed that the tag already exists

### AC-7: Tag CRUD via API
- **Given** a valid API key
- **When** `POST /api/tags` is called with `{ "name": "Server" }`
- **Then** the tag is created and returned with its ID
- **When** `DELETE /api/tags/:id` is called
- **Then** the tag is removed from all devices and deleted

## Technical Considerations

### Tag Data Model (Many-to-Many)

```sql
-- Tags table
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,         -- UUID
  name       TEXT NOT NULL,            -- Display name (preserves casing)
  name_lower TEXT NOT NULL UNIQUE,     -- Lowercase for uniqueness constraint
  created_at TEXT NOT NULL             -- ISO 8601
);

-- Device-tag association (many-to-many)
CREATE TABLE device_tags (
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,            -- When the tag was applied
  PRIMARY KEY (device_id, tag_id)
);

CREATE INDEX idx_device_tags_tag ON device_tags(tag_id);

-- Device metadata additions
ALTER TABLE devices ADD COLUMN display_name TEXT;         -- Max 128 chars, nullable
ALTER TABLE devices ADD COLUMN notes        TEXT;         -- Max 4096 chars, nullable
```

### Default Suggested Tags

The following tags are pre-created on first run but not applied to any device:

| Tag | Description |
|-----|-------------|
| `IoT` | Internet of Things devices (smart home, sensors) |
| `Guest` | Guest or visitor devices |
| `Critical` | Critical infrastructure (servers, routers, switches) |
| `Printer` | Printers and print servers |
| `Mobile` | Phones, tablets |
| `Workstation` | Desktop computers and laptops |
| `Media` | Smart TVs, streaming devices, speakers |
| `Network` | Routers, switches, access points |
| `Unknown` | Unidentified or suspicious devices |
| `Trusted` | Verified and trusted devices |

### Naming Rules

| Rule | Value | Notes |
|------|-------|-------|
| Max display name length | 128 characters | Enforced at API and UI level |
| Allowed characters (name) | Unicode letters, digits, spaces, hyphens, underscores, periods, parentheses | No control characters; no leading/trailing whitespace |
| Max note length | 4096 characters | Supports Markdown formatting |
| Max tag name length | 64 characters | Must be non-empty after trimming |
| Allowed characters (tag) | Unicode letters, digits, hyphens, underscores, spaces | No special symbols (#, @, etc.) |
| Tag uniqueness | Case-insensitive | `name_lower` column enforces uniqueness |

### Bulk Operations Workflow

1. Client sends `POST /api/devices/bulk-tag` with:
   ```json
   {
     "device_ids": ["uuid-1", "uuid-2", "uuid-3"],
     "add_tags": ["IoT", "Critical"],
     "remove_tags": ["Unknown"]
   }
   ```
2. Server validates all device IDs exist and all tags exist (or creates new tags for `add_tags`).
3. Operations are executed in a single SQLite transaction for atomicity.
4. Response includes per-device results with success/failure status.
5. If any device ID is invalid, the entire operation is rejected (fail-fast).

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Tag with same name but different case | Reject the duplicate; return existing tag with original casing and a 409 Conflict response |
| Orphaned tags after device merge (F2.5) | When devices are merged, tags from both devices are combined on the surviving device; empty tags are retained (not auto-deleted) |
| Deleting a tag that is applied to devices | Remove the association from all devices first (CASCADE); the tag is deleted, devices are unaffected |
| Device display name set to empty string | Treat as "clear the display name"; revert to showing the auto-detected hostname |
| Note exceeds max length | Reject with 400 error; do not truncate silently |
| Tag name with only whitespace | Reject with 400 error; tag name must contain at least one non-whitespace character |
| Bulk operation with invalid device ID | Reject entire batch with 400 error listing the invalid IDs; no partial application |
| Tag rename to a name that already exists (different case) | Merge: re-associate all devices from the renamed tag to the existing tag, then delete the renamed tag |
| Concurrent bulk tag operations on overlapping devices | SQLite transaction serialization prevents conflicts; second operation retries or returns 409 |
| Device deleted or merged while tags are being edited | Return 404 for the missing device ID; do not apply partial changes |

## Configuration

| Parameter | Env Var | Config Key | Default | Description |
|-----------|---------|------------|---------|-------------|
| Max display name length | — | `tagging.max_name_length` | `128` | Maximum characters for device display name |
| Max note length | — | `tagging.max_note_length` | `4096` | Maximum characters for device notes |
| Max tag name length | — | `tagging.max_tag_name_length` | `64` | Maximum characters for tag names |
| Default tags enabled | `DEFAULT_TAGS_ENABLED` | `tagging.default_tags` | `true` | Whether to create default suggested tags on first run |

## Dependencies

- **F2 (Fingerprinting):** Tags and names are bound to device fingerprint identity, not IP address. Device merge (F2.5) and split (F2.6) operations must handle tag reassignment.
- **F4 (Storage):** Tags, device-tag associations, display names, and notes persisted in SQLite.
- **F10 (Dashboard):** Device list supports filtering by tag; detail view shows tags and notes; bulk tag UI in device list.
- **F11 (REST API):** Full CRUD for tags; device update endpoints accept display name, tags, and notes.
- **F12 (Data Export):** Exported device data includes display name, tags, and notes columns.
