# FRD: Network Device Discovery

## Feature ID
F1

## Overview
Network Device Discovery is the foundational scanning capability of the application. It detects all active devices on local network subnets using multiple complementary techniques (ARP, ICMP, TCP SYN), auto-detects subnets from the host's network interfaces, and produces a unified device list that feeds into fingerprinting, enrichment, and storage. The scanner runs inside a Docker container with host networking to enable Layer 2 (ARP) scanning.

## PRD References
- PRD Feature: F1 (Network Device Discovery)
- Related Features: F2 (Fingerprinting consumes discovery results), F3 (Scheduler triggers discovery), F5 (Port & Service Detection runs alongside discovery), F13 (Configuration provides subnet/intensity settings)

## User Stories
- As a **Home Network Admin**, I want the application to automatically find all devices on my network without any configuration, so that I get instant visibility after running the Docker container.
- As a **Small Business IT** operator, I want to specify multiple subnets to scan, so that I can cover VLANs and segmented networks.
- As a **Security-Conscious User**, I want discovery to use multiple scanning techniques, so that devices which block one method (e.g., ICMP) are still detected.
- As a **Home Network Admin**, I want the scan to complete quickly without disrupting my network, so that streaming and video calls are unaffected during scans.
- As a **Small Business IT** operator, I want to see which discovery method found each device, so that I can troubleshoot network visibility issues.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F1.1 | Discover devices via ARP scan on local subnets | Must | ARP is the most reliable method on local L2 segments. Requires host networking mode. Sends ARP who-has requests for every IP in the subnet and collects responses. |
| F1.2 | Discover devices via ICMP echo (ping sweep) | Must | Sends ICMP Echo Request to each IP. Works across L3 boundaries. Many devices/firewalls block ICMP — use as supplementary to ARP. |
| F1.3 | Discover devices via TCP SYN scan on common ports | Must | Send SYN packets to a small set of commonly-open ports (22, 53, 80, 443, 445, 8080). A SYN-ACK or RST confirms the host is alive. Catches devices that block ARP and ICMP. |
| F1.4 | Auto-detect local subnets from the container's network interfaces | Must | Read all non-loopback IPv4 interfaces, extract IP and netmask, compute the CIDR subnet. Skip Docker bridge interfaces (docker0, br-*, veth*). Present detected subnets in logs on startup. |
| F1.5 | Support manual subnet configuration override (single or multiple subnets) | Must | Accept a comma-separated list of CIDR notations (e.g., `192.168.1.0/24,10.0.0.0/16`). When set, completely replaces auto-detected subnets. Validate CIDR format on startup. |
| F1.6 | Support IPv4 networks | Must | All scanning operates on IPv4 only. IPv6 is out of scope per PRD. |
| F1.7 | Discovery must be thorough but not disruptive to network operations | Must | Implement rate limiting: configurable max packets-per-second (default: 500 pps). Add configurable inter-probe delay. Respect scan intensity profiles from F3. |
| F1.8 | Combine results from all discovery methods into a unified device list | Must | De-duplicate by MAC address (preferred) or IP address. Record which method(s) discovered each device. Merge data from all methods into a single device record per physical device. |
| F1.9 | Log scan progress and summary statistics | Must | Log: scan start, subnet being scanned, method in use, devices found per method, total unique devices, scan duration, errors. Use structured JSON logging. |

## Acceptance Criteria

### AC-1: Host Networking Discovery
- Given the application is running in Docker with `--network=host`
- When a scan is triggered on a /24 subnet
- Then all active devices on that subnet are discovered within 5 minutes (normal intensity)
- And each device record includes at minimum: IP address, MAC address (when available), and discovery method

### AC-2: Subnet Auto-Detection
- Given no manual subnet configuration is provided (SUBNETS env var is unset)
- When the application starts
- Then it reads all non-loopback IPv4 network interfaces
- And computes the CIDR subnets from IP/netmask pairs
- And excludes Docker virtual interfaces (docker0, br-*, veth*)
- And logs the detected subnets at info level

### AC-3: Manual Subnet Override
- Given `SUBNETS=192.168.1.0/24,10.0.0.0/24` is configured
- When a scan runs
- Then only 192.168.1.0/24 and 10.0.0.0/24 are scanned
- And auto-detected subnets are completely ignored

### AC-4: Multi-Method Resilience
- Given a device responds to ARP but not ICMP or TCP SYN (e.g., a simple IoT sensor)
- When the scan completes
- Then the device still appears in the unified results
- And the discovery method is recorded as "arp"

### AC-5: Unified Device List De-duplication
- Given a device is found by ARP (yielding MAC + IP) and by ICMP (yielding IP only)
- When results are combined
- Then a single device record exists with the MAC from ARP and the IP confirmed by both methods
- And discovery_methods includes both "arp" and "icmp"

### AC-6: Invalid Subnet Rejection
- Given `SUBNETS=not-a-subnet` is configured
- When the application starts
- Then it exits with exit code 1
- And logs a clear error: "Invalid subnet configuration: 'not-a-subnet' is not a valid CIDR notation"

### AC-7: Rate Limiting
- Given scan intensity is set to "normal" (500 pps default)
- When a scan runs on a /24 subnet
- Then the scanner does not exceed the configured packets-per-second rate
- And network throughput for other devices is not noticeably degraded

## Technical Considerations
- **ARP scanning** requires raw socket access, which is only available with Docker host networking (`--network=host`) or `NET_RAW` capability. The application should detect if it lacks this capability and log a warning (ARP scanning will be skipped, falling back to ICMP + TCP SYN).
- **Scanning library**: Use a Node.js-native approach with raw sockets or leverage a subprocess call to a tool like `arp-scan` or `nmap` installed in the container image. Evaluate trade-offs: native sockets give more control; subprocess is more battle-tested.
- **Subnet auto-detection**: Use `os.networkInterfaces()` in Node.js. Filter by `family: 'IPv4'`, `internal: false`. Compute CIDR from address + netmask using bitwise operations or a CIDR utility library.
- **Docker bridge filtering**: Filter out interfaces matching patterns: `docker0`, `br-*`, `veth*`, `cni*`, `flannel*`. Make the exclusion pattern configurable for edge cases.
- **Concurrency**: Scan multiple subnets sequentially (to avoid overwhelming the network) but parallelize probes within a subnet up to the rate limit.
- **Performance target**: NFR-4 requires scanning a /24 in under 5 minutes at normal intensity. Budget: ~1 second per host × 254 hosts = ~4.2 minutes (comfortable margin with parallelism).

## Edge Cases & Error Handling
- **Firewalled devices**: Some devices drop all probes silently. These will not be discovered — this is expected. Log a summary of "unreachable IPs" at debug level.
- **Devices that respond only to one method**: The multi-method approach (ARP + ICMP + TCP SYN) maximizes coverage. A device only needs to respond to ONE method to be discovered.
- **Large subnets**: A /16 subnet has 65,534 hosts. Scanning should still work but will take significantly longer. Log an estimated completion time. Consider warning the user if subnet is larger than /20.
- **No network interfaces found**: If no non-loopback IPv4 interfaces are detected, log an error and exit with a clear message ("No scannable network interfaces found. Is Docker running with --network=host?").
- **Permission errors**: If raw socket operations fail (no NET_RAW), gracefully degrade: skip ARP, rely on ICMP + TCP SYN. Log a warning explaining reduced discovery capability.
- **Scan timeout**: If a scan takes longer than a configurable maximum (default: 30 minutes), abort and record a partial result with status "timeout".
- **Interface changes during scan**: If a network interface goes down mid-scan, catch the error, log it, and continue with remaining interfaces/methods.

## Configuration

| Parameter | Env Variable | Default | Description |
|-----------|-------------|---------|-------------|
| Target subnets | `SUBNETS` | Auto-detected | Comma-separated CIDR list (e.g., `192.168.1.0/24,10.0.0.0/24`) |
| Packets per second | `SCAN_RATE_LIMIT` | `500` | Maximum probe packets per second to limit network impact |
| Scan timeout | `SCAN_TIMEOUT` | `1800` (30 min) | Maximum duration in seconds before a scan is aborted |
| Interface exclude pattern | `IFACE_EXCLUDE` | `docker0,br-*,veth*,cni*` | Comma-separated interface name patterns to exclude from auto-detection |
| TCP SYN probe ports | `TCP_PROBE_PORTS` | `22,53,80,443,445,8080` | Comma-separated list of ports used for TCP SYN discovery |
| Discovery methods | `DISCOVERY_METHODS` | `arp,icmp,tcp` | Comma-separated list of methods to use. Allows disabling specific methods. |

## Dependencies
- **Features this depends on:** F13 (Configuration Management — provides env var / config file parsing and validation)
- **Features that depend on this:** F2 (Fingerprinting — consumes raw device records), F3 (Scheduler — triggers scan execution), F4 (Storage — persists scan results), F5 (Port & Service Detection — extends discovery with port scanning), F8 (Presence Tracking — consumes online/offline data from scans)
