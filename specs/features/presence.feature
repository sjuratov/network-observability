@inc-02 @f8
Feature: Online/Offline Presence Tracking
  As a network admin
  I want to track when devices are online and offline
  So that I can monitor uptime and detect connectivity issues

  # ─── First-Seen / Last-Seen Timestamps ───

  @must
  Scenario: First-seen timestamp set on initial discovery
    Given a device is discovered for the first time at "2024-01-01T10:00:00Z"
    When the scan results are processed
    Then the device's first-seen timestamp is "2024-01-01T10:00:00Z"
    And the device's last-seen timestamp is "2024-01-01T10:00:00Z"

  @must
  Scenario: First-seen timestamp never changes on subsequent scans
    Given a device was first seen at "2024-01-01T10:00:00Z"
    When the device is seen again at "2024-01-02T10:00:00Z"
    Then the device's first-seen timestamp is still "2024-01-01T10:00:00Z"
    And the device's last-seen timestamp is "2024-01-02T10:00:00Z"

  @must
  Scenario: Last-seen timestamp updated every scan where device is found
    Given a device was last seen at "2024-01-01T10:00:00Z"
    When the device is found in a scan at "2024-01-01T16:00:00Z"
    Then the device's last-seen timestamp is updated to "2024-01-01T16:00:00Z"

  # ─── Offline Detection ───

  @must
  Scenario: Device goes offline after exceeding missed scan threshold
    Given the offline threshold is 2 missed scans
    And a device is currently online
    When the device is not found in 3 consecutive scans
    Then the device's status transitions to "offline"
    And an offline transition event is recorded

  @must
  Scenario: Device stays online when missed scans below threshold
    Given the offline threshold is 2 missed scans
    And a device is currently online
    When the device is not found in 1 scan
    Then the device's status remains "online"

  # ─── Online Re-detection ───

  @must
  Scenario: Device comes back online after being offline
    Given a device is currently offline
    When the device is found in a new scan at "2024-01-05T10:00:00Z"
    Then the device's status transitions to "online"
    And an online transition event is recorded
    And the device's last-seen timestamp is updated to "2024-01-05T10:00:00Z"

  # ─── Presence Events ───

  @must
  Scenario: Online-to-offline transition records event
    Given a device is currently online
    When the device exceeds the offline threshold
    Then a presence event is recorded with type "offline"
    And the event includes the device ID and timestamp

  @must
  Scenario: Offline-to-online transition records event
    Given a device is currently offline
    When the device is found in a scan
    Then a presence event is recorded with type "online"
    And the event includes the device ID and timestamp

  # ─── New Device Status ───

  @must
  Scenario: New device starts as online
    Given a device has never been seen before
    When the device is first discovered
    Then the device's status is "online"
    And the missed scan count is 0

  # ─── Availability Calculation ───

  @should
  Scenario: Availability percentage calculated over time range
    Given a device has been seen in 20 of the last 24 scans
    When availability is calculated for the 24-scan window
    Then the availability percentage is approximately 83%

  @should
  Scenario: Availability is null when no scans in range
    Given no scans have been performed in the queried time range
    When availability is calculated
    Then the availability percentage is null

  # ─── Configurable Threshold ───

  @should
  Scenario: Offline threshold is configurable
    Given the offline threshold is set to 5 missed scans
    And a device is currently online
    When the device misses 4 scans
    Then the device's status remains "online"
    When the device misses 1 more scan
    Then the device's status transitions to "offline"

  # ─── Presence Timeline ───

  @should
  Scenario: Presence timeline query returns transitions in date range
    Given a device has the following presence events:
      | event   | timestamp            |
      | online  | 2024-01-01T08:00:00Z |
      | offline | 2024-01-02T08:00:00Z |
      | online  | 2024-01-03T08:00:00Z |
      | offline | 2024-01-05T08:00:00Z |
    When the presence timeline is queried from "2024-01-01T00:00:00Z" to "2024-01-04T00:00:00Z"
    Then 3 transition events are returned
    And the events are ordered chronologically
