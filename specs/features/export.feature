@inc-07 @f12
Feature: Data Export
  As a network administrator
  I want to export device inventory and scan data in CSV and JSON formats
  So that I can produce compliance reports and feed data into external systems

  # --- Device Export ---

  @must
  Scenario: Export devices as CSV with correct columns
    Given 3 devices exist in the system
    When devices are exported as CSV
    Then the CSV header row contains "id,display_name,mac_address,current_ip,vendor,hostname,status,tags,first_seen,last_seen,open_ports,notes,is_known"
    And the CSV contains 3 data rows
    And each row has values matching the device records

  @must
  Scenario: Export devices as JSON array
    Given 3 devices exist in the system
    When devices are exported as JSON
    Then the response is a JSON object with "exportedAt", "totalCount", and "devices" fields
    And "totalCount" equals 3
    And each device object includes "id", "macAddress", "currentIp", "vendor", and "status"

  # --- Scan Export ---

  @must
  Scenario: Export scans as CSV
    Given 5 completed scans exist in the system
    When scans are exported as CSV
    Then the CSV header row contains "scan_id,started_at,completed_at,duration_seconds,status,devices_found,new_devices"
    And the CSV contains 5 data rows

  @must
  Scenario: Export scans as JSON
    Given 5 completed scans exist in the system
    When scans are exported as JSON
    Then the response is a JSON object with "exportedAt", "totalCount", and "scans" fields
    And "totalCount" equals 5
    And each scan object includes "id", "startedAt", "status", and "devicesFound"

  # --- Filtering ---

  @must
  Scenario: Export with date range filter
    Given scans exist from "2024-01-01" through "2024-06-30"
    When scans are exported as CSV with from "2024-03-01" and to "2024-04-01"
    Then only scans with start times in March 2024 are included
    And scans from other months are excluded

  @must
  Scenario: Export respects active device filters
    Given 10 devices exist with various tags and statuses
    And 3 devices have the tag "IoT"
    When devices are exported as CSV with filter tag "IoT"
    Then the CSV contains exactly 3 data rows
    And all exported devices have the tag "IoT"

  # --- CSV Escaping ---

  @must
  Scenario: CSV uses RFC 4180 escaping
    Given a device has notes containing a comma, a double quote, and a newline
    When devices are exported as CSV
    Then the notes field is wrapped in double quotes
    And any embedded double quotes are escaped by doubling them
    And the CSV is valid per RFC 4180

  # --- Filename Generation ---

  @must
  Scenario: Export filename includes timestamp
    Given the current time is "2024-06-15T14:30:00Z"
    When a device CSV export filename is generated
    Then the filename is "devices_2024-06-15_14-30-00.csv"

  # --- Empty Results ---

  @must
  Scenario: Empty export returns headers-only CSV or empty JSON array
    Given no devices match the current filters
    When devices are exported as CSV
    Then the CSV contains only the header row with zero data rows
    When devices are exported as JSON
    Then the JSON "devices" array is empty and "totalCount" is 0

  # --- Streaming ---

  @should
  Scenario: Large export streams without memory issues
    Given 50000 devices exist in the system
    When devices are exported as CSV
    Then the response uses chunked transfer encoding
    And the server does not buffer all rows in memory at once
