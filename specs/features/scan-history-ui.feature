Feature: Scan history pagination and status filtering
  As described in specs/frd-scan-history-ui.md, this feature aligns the Scan
  History page pagination with the established Device List pattern — client-side
  pagination with a rows-per-page dropdown — and adds a Status filter dropdown
  so operators can quickly narrow scan history by status.

  @scan-history-ui @smoke @happy
  Scenario: Scan history page size defaults to 10 with rows-per-page control
    Given the scan history includes more than 25 scans
    When the operator views the scan history page
    Then "pagination-page-size" offers "10", "25", "50", "100", and "All"
    And "pagination-page-size" keeps "10" selected
    And "scan-history-table" shows 10 visible scan rows
    And "pagination-info" displays the correct showing range and total

  @scan-history-ui @happy
  Scenario: Changing the scan history page size updates visible rows immediately
    Given the scan history includes more than 25 scans
    When the operator views the scan history page
    And the operator sets "pagination-page-size" to "25"
    Then "scan-history-table" shows 25 visible scan rows
    And "pagination-info" displays the correct showing range for 25 rows

  @scan-history-ui @happy
  Scenario: Selecting All shows every scan without pagination
    Given the scan history includes more than 25 scans
    When the operator views the scan history page
    And the operator sets "pagination-page-size" to "All"
    Then "scan-history-table" shows all scan rows
    And pagination page buttons are not displayed

  @scan-history-ui @smoke @happy
  Scenario: Status filter dropdown filters scans by status
    Given the scan history includes scans with status "completed" and "failed"
    When the operator views the scan history page
    And the operator selects "Completed" from the "scan-status-filter" dropdown
    Then every visible scan row shows status "completed"
    And "pagination-info" reflects the filtered total

  @scan-history-ui @happy
  Scenario: Status filter shows all statuses by default
    Given the scan history includes scans with mixed statuses
    When the operator views the scan history page
    Then "scan-status-filter" has "All" selected
    And "scan-history-table" shows scans of all statuses

  @scan-history-ui @happy
  Scenario: Changing status filter resets to page 1
    Given the scan history includes more than 25 scans
    When the operator views the scan history page
    And the operator navigates to page 2
    And the operator selects "Failed" from the "scan-status-filter" dropdown
    Then the current page resets to 1

  @scan-history-ui @happy
  Scenario: Changing page size resets to page 1
    Given the scan history includes more than 25 scans
    When the operator views the scan history page
    And the operator navigates to page 2
    And the operator sets "pagination-page-size" to "25"
    Then the current page resets to 1

  @scan-history-ui @edge @edge-case
  Scenario: No matching scans shows filtered empty state
    Given the scan history includes only completed scans
    When the operator selects "Failed" from the "scan-status-filter" dropdown
    Then a "no matching scans" message is displayed
    And the "No Scans Yet" empty state is not shown
    And pagination controls are hidden

  @scan-history-ui @edge @edge-case
  Scenario: Empty scan history shows the original empty state
    Given no scans exist
    When the operator views the scan history page
    Then the "No Scans Yet" empty state is displayed
    And "scan-status-filter" is not displayed
    And pagination controls are hidden

  @scan-history-ui @happy
  Scenario: Expandable rows continue to work with new pagination
    Given the scan history includes more than 10 scans
    When the operator views the scan history page
    And the operator clicks a scan row to expand it
    Then the scan detail section is visible
    And the operator clicks the same scan row to collapse it
    Then the scan detail section is hidden

  @scan-history-ui @happy
  Scenario: Scan Now button refreshes the list after triggering
    Given the operator views the scan history page
    When the operator clicks "btn-scan-now"
    Then the scan list is refreshed with the new scan included

  @scan-history-ui @edge @edge-case
  Scenario: Page number buttons are capped for large histories
    Given the scan history includes more than 100 scans
    And "pagination-page-size" is set to "10"
    When the operator views the scan history page
    Then at most 7 page buttons are displayed
