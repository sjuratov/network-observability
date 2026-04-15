# FRD: DNS/mDNS/SSDP Resolution

## Feature ID
F6

## Overview
Resolve human-readable names and service information for discovered devices using three complementary protocols: reverse DNS (PTR lookups), mDNS (Bonjour/Avahi multicast discovery), and SSDP/UPnP (Simple Service Discovery Protocol). Discovered names enrich device profiles, improve identification of devices that lack distinctive MAC addresses or hostnames, and feed into the composite fingerprinting system as tertiary identity signals.

## PRD References
- PRD Feature: F6 (DNS/mDNS/SSDP Resolution)
- Related Features: F1 (Discovery — provides device IPs to resolve), F2 (Fingerprinting — resolved names are identity signals), F4 (Storage — resolution results persisted in scan_results), F5 (Port Detection — mDNS/SSDP use specific ports 5353/1900), F10 (Dashboard — resolved names shown in device profiles), F11 (REST API — name data queryable)

## User Stories

1. **As a home network admin**, I want devices to show friendly names (like "Living Room Apple TV" or "nas.local") instead of just IP addresses so that I can quickly identify what each device is.
2. **As a user**, I want the system to automatically discover device names from DNS, mDNS, and SSDP so that I don't have to manually label every device.
3. **As a security-conscious user**, I want to see all names associated with a device (DNS, mDNS, SSDP) so that I can verify device identity through multiple signals.
4. **As a small business IT admin**, I want name resolution results cached between scans so that devices retain their names even if the resolution protocol is temporarily unavailable.
5. **As a user**, I want mDNS and SSDP to passively discover devices that announce themselves so that I can identify IoT devices, smart speakers, printers, and media players without active probing.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F6.1 | Perform reverse DNS (PTR) lookup for all discovered IP addresses | Must | Query the configured DNS resolver for PTR records |
| F6.2 | Discover device names and services via mDNS (Bonjour/Avahi) | Should | Listen for multicast DNS announcements on 224.0.0.251:5353 |
| F6.3 | Discover devices via SSDP/UPnP protocol | Should | Send M-SEARCH on 239.255.255.250:1900; parse NOTIFY announcements |
| F6.4 | Integrate discovered names into device profiles as supplementary identity signals | Must | Names stored in scan_results and surfaced in device detail view |
| F6.5 | Cache DNS/mDNS/SSDP results between scans | Should | In-memory cache with configurable TTL; persisted to scan_results |
| F6.6 | Support multiple names per device (one DNS name + multiple mDNS services + SSDP info) | Must | All names stored; best name selected for display |
| F6.7 | Display name priority: user-assigned name > mDNS name > DNS PTR name > SSDP name > hostname > MAC address | Must | Determines `display_name` when user hasn't set one |
| F6.8 | mDNS discovery captures service type and instance name | Should | e.g., `_http._tcp.local` → "My Printer" |
| F6.9 | SSDP discovery retrieves device description XML for model/manufacturer info | Should | Parse UPnP device description from the Location URL |
| F6.10 | Name resolution runs as part of the enrichment phase after device discovery | Must | Parallel with port scanning where possible |

## Acceptance Criteria

### AC-1: Reverse DNS Resolution
- **Given** a device at 192.168.1.50 has a PTR record `nas.home.arpa`
- **When** the scan's enrichment phase runs
- **Then** the device's `scan_results.dns_names` includes `"nas.home.arpa"`
- **And** if no user-assigned name exists, the device's display name is set to `"nas.home.arpa"`

### AC-2: mDNS Name Discovery
- **Given** an Apple TV on the network announces via mDNS as `Living Room._airplay._tcp.local`
- **When** the mDNS listener captures the announcement
- **Then** the device's `scan_results.mdns_names` includes `{"instance": "Living Room", "service": "_airplay._tcp", "host": "AppleTV-XXXX.local"}`
- **And** the mDNS name is used as a display name candidate

### AC-3: SSDP/UPnP Discovery
- **Given** a Sonos speaker responds to SSDP M-SEARCH with a Location header pointing to its device description XML
- **When** the SSDP discovery fetches and parses the description
- **Then** the device's `scan_results.ssdp_info` includes `{"friendlyName": "Kitchen Sonos One", "manufacturer": "Sonos", "modelName": "Sonos One"}`

### AC-4: Name Caching
- **Given** a device's DNS PTR record was resolved to `printer.office.local` in the previous scan
- **When** the next scan's DNS lookup times out for that device
- **Then** the cached name `printer.office.local` is still used in the device profile
- **And** the cache entry is marked as stale with the original resolution timestamp

### AC-5: Multiple Names Per Device
- **Given** a device has DNS name `server.local`, mDNS name `MyServer._http._tcp.local`, and hostname `myserver`
- **When** the device detail is viewed
- **Then** all three names are displayed in the device profile under their respective categories
- **And** the display name follows the priority order (user > mDNS instance > DNS PTR > hostname)

### AC-6: Name Integration with Fingerprinting
- **Given** a device with a randomized MAC address has mDNS name `iPhone._companion-link._tcp.local`
- **When** the fingerprint correlation system runs
- **Then** the mDNS name is included as a tertiary signal for device identity matching

## Technical Considerations

### Reverse DNS Implementation
1. **PTR lookup**: For each discovered IP, query the DNS resolver for the PTR record (e.g., `50.1.168.192.in-addr.arpa`)
2. **Resolver selection**: Use the system's configured DNS resolver by default; support override via `DNS_RESOLVER` env var
3. **Timeout**: 2-second timeout per lookup to avoid blocking scan completion
4. **Batch processing**: Resolve all IPs in parallel (up to 20 concurrent lookups) to minimize total resolution time
5. **Implementation**: Use Node.js `dns.promises.reverse()` or the `dns` module

### mDNS Listener Approach
The system uses a **hybrid approach**: passive listening with periodic active queries.

1. **Passive listener**: A long-running UDP multicast listener on `224.0.0.251:5353` captures mDNS announcements as they occur. This runs continuously between scans.
2. **Active query (during scan)**: During the enrichment phase, send mDNS queries for common service types to prompt devices to announce:
   - `_http._tcp.local` — web servers, printers, NAS
   - `_airplay._tcp.local` — Apple devices
   - `_raop._tcp.local` — AirPlay audio
   - `_smb._tcp.local` — file shares
   - `_ipp._tcp.local` — printers
   - `_companion-link._tcp.local` — Apple devices
   - `_googlecast._tcp.local` — Chromecast devices
   - `_spotify-connect._tcp.local` — Spotify devices
3. **Parsing**: Extract instance name, service type, hostname, and TXT record data from mDNS responses
4. **Implementation**: Use a multicast DNS library (e.g., `multicast-dns` npm package) or raw UDP socket with mDNS packet parsing

### SSDP/UPnP Discovery Protocol
1. **M-SEARCH (active)**: During scan enrichment, send an SSDP M-SEARCH multicast to `239.255.255.250:1900`:
   ```
   M-SEARCH * HTTP/1.1
   HOST: 239.255.255.250:1900
   MAN: "ssdp:discover"
   MX: 3
   ST: ssdp:all
   ```
2. **NOTIFY (passive)**: Listen for SSDP NOTIFY multicast announcements on `239.255.255.250:1900`
3. **Device description**: For each responding device, fetch the XML description from the `LOCATION` header URL
4. **XML parsing**: Extract `friendlyName`, `manufacturer`, `modelName`, `modelDescription`, `serialNumber`, `UDN` from the UPnP device description XML
5. **Implementation**: Raw UDP socket for M-SEARCH/NOTIFY; HTTP client for description XML fetch; XML parser for description

### Name-to-Device Matching
Resolved names must be matched back to discovered devices:

| Protocol | Matching Strategy |
|----------|-------------------|
| Reverse DNS | Direct: PTR lookup is performed per IP address → match by IP |
| mDNS | By IP: mDNS responses include the IP in the A/AAAA record; also match by hostname/MAC if available |
| SSDP | By IP: SSDP responses come from a specific source IP; parse the LOCATION URL host for confirmation |

### Caching Strategy
1. **In-memory cache**: `Map<ip_address, CachedResolution>` with TTL per protocol:
   - DNS PTR: TTL from DNS response, or default 1 hour
   - mDNS: 75 minutes (mDNS default TTL is 75 min per RFC 6762)
   - SSDP: 30 minutes (or from `CACHE-CONTROL: max-age` header)
2. **Stale-while-revalidate**: If a cache entry is expired but the new lookup fails, use the stale value and mark it as stale
3. **Persistence**: Cache is rebuilt from the latest `scan_results` entries on application restart (no separate cache persistence)
4. **Cache invalidation**: Full cache clear available via API (`POST /api/cache/clear`)

### Display Name Resolution Order
When determining the display name for a device (if no user-assigned name exists):
1. mDNS instance name (most human-friendly, e.g., "Living Room Apple TV")
2. DNS PTR name (e.g., "nas.home.arpa")
3. SSDP friendly name (e.g., "Kitchen Sonos One")
4. DHCP hostname (from discovery, e.g., "DESKTOP-ABC123")
5. Vendor + MAC suffix (e.g., "Apple Device (XX:XX)")
6. MAC address as last resort

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Stale DNS records | PTR records that point to decommissioned hostnames are still stored but marked with resolution timestamp. The cache TTL ensures they are re-resolved periodically. If a PTR changes between scans, record the change in `device_history`. |
| Multiple PTR records per IP | Some IPs have multiple PTR records (e.g., shared hosting). Store all records in the `dns_names` JSON array. Use the first record for display name. |
| Split-horizon DNS | Internal and external DNS may return different PTR records. The scanner uses whatever resolver is configured (default: system resolver, which typically returns internal names). Document as a known behavior. |
| mDNS listener fails to bind | If the multicast socket fails to bind (port 5353 in use), log a warning and skip mDNS discovery. Fall back to DNS-only resolution. Do not fail the scan. |
| SSDP description XML fetch timeout | Set a 5-second timeout for fetching device description XML. If it times out, store the basic SSDP response headers (USN, ST, SERVER) without the detailed description. |
| SSDP description XML parse error | If the XML is malformed, store the raw XML snippet (truncated to 1KB) in `ssdp_info` for debugging. Log a warning. |
| Device responds to mDNS but not to discovery scan | If an mDNS announcement arrives from an IP not in the current scan results, create a pending device entry. It will be confirmed or discarded in the next active scan. |
| Network without mDNS/SSDP devices | If no mDNS or SSDP responses are received, log at debug level and continue. Do not warn — many networks have no mDNS/SSDP devices. |
| High volume of mDNS traffic | Rate-limit mDNS announcement processing to 100/second. Drop excess announcements with a debug log. This prevents memory issues on networks with many announcing devices. |
| IPv6 link-local mDNS responses | Ignore IPv6 mDNS responses (IPv6 is out of scope per PRD). Log at debug level. |
| DNS resolver unreachable | If the DNS resolver is unreachable, retry once with a 3-second timeout. If still unreachable, skip DNS resolution for this scan, use cached values, and log a warning. |

## Configuration

| Parameter | Env Var | Default | Description |
|-----------|---------|---------|-------------|
| DNS resolver | `DNS_RESOLVER` | System default | DNS server IP for PTR lookups (e.g., `192.168.1.1`) |
| DNS timeout | `DNS_TIMEOUT_MS` | `2000` | Timeout per DNS lookup in milliseconds |
| DNS concurrency | `DNS_CONCURRENCY` | `20` | Max parallel DNS lookups |
| mDNS enabled | `MDNS_ENABLED` | `true` | Enable mDNS passive listener and active queries |
| mDNS query services | `MDNS_SERVICES` | *(built-in list)* | Comma-separated mDNS service types to query |
| SSDP enabled | `SSDP_ENABLED` | `true` | Enable SSDP/UPnP discovery |
| SSDP MX timeout | `SSDP_MX` | `3` | SSDP M-SEARCH MX value (max wait in seconds) |
| Cache TTL (DNS) | `DNS_CACHE_TTL_SEC` | `3600` | Default DNS cache TTL in seconds |
| Cache TTL (mDNS) | `MDNS_CACHE_TTL_SEC` | `4500` | mDNS cache TTL (default: 75 min per RFC 6762) |
| Cache TTL (SSDP) | `SSDP_CACHE_TTL_SEC` | `1800` | SSDP cache TTL in seconds |

## Dependencies

- **Node.js `dns` module**: Built-in DNS resolver for PTR lookups
- **`multicast-dns` npm package** (or equivalent): mDNS multicast listener and query sender
- **Node.js `dgram` module**: Raw UDP socket for SSDP M-SEARCH and NOTIFY
- **XML parser** (e.g., `fast-xml-parser`): Parse UPnP device description XML
- **F1 (Discovery)**: Provides the list of IP addresses to resolve
- **F2 (Fingerprinting)**: Resolved names feed into composite fingerprint as tertiary signals
- **F4 (Storage)**: Resolution results stored in `scan_results.dns_names`, `scan_results.mdns_names`, `scan_results.ssdp_info`
- **F5 (Port Detection)**: mDNS uses port 5353, SSDP uses port 1900 (coordination for scan results)
