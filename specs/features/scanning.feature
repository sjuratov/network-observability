@inc-03 @f3
Feature: Scheduled Scanning
  As a network admin
  I want scans to run automatically on a configurable schedule
  So that my device inventory stays up to date without manual intervention

  Background:
    Given the application is configured and running

  # ─── Default Schedule ───

  @must
  Scenario: Default scan cadence is every 6 hours
    Given no custom scan cadence is configured
    When the scheduler initializes
    Then the scheduler uses cron expression "0 */6 * * *"
    And the next scheduled scan time is calculated from the cron expression

  # ─── Custom Cron ───

  @must
  Scenario: Custom cron expression scheduling
    Given the scan cadence is configured as "0 */4 * * *"
    When the scheduler initializes
    Then the scheduler uses cron expression "0 */4 * * *"
    And scans are triggered every 4 hours

  @must
  Scenario: Invalid cron expression is rejected
    Given the scan cadence is configured as "invalid-cron"
    When the cron expression is validated
    Then the validation fails with an error containing "not a valid cron expression"

  @must
  Scenario: Cron shorthands are accepted
    Given the scan cadence is configured as "@daily"
    When the cron expression is validated
    Then the validation succeeds

  # ─── Manual Scan ───

  @must
  Scenario: On-demand manual scan trigger
    Given no scan is currently running
    When a manual scan is triggered
    Then a new scan starts immediately
    And the scan record has trigger type "manual"

  # ─── Scan Lifecycle ───

  @must
  Scenario: Scan transitions through pending to in-progress to completed
    When a scan is triggered
    Then the scan status starts as "pending"
    And the scan status transitions to "running"
    And when the scan finishes the status transitions to "completed"
    And each status transition is timestamped

  @must
  Scenario: Failed scan records error details
    Given a scan is triggered
    When the scan encounters a fatal error
    Then the scan status is set to "failed"
    And the error message is recorded in the scan record
    And the scheduler continues to schedule future scans

  # ─── Concurrent Scan Prevention ───

  @must
  Scenario: Concurrent scan prevention rejects second manual trigger
    Given a scan is currently in progress with ID "scan-123"
    When a manual scan is triggered
    Then the manual scan is rejected with status "scan_in_progress"
    And the response includes the running scan ID "scan-123"

  @must
  Scenario: Scheduled scan skipped when scan already running
    Given a scan is currently in progress with ID "scan-456"
    When the cron scheduler fires a scheduled scan
    Then the scheduled scan is skipped
    And a log entry records "Scheduled scan skipped"
    And the cron schedule continues normally

  # ─── Intensity Profiles ───

  @should
  Scenario Outline: Scan intensity profile affects scan behavior
    Given the scan intensity is set to "<intensity>"
    When a scan is triggered
    Then the scan uses the "<intensity>" profile settings
    And the scan record indicates intensity "<intensity>"

    Examples:
      | intensity |
      | quick     |
      | normal    |
      | thorough  |

  # ─── Startup Scan ───

  @should
  Scenario: Startup scan runs immediately on start
    Given scan-on-startup is enabled
    When the application starts
    Then a scan is triggered immediately before the first cron interval
    And the scan record has trigger type "startup"

  @should
  Scenario: Startup scan can be disabled
    Given scan-on-startup is disabled
    When the application starts
    Then no scan is triggered until the first cron interval

  # ─── Scan Metadata ───

  @must
  Scenario: Completed scan records full metadata
    When a scan completes successfully
    Then the scan record includes start time
    And the scan record includes end time
    And the scan record includes duration in milliseconds
    And the scan record includes total device count
    And the scan record includes subnets scanned
    And the scan record includes the intensity profile used
