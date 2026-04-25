@inc-06 @f10
Feature: Dashboard & Visualization
  As a network admin
  I want a web dashboard showing network status, device inventory, and scan history
  So that I can monitor my network at a glance and investigate device details

  # --- Overview Dashboard ---

  @must
  Scenario: Dashboard displays total device count
    Given 50 devices have been discovered on the network
    When the dashboard overview page loads
    Then the "Total Devices" metric card displays "50"

  @must
  Scenario: Dashboard shows new devices in last 24 hours
    Given 50 devices exist and 3 were first seen within the last 24 hours
    When the dashboard overview page loads
    Then the "New (24h)" metric card displays "3"

  @must
  Scenario: Dashboard shows online device count
    Given 50 devices exist and 5 are currently offline
    When the dashboard overview page loads
    Then the "Online" metric card displays "45"

  @must
  Scenario: Dashboard shows offline device count
    Given 50 devices exist and 5 are currently offline
    When the dashboard overview page loads
    Then the "Offline" metric card displays "5"

  @must
  Scenario: Dashboard metric cards appear in correct order
    Given 50 devices exist and 3 were first seen within the last 24 hours
    And 5 are currently offline
    When the dashboard overview page loads
    Then the metric cards appear in order: "Total Devices", "New (24h)", "Online", "Offline", "Last Scan"

  @must
  Scenario: Dashboard shows last scan status and timestamp
    Given the most recent scan completed at "2024-01-15T12:00:00Z" with status "completed"
    When the dashboard overview page loads
    Then the "Last Scan" metric card displays the formatted timestamp and status "completed"

  @must
  Scenario: Scan Now button triggers manual scan
    Given no scan is currently in progress
    When the user clicks the "Scan Now" button
    And the user confirms the scan in the confirmation dialog
    Then a POST request is sent to "/api/v1/scans"
    And the scan progress bar becomes visible with status "Scanning…"
    And the "Scan Now" button is disabled

  @must
  Scenario: Empty state shown on first run
    Given no devices have been discovered and no scans have been run
    When the dashboard overview page loads
    Then an empty state is displayed with title "No Devices Yet"
    And a call-to-action button "Run Your First Scan" is shown

  # --- Device Breakdown Chart ---

  @must
  Scenario: Device Breakdown defaults to Vendor view
    Given devices exist with vendors "Apple" (12), "Samsung" (8), "TP-Link" (5), and "Unknown" (3)
    When the dashboard overview page loads
    Then a "Device Breakdown" section is visible
    And the breakdown dropdown defaults to "By Vendor"
    And a horizontal bar chart displays vendors sorted descending by count
    And the first bar is "Apple" with count 12

  @must
  Scenario: Device Breakdown dropdown switches to Tag view
    Given devices exist with tags "IoT" (14), "Workstation" (10), and "Untagged" (7)
    When the user selects "By Tag" from the breakdown dropdown
    Then the bar chart updates to show tags sorted descending by count
    And the first bar is "IoT" with count 14

  @must
  Scenario: Device Breakdown dropdown switches to Status view
    Given 45 devices are online and 2 are offline
    When the user selects "By Status" from the breakdown dropdown
    Then the bar chart shows "Online" with count 45 and "Offline" with count 2

  @must
  Scenario: Device Breakdown supports Discovery Method grouping
    Given devices exist with discovery methods "arp" (38), "ping" (6), and "mdns" (3)
    When the user selects "By Discovery Method" from the breakdown dropdown
    Then the bar chart displays discovery methods sorted descending by count

  @must
  Scenario: Device Breakdown supports Device Age grouping
    Given devices exist with various first-seen dates
    When the user selects "By Device Age" from the breakdown dropdown
    Then the bar chart displays age buckets: "< 1 day", "1–7 days", "7–30 days", "30+ days"
    And buckets are sorted descending by count

  @must
  Scenario: Device Breakdown supports Known/Unknown grouping
    Given 32 devices are known and 15 are unknown
    When the user selects "By Known / Unknown" from the breakdown dropdown
    Then the bar chart shows "Known" with count 32 and "Unknown" with count 15

  @must
  Scenario: Network Summary and Device Trend are not displayed
    Given devices have been discovered on the network
    When the dashboard overview page loads
    Then there is no "Network Summary" section
    And there is no "Device Trend" chart

  # --- Device List ---

  @must
  Scenario: Device list displays all discovered devices
    Given 10 devices have been discovered on the network
    When the user navigates to the Device List page
    Then the device table displays 10 rows
    And each row shows status, name, MAC, IP, vendor, tags, and last-seen

  @must
  Scenario: Device list search filters by name, MAC, IP, or vendor
    Given devices exist including one named "Office Printer" with vendor "HP"
    When the user types "printer" in the search bar
    Then only devices matching "printer" in name, MAC, IP, hostname, vendor, or tags are shown

  @must
  Scenario: Device list filters by online/offline status
    Given 10 devices exist with 7 online and 3 offline
    When the user selects the "Offline" status filter chip
    Then only the 3 offline devices are displayed

  @must
  Scenario: Device list filters by tag
    Given devices exist with various tags including 4 devices tagged "IoT"
    When the user selects the "IoT" tag filter chip
    Then only the 4 devices tagged "IoT" are displayed

  @must
  Scenario: Device list sorts by column
    Given 10 devices exist with different names and last-seen timestamps
    When the user clicks the "Name" column header to sort
    Then devices are sorted alphabetically by name
    When the user clicks the "Name" column header again
    Then devices are sorted in reverse alphabetical order

  # --- Device Detail ---

  @must
  Scenario: Device detail shows device identity card
    Given a device exists with display name "Smart TV", MAC "AA:BB:CC:DD:EE:01", and vendor "Samsung"
    When the user navigates to the device detail page
    Then the identity card displays the display name "Smart TV"
    And the identity card shows MAC address "AA:BB:CC:DD:EE:01"
    And the identity card shows vendor "Samsung"

  @must
  Scenario: Device detail shows IP history tab
    Given a device has used IPs "192.168.1.10", "192.168.1.25", and "192.168.1.42" over time
    When the user views the History tab on the device detail page
    Then the IP history table shows 3 rows with first-seen and last-seen dates
    And the rows are sorted by last-seen descending

  @must
  Scenario: Device detail shows ports tab
    Given a device has open ports 22/tcp (SSH), 80/tcp (HTTP), and 443/tcp (HTTPS)
    When the user clicks the "Ports" tab on the device detail page
    Then the port table displays 3 rows with port number, protocol, and service name

  # --- Scan History ---

  @must
  Scenario: Scan history shows list of past scans
    Given 5 completed scans exist in the system
    When the user navigates to the Scan History page
    Then the scan history table displays 5 rows
    And each row shows start time, duration, devices found, new devices, and status

  @should
  Scenario: Scan history row is expandable
    Given a completed scan found 12 devices with 2 new
    When the user clicks the expand toggle on that scan row
    Then the row expands to show the per-scan device list with status indicators

  # --- Settings ---

  @must
  Scenario: Settings page displays configurable parameters
    Given the application is running with default settings
    When the user navigates to the Settings page
    Then the settings form is displayed with tabs for Scanning, Retention, Alerts, and API
    And the Scanning tab shows scan cadence and subnet configuration fields
