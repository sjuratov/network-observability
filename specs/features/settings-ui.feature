Feature: Settings runtime config and General tab wiring
  As described in ext-005 and ext-006 of specs/increment-plan.md, this feature
  covers the backend runtime configuration foundation plus the Settings General
  tab workflow for loading, validating, and saving scan settings.

  # Scope alignment note:
  # ext-005 scenarios below cover the backend runtime configuration foundation.
  # ext-006 scenarios add the General tab wiring only. Network, Alerts, and API
  # workflows remain scoped to ext-007 and ext-008.

  @settings-ui @config-foundation @smoke
  Scenario: Effective configuration returns redacted secrets
    Given an authenticated settings API client
    When the client requests the effective settings configuration
    Then the response status is 200
    And the effective settings response redacts the API key and SMTP password
    And the settings response includes config source metadata

  @settings-ui @config-foundation
  Scenario: Runtime updates persist across later reads
    Given an authenticated settings API client
    When the client updates the runtime settings with:
      | field             | value |
      | dataRetentionDays | 180   |
    Then the response status is 200
    And the effective settings response shows:
      | field             | value |
      | dataRetentionDays | 180   |
    When the client requests the effective settings configuration again
    Then the response status is 200
    And the effective settings response shows:
      | field             | value |
      | dataRetentionDays | 180   |
    And the settings response includes "runtime" as a config source

  @settings-ui @config-foundation
  Scenario: Restart-required fields are reported separately from immediate changes
    Given an authenticated settings API client
    When the client updates the runtime settings with:
      | field             | value        |
      | scanCadence       | 0 */1 * * *  |
      | scanIntensity     | thorough     |
      | dataRetentionDays | 180          |
    Then the response status is 200
    And the settings update response lists "scanCadence" as applied
    And the settings update response lists "dataRetentionDays" as applied
    And the settings update response lists "scanIntensity" as restart-required

  @settings-ui @config-foundation @error
  Scenario Outline: Invalid values return field-level validation details
    Given an authenticated settings API client
    When the client updates the "<field>" setting to "<value>"
    Then the response status is 400
    And the validation error includes the "<field>" field

    Examples:
      | field             | value            |
      | scanCadence       | bad-cron         |
      | dataRetentionDays | 10               |
      | subnets           | 999.999.999.0/24 |

  @settings-ui @config-foundation @error
  Scenario: Empty change sets are rejected
    Given an authenticated settings API client
    When the client submits an empty settings update
    Then the response status is 400
    And the error message is "No configuration fields provided"

  @settings-ui @config-foundation
  Scenario: Unknown fields are ignored while known fields are applied
    Given an authenticated settings API client
    When the client updates the runtime settings with:
      | field                  | value |
      | futureExperimentalFlag | true  |
      | dataRetentionDays      | 180   |
    Then the response status is 200
    And the effective settings response shows:
      | field             | value |
      | dataRetentionDays | 180   |
    And the response does not include the "futureExperimentalFlag" field

  @settings-ui @config-foundation
  Scenario: Concurrent updates use last-write-wins semantics
    Given an authenticated settings API client
    When two authenticated clients save alert cooldown values of "300" and "600" seconds
    Then the response status is 200
    And a later effective settings request shows "alertCooldownSeconds" as "600"

  # ext-006 — Settings General tab wiring

  @settings-ui @general-settings @smoke @happy
  Scenario: Load current General settings on page open
    Given the effective settings configuration includes scan cadence "0 */4 * * *", scan intensity "thorough", and retention "180" days
    When the operator opens the Settings page
    Then "settings-loading" appears while the General settings are loading
    And "panel-general" becomes visible
    And "select-schedule-preset" displays "Every 4 hours"
    And "radio-thorough" is selected
    And "input-retention-days" displays "180"

  @settings-ui @general-settings @error
  Scenario: Settings page shows retry guidance when the General settings request fails
    Given the effective settings request will fail with a connection error
    When the operator opens the Settings page
    Then the operator sees "Unable to load settings. Check server connection."
    And "settings-retry" is visible
    When the operator activates "settings-retry"
    Then the General settings request is retried

  @settings-ui @general-settings @smoke @happy
  Scenario: Saving a changed General field sends only the modified setting
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *", scan intensity "normal", and retention "365" days
    When the operator selects "Every hour" from "select-schedule-preset"
    And the operator activates "btn-save-general"
    Then "btn-save-general" becomes disabled during the save request
    And the General settings update includes only "scanCadence" with value "0 * * * *"
    And the operator sees "Settings saved successfully"

  @settings-ui @general-settings @happy
  Scenario: Saving restart-required General fields highlights follow-up actions
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *" and scan intensity "normal"
    When the operator selects "Every hour" from "select-schedule-preset"
    And the operator selects "radio-thorough"
    And the operator activates "btn-save-general"
    Then "restart-required-banner" displays "Some changes require a restart"
    And "field-scan-intensity-restart" is visible
    And scanCadence is NOT listed as restart-required

  @settings-ui @general-settings @error
  Scenario: A failed General settings save shows an error banner
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *"
    And the next General settings save will fail with "Unable to save settings. Check server connection."
    When the operator selects "Every hour" from "select-schedule-preset"
    And the operator activates "btn-save-general"
    Then the operator sees "Unable to save settings. Check server connection."
    And "btn-save-general" becomes enabled again

  @settings-ui @general-settings @error
  Scenario: Invalid custom cron expression shows field-level validation
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *", scan intensity "normal", and retention "365" days
    When the operator selects "Custom (cron)…" from "select-schedule-preset"
    And the operator changes "input-cron" to "bad-cron"
    And the operator activates "btn-save-general"
    Then "field-scan-cadence-error" displays "Invalid cron expression"
    And "input-retention-days" keeps "365"

  @settings-ui @general-settings @edge @edge-case
  Scenario: Environment-managed General settings stay read-only in the form
    Given the server reports that "scanCadence" and "scanIntensity" are managed by environment variables
    When the operator opens the Settings page
    Then "field-scan-cadence-env-managed" is visible
    And "field-scan-intensity-env-managed" is visible
    And "select-schedule-preset" is disabled
    And "radio-quick" is disabled
    And "radio-normal" is disabled
    And "radio-thorough" is disabled

  # ext-006b — Friendly scan schedule presets

  @settings-ui @general-settings @schedule-preset @smoke @happy
  Scenario: Known cron expression hydrates as a friendly preset
    Given the effective settings configuration includes scan cadence "0 */4 * * *"
    When the operator opens the Settings page
    Then "select-schedule-preset" displays "Every 4 hours"
    And "hour-picker-group" is not visible
    And "custom-cron-group" is not visible

  @settings-ui @general-settings @schedule-preset @happy
  Scenario: Daily cron hydrates with correct hour
    Given the effective settings configuration includes scan cadence "0 14 * * *"
    When the operator opens the Settings page
    Then "select-schedule-preset" displays "Once a day"
    And "select-schedule-hour" displays "14:00"
    And "custom-cron-group" is not visible

  @settings-ui @general-settings @schedule-preset @happy
  Scenario: Selecting "Once a day" reveals hour picker
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *"
    When the operator selects "Once a day" from "select-schedule-preset"
    Then "hour-picker-group" is visible
    And "select-schedule-hour" defaults to "00:00"
    And "cron-preview" displays "Runs once a day at 00:00"

  @settings-ui @general-settings @schedule-preset @happy
  Scenario: Saving daily schedule with selected hour
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *"
    When the operator selects "Once a day" from "select-schedule-preset"
    And the operator selects "14:00" from "select-schedule-hour"
    And the operator activates "btn-save-general"
    Then the General settings update includes only "scanCadence" with value "0 14 * * *"
    And the operator sees "Settings saved successfully"

  @settings-ui @general-settings @schedule-preset @happy
  Scenario: Selecting "Custom (cron)…" reveals raw cron input
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *"
    When the operator selects "Custom (cron)…" from "select-schedule-preset"
    Then "custom-cron-group" is visible
    And "input-cron" displays "0 */6 * * *"
    And "hour-picker-group" is not visible

  @settings-ui @general-settings @schedule-preset @edge @edge-case
  Scenario: Unknown cron expression falls back to custom mode
    Given the effective settings configuration includes scan cadence "5 4 * * 1"
    When the operator opens the Settings page
    Then "select-schedule-preset" displays "Custom (cron)…"
    And "custom-cron-group" is visible
    And "input-cron" displays "5 4 * * 1"

  @settings-ui @general-settings @schedule-preset @edge @edge-case
  Scenario: Env-managed schedule disables the preset dropdown and hour picker
    Given the server reports that "scanCadence" is managed by environment variables
    And the effective settings configuration includes scan cadence "0 14 * * *"
    When the operator opens the Settings page
    Then "select-schedule-preset" is disabled
    And "select-schedule-preset" displays "Once a day"
    And "select-schedule-hour" is disabled

  @settings-ui @general-settings @schedule-preset @happy
  Scenario: Changing scan schedule does not require a restart
    Given the Settings page has loaded General settings with scan cadence "0 */6 * * *" and scan intensity "normal"
    When the operator selects "Every 5 minutes" from "select-schedule-preset"
    And the operator activates "btn-save-general"
    Then the operator sees "Settings saved successfully"
    And "restart-required-banner" is not visible

  # ext-007 — Settings Network and Alerts tab wiring

  @settings-ui @network-settings @smoke @happy
  Scenario: Display detected and configured subnets
    Given the Settings page has loaded Network settings with detected subnet "192.168.1.0/24" and configured subnet "10.0.0.0/24"
    When the operator activates "tab-network"
    Then "subnet-detected-list" is visible
    And "detected-subnet-192-168-1-0-24" displays "192.168.1.0/24"
    And "detected-subnet-badge-192-168-1-0-24" displays "Detected"
    And "subnet-configured-list" is visible
    And "configured-subnet-10-0-0-0-24" displays "10.0.0.0/24"
    And "configured-subnet-remove-10-0-0-0-24" is visible

  @settings-ui @network-settings @happy
  Scenario: Add a manual subnet
    Given the Settings page has loaded Network settings with configured subnet "10.0.0.0/24"
    When the operator activates "tab-network"
    And the operator changes "input-manual-subnet" to "10.20.30.0/24"
    And the operator activates "btn-add-subnet"
    And the operator activates "btn-save-network"
    Then the Network settings update includes the subnet "10.20.30.0/24"
    And "configured-subnet-10-20-30-0-24" displays "10.20.30.0/24"
    And the operator sees "Settings saved successfully"

  @settings-ui @network-settings @happy
  Scenario: Remove a configured subnet
    Given the Settings page has loaded Network settings with configured subnets "10.0.0.0/24" and "10.20.30.0/24"
    When the operator activates "tab-network"
    And the operator activates "configured-subnet-remove-10-20-30-0-24"
    And the operator activates "btn-save-network"
    Then the Network settings update does not include the subnet "10.20.30.0/24"
    And "configured-subnet-10-20-30-0-24" is not visible
    And the operator sees "Settings saved successfully"

  @settings-ui @network-settings @error
  Scenario: Invalid manual subnet is blocked before save
    Given the Settings page has loaded Network settings with configured subnet "10.0.0.0/24"
    When the operator activates "tab-network"
    And the operator changes "input-manual-subnet" to "10.999.0.0/24"
    And the operator activates "btn-add-subnet"
    Then "field-manual-subnet-error" displays "Enter a valid CIDR subnet"
    And "btn-save-network" remains disabled

  @settings-ui @alerts-settings @smoke @happy
  Scenario: Load current alert delivery settings
    Given the Settings page has loaded Alerts settings with webhook URL "https://hooks.example.com/current-netobserver", SMTP host "smtp.example.com", port "587", recipient "admin@example.com", and cooldown "300" seconds
    When the operator activates "tab-alerts"
    Then "input-webhook-url" displays "https://hooks.example.com/current-netobserver"
    And "input-smtp-server" displays "smtp.example.com"
    And "input-smtp-port" displays "587"
    And "input-smtp-recipient" displays "admin@example.com"
    And "input-alert-cooldown" displays "300"

  @settings-ui @alerts-settings @happy
  Scenario: Test webhook before saving
    Given the Settings page has loaded Alerts settings with webhook URL "https://hooks.example.com/current-netobserver"
    When the operator activates "tab-alerts"
    And the operator changes "input-webhook-url" to "https://hooks.example.com/netobserver"
    And the operator activates "btn-test-webhook"
    Then the webhook test request includes the candidate URL "https://hooks.example.com/netobserver"
    And "webhook-test-result" displays "Success — webhook responded with 200 OK"

  @settings-ui @alerts-settings @edge @edge-case
  Scenario: Test webhook stays disabled when the URL is empty
    Given the Settings page has loaded Alerts settings with webhook URL ""
    When the operator activates "tab-alerts"
    Then "btn-test-webhook" is disabled

  @settings-ui @alerts-settings @error
  Scenario: Test webhook with an unreachable URL
    Given the Settings page has loaded Alerts settings with webhook URL "https://hooks.example.com/current-netobserver"
    And the webhook test request will fail with "Connection refused"
    When the operator activates "tab-alerts"
    And the operator changes "input-webhook-url" to "https://hooks.example.com/unreachable"
    And the operator activates "btn-test-webhook"
    Then "webhook-test-result" displays "Connection refused"

  @settings-ui @alerts-settings @happy
  Scenario: Test email delivery
    Given the Settings page has loaded Alerts settings with SMTP host "smtp.example.com", port "587", user "alerts@example.com", password placeholder "********", recipient "admin@example.com", and cooldown "300" seconds
    When the operator activates "tab-alerts"
    And the operator changes "input-smtp-password" to "test-password"
    And the operator activates "btn-test-email"
    Then the email test request includes SMTP host "smtp.example.com", port "587", and recipient "admin@example.com"
    And "email-test-result" displays "Success"

  @settings-ui @alerts-settings @edge @edge-case
  Scenario: Test email stays disabled until required SMTP fields are provided
    Given the Settings page has loaded Alerts settings with SMTP host "", port "", recipient "", and cooldown "300" seconds
    When the operator activates "tab-alerts"
    Then "btn-test-email" is disabled

  @settings-ui @alerts-settings @happy
  Scenario: Save alert settings
    Given the Settings page has loaded Alerts settings with webhook URL "https://hooks.example.com/current-netobserver", SMTP host "smtp.example.com", port "587", recipient "admin@example.com", and cooldown "300" seconds
    When the operator activates "tab-alerts"
    And the operator changes "input-webhook-url" to "https://hooks.example.com/updated-netobserver"
    And the operator changes "input-smtp-server" to "smtp-updated.example.com"
    And the operator changes "input-smtp-port" to "2525"
    And the operator changes "input-smtp-user" to "updated-alerts@example.com"
    And the operator changes "input-smtp-password" to "updated-password"
    And the operator changes "input-smtp-recipient" to "ops@example.com"
    And the operator changes "input-alert-cooldown" to "120"
    And the operator activates "btn-save-alerts"
    Then the Alerts settings update includes webhook URL "https://hooks.example.com/updated-netobserver"
    And the Alerts settings update includes SMTP host "smtp-updated.example.com", port "2525", recipient "ops@example.com", and cooldown "120"
    And the operator sees "Alert settings saved"

  # ext-008 — Settings API key tab wiring

  @settings-ui @api-key-settings @smoke @happy
  Scenario: API tab shows the redacted key and rate limit guidance
    Given the Settings page has loaded a redacted API key ending with "e1f2"
    When the operator activates "tab-api"
    Then "api-key-display" is visible
    And "api-key-value" displays the redacted API key ending with "e1f2"
    And "btn-copy-key" is disabled
    And "api-rate-limit-info" displays "Rate limit"

  @settings-ui @api-key-settings @happy
  Scenario: Reveal API key
    Given the Settings page has loaded a redacted API key ending with "e1f2"
    When the operator activates "tab-api"
    And the operator activates "btn-show-key"
    Then the API key reveal request count is "1"
    And "api-key-value" displays the full API key
    And "btn-copy-key" is enabled

  @settings-ui @api-key-settings @happy
  Scenario: Hide API key after reveal
    Given the Settings page has revealed the full API key
    When the operator activates "btn-show-key"
    Then "api-key-value" displays the redacted API key ending with "e1f2"
    And the API key reveal request count remains "1"

  @settings-ui @api-key-settings @edge @edge-case
  Scenario: Copy API key to clipboard
    Given the Settings page has revealed the full API key
    When the operator activates "btn-copy-key"
    Then the clipboard contains the full API key
    And the operator sees "Copied!"

  @settings-ui @api-key-settings @happy
  Scenario: Regenerate API key with confirmation
    Given the Settings page has loaded a redacted API key ending with "e1f2"
    When the operator activates "tab-api"
    And the operator activates "btn-regenerate-key"
    Then the API key regeneration warning is visible
    And "btn-regenerate-confirm" is visible
    And "btn-regenerate-cancel" is visible

  @settings-ui @api-key-settings @smoke @happy
  Scenario: Regenerated key works for authentication
    Given the Settings page has loaded a redacted API key ending with "e1f2"
    When the operator activates "tab-api"
    And the operator regenerates the API key
    Then "api-key-value" displays the full regenerated API key
    And the stored dashboard API key matches the regenerated API key
    And authenticated settings requests succeed with the regenerated API key

  @settings-ui @api-key-settings @error
  Scenario: Old key rejected after regeneration
    Given the Settings page has loaded a redacted API key ending with "e1f2"
    When the operator activates "tab-api"
    And the operator regenerates the API key
    Then authenticated settings requests with the previous API key fail with status "401"

  # ── Database Tab ──────────────────────────────────────────────

  @database-tab @F14.23 @F14.24
  Scenario: Database tab displays live database statistics
    Given the Settings page is open
    When the operator activates "tab-database"
    Then the database stats panel is visible
    And the stats panel shows row counts for "devices", "scans", "scan_results", "device_history", and "device_tags"
    And the stats panel shows the database file size in human-readable format
    And the stats panel shows the WAL file size in human-readable format
    And the stats panel shows the last cleanup timestamp or "Never"

  @database-tab @F14.25 @F14.30
  Scenario: Data Retention setting appears in Database tab and not in General tab
    Given the Settings page is open
    When the operator activates "tab-general"
    Then no "Data Retention" card is present
    When the operator activates "tab-database"
    Then a "Data Retention" card is present with a "Keep historical data for" input
    And the retention days input reflects the current server value

  @database-tab @F14.25
  Scenario: Saving data retention from Database tab
    Given the Settings page is open and the Database tab is active
    When the operator sets the retention days input to "30"
    And the operator clicks "Save Changes"
    Then PATCH /api/v1/config is sent with dataRetentionDays 30
    And a success banner is shown

  @database-tab @F14.26
  Scenario: Manual cleanup with keep days
    Given the Settings page is open and the Database tab is active
    When the operator enters "7" in the cleanup keep-days input
    And the operator clicks "Clean Now"
    Then POST /api/v1/db/cleanup is called with keepDays 7
    And a result summary shows deleted counts and duration
    And the database stats panel refreshes with updated row counts

  @database-tab @F14.27
  Scenario: Delete all scan data with confirmation
    Given the Settings page is open and the Database tab is active
    When the operator clicks "Delete All Scan Data"
    Then a confirmation dialog appears warning that all scan data will be deleted
    When the operator confirms the deletion
    Then POST /api/v1/db/cleanup is called with keepDays 0
    And a result summary is displayed
    And the database stats panel refreshes

  @database-tab @F14.28
  Scenario: Factory reset requires typing RESET to confirm
    Given the Settings page is open and the Database tab is active
    When the operator clicks "Reset to Factory Defaults"
    Then a confirmation dialog appears with a text input
    And the confirm button is disabled
    When the operator types "RESET" in the confirmation input
    Then the confirm button becomes enabled
    When the operator clicks the confirm button
    Then POST /api/v1/db/factory-reset is called with confirm true
    And a success message is displayed
    And the database stats panel refreshes showing zeroed counts

  @database-tab @F14.28
  Scenario: Factory reset confirmation is rejected when text does not match
    Given the Settings page is open and the Database tab is active
    When the operator clicks "Reset to Factory Defaults"
    And the operator types "reset" in the confirmation input
    Then the confirm button remains disabled

  @database-tab @F14.29
  Scenario: Stats auto-refresh after cleanup operations
    Given the Settings page is open and the Database tab is active
    And the stats panel shows a scans count greater than zero
    When the operator performs a manual cleanup with keepDays 0
    Then the stats panel refreshes and shows scans count as 0
