Feature: Device list status reconciliation
  As described in specs/frd-device-list-status.md, ext-pre-001 aligns persisted
  presence status with the dashboard and device list so offline devices are
  queryable, counts stay trustworthy, and connectivity status is not confused
  with known/new lifecycle state.

  @device-list-status @smoke @happy
  Scenario: Dashboard offline count matches the offline device list
    Given presence reconciliation has marked 3 devices as offline after the configured missed-scan threshold
    When the operator views the dashboard
    Then "metric-card-offline-devices-value" displays "3"
    When the operator navigates to the device list and activates "filter-chips-status-offline"
    Then "device-table-row-count" displays "3 devices"
    And each visible device row shows "status-badge-offline"

  @device-list-status @happy
  Scenario: Device inventory responses preserve both status and compatibility fields
    Given a device has been marked offline by presence reconciliation
    When an authenticated client requests the offline device inventory
    Then every returned device reports status "offline"
    And every returned device reports "isOnline" as false

  @device-list-status @happy
  Scenario: Known and new lifecycle state does not override connectivity status
    Given a newly discovered device is still classified as new
    And the same device has exceeded the offline detection threshold
    When the operator views the device row in "device-table"
    Then the row shows "status-badge-offline"
    And the row does not show "status-badge-new"

  @device-list-status @edge @edge-case
  Scenario: Recently discovered device remains unknown until enough scan evidence exists
    Given a device has only been seen in one completed scan
    When the operator views the device row in "device-table"
    Then the row shows "status-badge-unknown"
    And the device is not counted in "metric-card-offline-devices-value"

  @device-list-status @smoke @happy
  Scenario: Newly discovered devices clear lifecycle context after another completed scan while keeping online connectivity truth
    Given a newly discovered device has recent presence evidence that keeps it online
    When the operator views the device row in "device-table"
    Then the row shows "status-badge-online"
    And the row does not show "status-badge-new"
    And the row does not show the lifecycle label "New"

  @device-list-status @edge @edge-case
  Scenario: Active scans do not replace the last completed presence state mid-run
    Given a device was offline after the most recent completed scan
    And a new scan is currently in progress
    When the operator views the dashboard and the device list during that scan
    Then "metric-card-offline-devices-value" still includes the offline device
    And the matching device row still shows "status-badge-offline"

  @device-list-status @error
  Scenario: Invalid status filter is rejected explicitly
    Given an authenticated client requests the device inventory with an unsupported status filter
    When the device inventory is evaluated
    Then the response is rejected with a validation error
    And no fallback list is returned for the unsupported filter

  @device-list-status @smoke @happy
  Scenario: Device list page size defaults to 50 with IP sorting active
    Given the device inventory includes more than 100 devices for page-size selection
    When the operator views the device list page
    Then "pagination-page-size" offers "10", "25", "50", "100", and "All"
    And "pagination-page-size" keeps "50" selected
    And "pagination-info" displays "Showing 1-50 of 120 devices"
    And "device-table-sort-ip" stays sorted
    And the first visible device IPs are "192.168.1.1", "192.168.1.2", and "192.168.1.3"

  @device-list-status @happy
  Scenario: Changing the device list page size updates visible rows immediately
    Given the device inventory includes more than 100 devices for page-size selection
    When the operator sets "pagination-page-size" to "25"
    Then "device-table" shows 25 visible device rows
    And "pagination-info" displays "Showing 1-25 of 120 devices"
    When the operator sets "pagination-page-size" to "50"
    Then "device-table" shows 50 visible device rows
    And "pagination-info" displays "Showing 1-50 of 120 devices"

  @device-list-status @edge @edge-case
  Scenario: Selecting All keeps search, filters, and sort state while loading the full filtered result set
    Given the device inventory includes more than 100 devices for page-size selection
    When the operator searches for "Printer" in "search-bar-input"
    And the operator activates "filter-chips-status-offline"
    And the operator sorts the device list by "device-table-sort-last-seen"
    And the operator sets "pagination-page-size" to "All"
    Then "search-bar-input" keeps "Printer"
    And "filter-chips-clear" remains visible
    And "device-table-sort-last-seen" stays sorted
    And "pagination-info" displays "Showing 1-12 of 12 devices"
    And each visible device row shows "status-badge-offline"

  @device-list-status @happy
  Scenario: Returning from device detail restores the chosen page size and sort
    Given the device inventory includes more than 100 devices for page-size selection
    When the operator views the device list page
    And the operator sets "pagination-page-size" to "25"
    And the operator sorts the device list by "device-table-sort-name"
    And the operator opens the first visible device
    And the operator returns to the device list from the device detail page
    Then "pagination-page-size" keeps "25" selected
    And "device-table-sort-name" stays sorted
    And "device-table" shows 25 visible device rows
    And the first visible device name stays the same

  @device-list-status @error
  Scenario: Device list keeps the previous page size when full-result retrieval fails
    Given the device list currently shows "25" rows per page
    And full-result retrieval for the device list will fail
    When the operator sets "pagination-page-size" to "All"
    Then "pagination-page-size" keeps "25" selected
    And the visible device rows stay unchanged
    And the operator sees an inline page-size error message
