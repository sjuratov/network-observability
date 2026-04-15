@inc-01 @f1
Feature: Network Device Discovery
  As a network administrator
  I want the application to discover all active devices on my network
  So that I have visibility into what is connected without manual inventory

  # --- Subnet Auto-Detection ---

  @must
  Scenario: Subnets auto-detected when none are configured
    Given no subnets are manually configured
    And the host has non-loopback IPv4 network interfaces
    When a scan is initiated
    Then subnets are derived from the host's network interfaces
    And loopback and Docker bridge interfaces are excluded
    And the auto-detected subnets are used as scan targets

  @must
  Scenario: Only manually configured subnets are scanned when specified
    Given the subnets "192.168.1.0/24" and "10.0.0.0/24" are configured
    When a scan is initiated
    Then only "192.168.1.0/24" and "10.0.0.0/24" are scanned
    And auto-detected subnets are ignored

  # --- Network Scanning ---

  @must
  Scenario: Scan discovers devices on a configured subnet
    Given the subnet "192.168.1.0/24" is configured
    And active devices exist on the subnet
    When a network scan runs on the subnet
    Then each discovered device has an IP address
    And each discovered device has a MAC address when available
    And each discovered device has at least one discovery method recorded

  @must
  Scenario: ARP discovery finds devices on the local subnet
    Given the application is running with host networking
    And the subnet "192.168.1.0/24" is configured
    When an ARP scan runs on the subnet
    Then devices responding to ARP requests are discovered
    And each ARP-discovered device has both a MAC address and an IP address
    And the discovery method is recorded as "arp"

  @must
  Scenario: ICMP ping sweep discovers responsive devices
    Given the subnet "192.168.1.0/24" is configured
    When an ICMP ping sweep runs on the subnet
    Then devices responding to ICMP echo requests are discovered
    And the discovery method is recorded as "icmp"

  @must
  Scenario: TCP SYN scan discovers devices with open ports
    Given the subnet "192.168.1.0/24" is configured
    When a TCP SYN scan runs on common ports
    Then devices with open ports are discovered
    And the discovery method is recorded as "tcp"

  # --- Multi-Method Discovery & Deduplication ---

  @must
  Scenario: Device found by multiple methods produces a single record
    Given a device at "192.168.1.50" with MAC "AA:BB:CC:DD:EE:FF"
    And the device responds to both ARP and ICMP probes
    When the scan completes using ARP and ICMP methods
    Then a single device record exists for MAC "AA:BB:CC:DD:EE:FF"
    And the discovery methods include "arp" and "icmp"

  @must
  Scenario: Device responding to only one method is still discovered
    Given a device at "192.168.1.60" that responds only to ARP
    And the device does not respond to ICMP or TCP probes
    When the scan completes using all discovery methods
    Then the device is present in the results
    And the discovery method is recorded as "arp"

  @must
  Scenario: Deduplication merges MAC address from ARP with IP from ICMP
    Given an ARP scan discovers MAC "AA:BB:CC:DD:EE:FF" at IP "192.168.1.50"
    And an ICMP scan discovers a responding host at IP "192.168.1.50"
    When the results are merged
    Then a single device record exists with MAC "AA:BB:CC:DD:EE:FF" and IP "192.168.1.50"
    And the discovery methods include both "arp" and "icmp"

  # --- Persisting Results ---

  @must
  Scenario: Discovered devices are persisted to the database
    Given the database is initialized
    And a scan discovers 5 devices on the subnet
    When the scan results are saved
    Then 5 device records exist in the database
    And 5 scan_results records are linked to the scan
    And each scan_results record contains the IP, MAC, and discovery method

  @must
  Scenario: New device is added to the database on first discovery
    Given the database is initialized
    And no device with MAC "AA:BB:CC:DD:EE:FF" exists
    When a scan discovers a device with MAC "AA:BB:CC:DD:EE:FF" at IP "192.168.1.42"
    Then a new device record is created with MAC "AA:BB:CC:DD:EE:FF"
    And the device first_seen_at is set to the scan timestamp
    And a scan_results record links the device to the scan

  @must
  Scenario: Known device is updated on subsequent discovery
    Given a device with MAC "AA:BB:CC:DD:EE:FF" was discovered in a previous scan
    When a new scan discovers the same MAC at IP "192.168.1.42"
    Then the existing device record is updated
    And the device last_seen_at is set to the new scan timestamp
    And a new scan_results record is created for this scan

  # --- Scan Metadata ---

  @must
  Scenario: Scan metadata records timing and device count
    Given the database is initialized
    When a scan starts at "2024-01-15T10:00:00Z"
    And the scan discovers 8 devices
    And the scan completes at "2024-01-15T10:03:00Z"
    Then the scan record has started_at "2024-01-15T10:00:00Z"
    And the scan record has completed_at "2024-01-15T10:03:00Z"
    And the scan record has devices_found equal to 8
    And the scan status is "completed"

  @must
  Scenario: Scan metadata records the scanned subnets
    Given the subnets "192.168.1.0/24" and "10.0.0.0/24" are configured
    When a scan completes
    Then the scan record includes both "192.168.1.0/24" and "10.0.0.0/24" in subnets_scanned

  # --- Health Endpoint ---

  @must
  Scenario: Health endpoint returns OK with database status
    Given the application is running
    And the database is connected
    When a GET request is made to "/api/v1/health"
    Then the response status code is 200
    And the response body contains "status" equal to "ok"
    And the response body contains "database" equal to "connected"

  @should
  Scenario: Health endpoint reports database disconnected when unavailable
    Given the application is running
    And the database is not accessible
    When a GET request is made to "/api/v1/health"
    Then the response body contains "database" equal to "disconnected"

  # --- Error Handling ---

  @must
  Scenario: Scan handles network timeout gracefully
    Given the subnet "10.0.0.0/24" is configured
    When a scan encounters a network timeout on the subnet
    Then the scan completes with status "completed" or "failed"
    And the error is recorded in the scan record
    And the application continues running
    And partial results from other subnets or methods are preserved

  @must
  Scenario: Scan handles permission denied for raw sockets
    Given the application lacks NET_RAW capability
    When a scan is initiated
    Then ARP scanning is skipped with a logged warning
    And ICMP and TCP SYN scanning are attempted as fallback methods
    And the application does not crash

  @must
  Scenario: Scan logs progress and summary statistics
    Given the subnet "192.168.1.0/24" is configured
    When a scan runs on the subnet
    Then the scan start is logged
    And the subnet being scanned is logged
    And the total unique devices found is logged
    And the scan duration is logged
    And all log entries use structured JSON format
