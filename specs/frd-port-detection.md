# FRD: Port & Service Detection

## Feature ID
F5

## Overview
Detect open TCP and UDP ports on discovered network devices and identify the services running on those ports through banner grabbing and service version probes. Port and service information enriches device fingerprints, aids in device classification (e.g., printers expose port 631/IPP), and provides security visibility. Changes in port state between scans are tracked as part of device history.

## PRD References
- PRD Feature: F5 (Port & Service Detection)
- Related Features: F1 (Discovery — provides the device list to scan), F2 (Fingerprinting — port/service data feeds composite fingerprint), F4 (Storage — port results persisted in scan_results), F8 (Presence — port changes are state change events), F10 (Dashboard — port history displayed in device detail), F11 (REST API — port data queryable)

## User Stories

1. **As a security-conscious user**, I want to see all open ports on every device so that I can identify unexpected services that may indicate compromise or misconfiguration.
2. **As a home network admin**, I want to know what services each device is running (HTTP, SSH, SMB) so that I can understand what each device does on my network.
3. **As a small business IT admin**, I want to track port changes over time so that I can detect when new services appear or existing ones disappear on critical devices.
4. **As a user**, I want configurable port scan ranges so that I can balance between scan thoroughness and scan duration based on my needs.
5. **As a security-conscious user**, I want service version detection so that I can identify outdated or vulnerable service versions on my network devices.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F5.1 | Detect open TCP ports on discovered devices using SYN scan (or connect scan as fallback) | Must | SYN scan requires raw socket privileges (container runs as root) |
| F5.2 | Detect open UDP ports on discovered devices | Should | UDP scanning is slow and unreliable; limit to well-known ports by default |
| F5.3 | Perform service version detection on open ports via banner grabbing | Should | Send protocol-specific probes; parse response banners |
| F5.4 | Track port and service changes between consecutive scans per device | Must | Diff current vs previous scan; record adds/removes/changes in device_history |
| F5.5 | Configurable port scan range with presets | Must | Presets: `top-100`, `top-1000` (default), `top-5000`, `all` (1-65535), or custom range |
| F5.6 | Identify common services by port number and banner | Must | Map: 22→SSH, 80→HTTP, 443→HTTPS, 53→DNS, 67-68→DHCP, 445→SMB, 631→IPP, 5353→mDNS, 8080→HTTP-Alt |
| F5.7 | Port scan runs as part of the enrichment phase after device discovery | Must | Sequential: discover devices → enrich with ports → store results |
| F5.8 | Support scan intensity profiles that affect port scanning depth | Should | `quick`=top-100 TCP only, `normal`=top-1000 TCP, `thorough`=top-5000 TCP + top-100 UDP + version detection |
| F5.9 | Configurable per-host timeout and rate limiting | Must | Prevent network disruption; respect NFR about non-disruptive scanning |
| F5.10 | Store port results as structured data per device per scan | Must | JSON array in `scan_results.open_ports`: `[{port, protocol, state, service, version, banner}]` |

## Acceptance Criteria

### AC-1: TCP Port Detection
- **Given** a device at 192.168.1.10 with ports 22 (SSH) and 80 (HTTP) open
- **When** a scan completes with default port range (top-1000)
- **Then** the device's scan result includes `open_ports` with entries for port 22/tcp and 80/tcp
- **And** each entry includes at minimum: port number, protocol (tcp), and state (open)

### AC-2: Service Version Detection
- **Given** a device running OpenSSH 8.9 on port 22
- **When** a thorough scan completes with version detection enabled
- **Then** the port entry includes `service: "ssh"` and `version: "OpenSSH 8.9"` (or similar parsed banner)

### AC-3: Port Change Tracking
- **Given** a device had ports [22, 80] open in the previous scan
- **When** the next scan finds ports [22, 80, 443] open (port 443 newly opened)
- **Then** a `device_history` record is created with `field=ports`, `old_value=[22,80]`, `new_value=[22,80,443]`
- **And** the dashboard can display "Port 443/tcp opened" as a timeline event

### AC-4: Port Closure Detection
- **Given** a device had ports [22, 80, 8080] open in the previous scan
- **When** the next scan finds ports [22, 80] open (port 8080 closed)
- **Then** a `device_history` record is created reflecting the port removal
- **And** the change is visible in the device's history timeline

### AC-5: Scan Intensity Profiles
- **Given** scan intensity is set to `quick`
- **When** a scan runs
- **Then** only the top 100 TCP ports are scanned per device
- **And** no UDP scanning or version detection is performed
- **And** the scan completes significantly faster than `normal` or `thorough` profiles

### AC-6: Custom Port Range
- **Given** the port range is configured to `1-65535`
- **When** a scan runs
- **Then** all 65,535 TCP ports are scanned on each device
- **And** the scan duration is proportionally longer (logged as a warning if >10 minutes per host)

### AC-7: Rate Limiting
- **Given** rate limiting is configured to max 100 packets/second
- **When** a port scan runs against 50 devices
- **Then** the scan does not exceed the configured packet rate
- **And** no devices report the scanner as abusive or block it

## Technical Considerations

### TCP Scanning Approach
1. **SYN scan (preferred)**: Send TCP SYN packets; open ports reply with SYN-ACK, closed ports reply with RST. Requires raw socket privileges (available in Docker with `--net=host` and root).
2. **Connect scan (fallback)**: Full TCP three-way handshake. Slower but works without raw sockets. Used if SYN scan is unavailable.
3. **Implementation**: Use `nmap` CLI wrapper or a native Node.js raw socket library. Nmap is preferred for reliability and is included in the Docker image.

### UDP Scanning Approach
- UDP scanning is inherently unreliable (no guaranteed response from open ports)
- Limited to well-known UDP ports by default: 53 (DNS), 67-68 (DHCP), 123 (NTP), 161 (SNMP), 5353 (mDNS), 1900 (SSDP)
- Only performed in `thorough` scan intensity
- Timeout per port is longer than TCP (default: 2 seconds vs 500ms)

### Service Detection Methodology
1. **Port-to-service mapping**: Static lookup table for well-known ports (covers 90%+ of cases)
2. **Banner grabbing**: Connect to the port, read the initial banner (e.g., SSH sends version string immediately)
3. **Protocol probes**: For ports with no banner, send protocol-specific probes:
   - HTTP: `GET / HTTP/1.0\r\n\r\n` → parse `Server:` header
   - HTTPS: TLS handshake → extract certificate CN/SAN
   - SMTP: read banner (220 response)
   - FTP: read banner (220 response)
4. **Version parsing**: Extract version strings from banners using regex patterns

### Nmap Integration
- Nmap is the preferred scanning engine (installed in the Docker image)
- Invoked via CLI with XML output (`-oX -`) for structured parsing
- Command construction:
  - Quick: `nmap -sS -T4 --top-ports 100 -oX - <targets>`
  - Normal: `nmap -sS -T3 --top-ports 1000 -oX - <targets>`
  - Thorough: `nmap -sS -sU -sV -T3 --top-ports 5000 -oX - <targets>`
- Parse XML output to extract: host, port, state, service name, version, banner
- Fallback: If nmap is unavailable, use Node.js `net` module for TCP connect scans

### Port Change Tracking
- After each scan, compare current port list vs. the most recent previous scan for the same device
- Generate diff events:
  - `port_opened`: port in current scan but not in previous
  - `port_closed`: port in previous scan but not in current
  - `service_changed`: same port, different service or version string
- Store diffs in `device_history` table with `field=ports`
- The diff is computed in the application layer after scan results are collected

### Performance Considerations

| Scenario | Estimated Time | Notes |
|----------|---------------|-------|
| Quick scan, 50 hosts, top-100 TCP | ~30 seconds | Suitable for frequent scanning |
| Normal scan, 50 hosts, top-1000 TCP | ~3 minutes | Default; within 5-min NFR |
| Thorough scan, 50 hosts, top-5000 TCP + top-100 UDP + version | ~15 minutes | For periodic deep scans |
| Full scan, 50 hosts, all 65535 TCP | ~60+ minutes | Warn user in logs |

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Rate-limited or IDS-protected hosts | Respect rate limits configured in scan profile. If a host consistently drops packets, mark port scan as `partial` in results and log a warning. Do not retry aggressively. |
| Honeypots (all ports appear open) | If >500 ports report as open on a single host, flag the device as a potential honeypot in the scan results. Log a warning. Still store results but add a `honeypot_suspect` flag. |
| Port forwarding / NAT | Port scan results reflect what is reachable from the scanner's network position. No attempt to detect forwarding — document as a known limitation. |
| Firewall-filtered ports | Distinguish between `closed` (RST received) and `filtered` (no response / ICMP unreachable). Store the state (`open`, `closed`, `filtered`) per port. |
| Nmap not installed or crashes | Fall back to Node.js TCP connect scan for basic port detection. Log degraded mode. UDP and version detection are unavailable in fallback mode. |
| Scan timeout per host | Configurable per-host timeout (default: 60s for quick, 120s for normal, 300s for thorough). If exceeded, store partial results and move to next host. |
| Very large networks (>500 hosts) | Scan in batches of 50 hosts to limit memory usage and network impact. Log progress. |
| Privileged port scanning failure | If raw sockets fail (no root/capabilities), fall back to connect scan. Log a warning about reduced scan accuracy. |

## Configuration

| Parameter | Env Var | Default | Description |
|-----------|---------|---------|-------------|
| Port range preset | `PORT_SCAN_RANGE` | `top-1000` | Preset: `top-100`, `top-1000`, `top-5000`, `all`, or custom (e.g., `1-1024,3000-9000`) |
| UDP scanning | `PORT_SCAN_UDP` | `false` | Enable UDP scanning (only in `thorough` mode by default) |
| Version detection | `PORT_SCAN_VERSION` | `false` | Enable service version detection via banner grabbing |
| Per-host timeout | `PORT_SCAN_HOST_TIMEOUT` | `120` | Maximum seconds to spend scanning a single host |
| Rate limit | `PORT_SCAN_RATE` | `500` | Maximum packets per second |
| Scan batch size | `PORT_SCAN_BATCH_SIZE` | `50` | Number of hosts to scan concurrently |
| Nmap path | `NMAP_PATH` | `/usr/bin/nmap` | Path to nmap binary |

## Dependencies

- **nmap**: Primary scanning engine (installed in Docker image; version 7.90+)
- **Node.js `net` module**: Fallback TCP connect scanner
- **F1 (Discovery)**: Provides the list of discovered device IPs/MACs to scan
- **F4 (Storage)**: Port results stored in `scan_results.open_ports`; changes tracked in `device_history`
- **F2 (Fingerprinting)**: Port/service profile feeds into composite device fingerprint
- **F3 (Scheduler)**: Scan intensity profile determines port scanning depth
