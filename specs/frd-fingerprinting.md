# FRD: Device Fingerprinting & Identity

## Feature ID
F2

## Overview
Device Fingerprinting & Identity builds a persistent, composite identity for each discovered device so that it can be tracked reliably across IP address changes, DHCP lease renewals, and network reconnections. The system uses MAC address as the primary key, enriches it with hostname, OUI vendor lookup, open services, and mDNS/SSDP announcements, and handles modern challenges like MAC address randomization on mobile devices. Users can manually merge or split identities when automatic detection is insufficient.

## PRD References
- PRD Feature: F2 (Device Fingerprinting & Identity)
- Related Features: F1 (Discovery provides raw device data), F5 (Port & Service Detection feeds service signals into fingerprint), F6 (DNS/mDNS/SSDP provides name signals), F9 (Tagging & Naming attaches user metadata to fingerprinted identity), F4 (Storage persists identity records)

## User Stories
- As a **Home Network Admin**, I want my devices to be recognized even when their IP addresses change, so that I see a stable device list instead of duplicates appearing after every DHCP renewal.
- As a **Security-Conscious User**, I want the system to detect when a mobile device uses a randomized MAC, so that I can still correlate it with a known device and not receive false "new device" alerts.
- As a **Small Business IT** operator, I want to see the manufacturer of each device via OUI lookup, so that I can quickly identify device types (e.g., "Cisco", "HP", "Apple") in my inventory.
- As a **Home Network Admin**, I want to manually merge two device records that are actually the same physical device, so that their history is consolidated.
- As a **Security-Conscious User**, I want to split a device record that incorrectly merged two different devices, so that each device is tracked independently.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F2.1 | Use MAC address as the primary device identifier | Must | MAC is the anchor for identity. Each unique MAC creates or matches a device record. Stored in normalized format (lowercase, colon-separated: `aa:bb:cc:dd:ee:ff`). |
| F2.2 | Build composite fingerprint from MAC + hostname + vendor OUI + services + mDNS/SSDP | Must | The fingerprint is a weighted combination of all available signals. Not all signals are always present — the system works with whatever is available. Fingerprint is recalculated on each scan. |
| F2.3 | Detect MAC randomization via the locally-administered bit | Should | Check the second nibble of the first octet: if bit 1 is set (values 2, 6, A, E in the second hex digit), the MAC is locally administered and likely randomized. Flag such MACs in the device record. |
| F2.4 | Fallback to hostname + service fingerprint matching when MAC is randomized | Should | When a new MAC is flagged as randomized, compare hostname pattern + open services + mDNS name against existing devices. Compute a similarity score. If score exceeds configurable threshold (default: 0.7), suggest merge to user or auto-merge if score > 0.9. |
| F2.5 | Allow manual merge of device identities | Must | User selects two or more device records → system combines them into one. All IP history, scan appearances, port history, tags, and notes are merged. The user selects which display name to keep (or provides a new one). Original MAC addresses are all retained in the merged record. |
| F2.6 | Allow manual split of incorrectly merged device identities | Must | User selects a device record and identifies which scan appearances / MAC addresses belong to a separate device. System creates a new device record with the separated history. Split is non-destructive — no data is lost. |
| F2.7 | Perform OUI vendor lookup using the IEEE database for manufacturer identification | Must | Use the IEEE MA-L (MAC Address Block Large, first 3 octets), MA-M (Medium, first 28 bits), and MA-S (Small, first 36 bits) databases. Check MA-S first, then MA-M, then MA-L for most specific match. Store vendor name in device record. |
| F2.8 | Track all IP addresses a device has used over time | Must | Every time a device is seen at a new IP, record the (IP, first_seen, last_seen) tuple. Maintain full history — never overwrite, only append or update last_seen. |
| F2.9 | Recalculate fingerprint confidence on each scan | Should | After each scan, re-evaluate the confidence that the device identity is correct based on signal consistency. Flag devices whose fingerprint signals have diverged significantly (e.g., hostname changed, different service profile). |

## Acceptance Criteria

### AC-1: MAC-Based Identity Persistence
- Given a device with MAC `aa:bb:cc:dd:ee:ff` was previously seen at IP `192.168.1.100`
- When the next scan discovers MAC `aa:bb:cc:dd:ee:ff` at IP `192.168.1.150`
- Then the device is matched to the existing record (same device ID)
- And the new IP `192.168.1.150` is added to the IP history with the current timestamp
- And the previous IP entry's `last_seen` is not updated (it retains its original last_seen)

### AC-2: MAC Randomization Detection
- Given a device is discovered with MAC `da:a1:19:xx:xx:xx` (second nibble `a` → locally-administered bit set)
- When the fingerprinting engine processes this device
- Then the device record includes `mac_randomized: true`
- And the system attempts fingerprint-based matching against existing devices

### AC-3: Fingerprint-Based Matching for Randomized MACs
- Given an existing device with hostname "iPhone-John" and services [62078/tcp]
- And a new device appears with a randomized MAC, hostname "iPhone-John", and services [62078/tcp]
- When the similarity score is computed
- Then the score exceeds the auto-merge threshold (0.9)
- And the new MAC is added to the existing device record automatically
- And an audit log entry records the auto-merge with the similarity score

### AC-4: Manual Merge
- Given two device records: Device A (MAC `aa:bb:cc:11:22:33`, 5 scan appearances) and Device B (MAC `aa:bb:cc:44:55:66`, 3 scan appearances)
- When a user triggers a manual merge of A and B
- Then a single device record exists containing both MACs
- And the IP history from both records is combined chronologically
- And scan appearances total 8
- And the user-chosen display name is applied

### AC-5: Manual Split
- Given a device record with MACs [`aa:bb:cc:11:22:33`, `dd:ee:ff:11:22:33`] and 10 scan appearances
- When a user splits out MAC `dd:ee:ff:11:22:33` (associated with 4 of the 10 appearances)
- Then two device records exist: the original with 6 appearances and a new one with 4
- And each record has the correct IP history corresponding to its scan appearances
- And no scan data is lost

### AC-6: OUI Vendor Lookup
- Given a device is discovered with MAC `3c:22:fb:xx:xx:xx`
- When OUI lookup is performed against the IEEE database
- Then the vendor field is populated (e.g., "Apple, Inc.")
- And the lookup checks MA-S, MA-M, then MA-L databases in order of specificity

### AC-7: OUI Lookup — Unknown Vendor
- Given a device is discovered with a MAC whose OUI is not in the IEEE database
- When OUI lookup is performed
- Then the vendor field is set to "Unknown"
- And the device record is still created successfully (OUI lookup failure is non-fatal)

### AC-8: IP History Tracking
- Given a device has been seen at IPs: 192.168.1.10 (Jan 1–Jan 15), 192.168.1.25 (Jan 16–Feb 1), 192.168.1.10 (Feb 2–present)
- When the device's IP history is queried
- Then all three entries are returned in chronological order
- And the same IP appearing at different times is recorded as separate entries

### AC-9: Fingerprint Below Merge Threshold
- Given an existing device with hostname "Printer-Office" and services [631/tcp, 9100/tcp]
- And a new device appears with a randomized MAC, hostname "Printer-Lab", and services [631/tcp]
- When the similarity score is computed
- Then the score is below the auto-merge threshold
- And the device is flagged for user review with a "potential duplicate" indicator
- And no automatic merge occurs

## Technical Considerations
- **Composite fingerprint algorithm**: Assign weights to each signal: MAC match = 1.0 (definitive), hostname match = 0.4, OUI match = 0.1, service profile overlap (Jaccard index) = 0.3, mDNS/SSDP name match = 0.2. Normalize to [0, 1]. These weights should be configurable.
- **OUI database**: Download the IEEE CSV files (MA-L, MA-M, MA-S) at build time and bundle in the container image. Provide a mechanism to update the database (manual file replacement or an update command). Parse into an in-memory lookup structure (Map keyed by prefix) at startup.
- **MAC normalization**: Always store and compare MACs in lowercase, colon-separated format. Accept input in any common format (uppercase, dash-separated, no separator) and normalize before storage/lookup.
- **Merge/split data integrity**: Merges and splits must be atomic database transactions. A failed merge/split must leave the database unchanged. Record all merge/split operations in an audit trail for reversibility.
- **Performance**: OUI lookup should be O(1) per device (hash map). Fingerprint comparison for randomized MACs is O(N) against existing devices — acceptable for networks up to ~500 devices (per NFR-5). For larger networks, consider indexing by hostname prefix.
- **VMs and containers on the scanned network**: Virtual machines and Docker containers on scanned hosts will have their own MAC addresses (often in the `02:42:*` range for Docker). These are valid devices but should be recognizable via their OUI (or lack thereof). Consider adding a "virtual" flag based on known VM/container MAC ranges.

## Edge Cases & Error Handling
- **Multiple MACs on one physical device**: Devices with multiple network interfaces (e.g., Ethernet + Wi-Fi) will appear as separate devices initially. Users can manually merge them. The system should suggest merges when devices share the same hostname but have different MACs.
- **VMs and Docker containers on scanned network**: Containers using Docker's default bridge have MACs starting with `02:42:`. VMs often use vendor-specific OUI ranges (e.g., VMware `00:0c:29`, VirtualBox `08:00:27`). The OUI lookup will identify these. Consider auto-tagging with a "Virtual" label.
- **MAC address cloning/spoofing**: Two devices could have the same MAC (cloning). If the same MAC is seen at two different IPs in the same scan, log a warning and create separate device records with a "MAC conflict" flag.
- **OUI database staleness**: New manufacturers may not be in the bundled database. Log a warning periodically if the database is older than 6 months. Provide a CLI command or API endpoint to trigger an OUI database refresh.
- **Hostname changes**: A device may change its hostname (e.g., after an OS update). Record hostname history similar to IP history. Do not break identity matching solely because hostname changed — MAC is primary.
- **Device factory reset**: A device that is factory reset may get a new randomized MAC and a default hostname, making it unrecognizable. This is expected — it will appear as a new device. The user can manually merge if needed.
- **Empty fingerprint**: If a device is discovered by ARP only (MAC + IP, no hostname, no services, no mDNS), the fingerprint is minimal. The device is still tracked by MAC. Fingerprint enrichment will improve in subsequent scans as more data is collected.

## Configuration

| Parameter | Env Variable | Default | Description |
|-----------|-------------|---------|-------------|
| Auto-merge threshold | `FINGERPRINT_AUTO_MERGE_THRESHOLD` | `0.9` | Similarity score above which randomized-MAC devices are auto-merged (0.0–1.0) |
| Suggest-merge threshold | `FINGERPRINT_SUGGEST_MERGE_THRESHOLD` | `0.7` | Similarity score above which a potential duplicate is flagged for user review (0.0–1.0) |
| Hostname weight | `FP_WEIGHT_HOSTNAME` | `0.4` | Weight of hostname match in similarity score |
| OUI weight | `FP_WEIGHT_OUI` | `0.1` | Weight of OUI/vendor match in similarity score |
| Service weight | `FP_WEIGHT_SERVICES` | `0.3` | Weight of service profile overlap in similarity score |
| mDNS/SSDP weight | `FP_WEIGHT_MDNS` | `0.2` | Weight of mDNS/SSDP name match in similarity score |
| OUI database path | `OUI_DB_PATH` | `/data/oui/` | Path to the IEEE OUI database files inside the container |

## Dependencies
- **Features this depends on:** F1 (Discovery — provides raw device records with MAC, IP, and discovery method), F6 (DNS/mDNS/SSDP — provides hostname, mDNS name, SSDP data for fingerprint enrichment)
- **Features that depend on this:** F4 (Storage — persists fingerprinted device records), F7 (Alerts — uses fingerprint to determine "new" vs "known" device), F8 (Presence Tracking — tracks presence per device identity), F9 (Tagging & Naming — attaches metadata to fingerprinted device identity), F10 (Dashboard — displays device identity information)
