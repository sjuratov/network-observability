Feature: Device detail activity rationalization
  As described in specs/frd-device-detail-activity.md, ext-003 replaces the
  overlapping device-detail History and Presence surfaces with a single Activity
  view so operators can understand IP churn and online/offline transitions from
  one coherent timeline.

  @device-detail-activity @smoke @happy
  Scenario: Device detail navigation uses the rationalized tab set
    Given a device detail record exists for "device-001"
    When the operator views the device detail page for "device-001"
    Then "tab-bar-tab-overview" is visible
    And "tab-bar-tab-activity" is visible
    And "tab-bar-tab-ports" is visible
    And "tab-bar-tab-tags" is visible
    And "tab-bar-tab-history" is not visible
    And "tab-bar-tab-presence" is not visible

  @device-detail-activity @smoke @happy
  Scenario: Activity tab combines presence status, IP history, and transition events
    Given device "device-001" has current presence context, 3 historical IP addresses, and 4 activity transitions
    When the operator opens "tab-bar-tab-activity" on the device detail page
    Then "activity-presence-summary" is visible
    And "ip-history-table" shows 3 rows with first-seen and last-seen dates
    And "activity-event-feed" shows the online, offline, and IP-change events in reverse chronological order
    And the Activity tab does not repeat overview-only identity facts outside "device-identity-card"

  @device-detail-activity @edge @edge-case
  Scenario: Activity tab shows useful context when a device has never changed IP or presence state
    Given device "device-002" has one current IP address and no recorded transitions
    When the operator opens "tab-bar-tab-activity" on the device detail page
    Then "activity-presence-summary" shows first-seen and last-seen context
    And "ip-history-table" shows 1 row
    And "activity-empty-state" explains that no additional activity has been recorded yet

  @device-detail-activity @edge @edge-case
  Scenario: Activity tab renders deep histories with a bounded initial view
    Given device "device-003" has more than 20 activity records
    When the operator opens "tab-bar-tab-activity" on the device detail page
    Then the Activity tab shows a bounded initial set of the most recent activity records
    And the operator can reveal more activity without leaving the tab

  @device-detail-activity @edge @edge-case
  Scenario: Activity tab tolerates partial legacy history
    Given device "device-004" has IP history rows but no recorded presence transitions
    When the operator opens "tab-bar-tab-activity" on the device detail page
    Then "ip-history-table" shows the available IP history rows
    And "activity-event-feed" shows only the events that exist
    And the Activity tab remains usable instead of appearing blank or broken

  @device-detail-activity @happy
  Scenario: Structured device history responses match the Activity view contract
    Given a device with activity history exists for "device-001"
    When an authenticated client requests the activity history for "device-001"
    Then the response status should be 200
    And the response includes a current presence summary section
    And the response includes an IP history section
    And the response includes an activity events section
    And the response does not expose a raw unstructured history array

  @device-detail-activity @error
  Scenario: Activity tab shows a scoped error state when aggregation fails
    Given activity aggregation fails for device "device-005"
    When the operator opens "tab-bar-tab-activity" on the device detail page
    Then the operator sees a scoped activity error message
    And "device-identity-card" remains visible
    And "tab-bar-tab-tags" remains available

  @device-detail-activity @error
  Scenario: Legacy records return empty structured sections instead of an incompatible payload
    Given device "device-006" has legacy history with missing structured sections
    When an authenticated client requests the activity history for "device-006"
    Then the response status should be 200
    And the missing IP history or activity-event sections are returned as empty arrays
    And the response remains compatible with the Activity tab
