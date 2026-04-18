Feature: Device detail ports presentation
  As described in specs/frd-device-detail-activity.md, ext-004 simplifies the
  Ports & Services table so operators see the important service context without
  wasting space on a mostly empty standalone version column.

  @device-detail-ports @smoke @happy
  Scenario: Ports tab shows the simplified primary column set
    Given a device detail record exists for "device-001"
    When the operator opens "tab-bar-tab-ports" on the device detail page
    Then "port-table" is visible
    And the Ports & Services table shows "Port", "Protocol", and "Service" as its primary columns
    And the Ports & Services table does not show a standalone "Version" column

  @device-detail-ports @happy
  Scenario: Ports tab renders version detail inline when it exists
    Given device "device-001" has ports with real service version values
    When the operator opens "tab-bar-tab-ports" on the device detail page
    Then the matching service rows show their version detail inline with the service name
    And the operator can still scan the table by port and protocol without an extra sparse column

  @device-detail-ports @edge @edge-case
  Scenario: Ports tab stays compact when version data is absent
    Given device "device-002" has ports without service version values
    When the operator opens "tab-bar-tab-ports" on the device detail page
    Then the service rows show the service names without empty version placeholders
    And the Ports & Services table remains aligned without a blank version-only column

  @device-detail-ports @happy
  Scenario: Device ports API preserves raw version values for advanced uses
    Given a device with open port data exists for "device-001"
    When an authenticated client requests the ports snapshot for "device-001"
    Then the response status should be 200
    And the response includes service-version fields for ports that have detected version data
    And the response remains compatible with exports or future advanced port views
