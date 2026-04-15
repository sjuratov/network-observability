@inc-06 @f9
Feature: Device Tagging & Naming
  As a network admin
  I want to assign names, tags, and notes to devices
  So that I can organize and identify devices regardless of IP changes

  @must
  Scenario: Assign display name to device
    Given a device exists with MAC "AA:BB:CC:DD:EE:01" and no display name
    When the user sets the display name to "Living Room TV"
    Then the device's display name is saved as "Living Room TV"
    And the display name appears in the device list and detail views

  @must
  Scenario: Add tag to device
    Given a device exists and the tag "IoT" exists
    When the user adds the tag "IoT" to the device
    Then the device has the tag "IoT" in its tag list
    And the tag is persisted via the API

  @must
  Scenario: Remove tag from device
    Given a device exists with the tag "IoT" applied
    When the user removes the tag "IoT" from the device
    Then the device no longer has the tag "IoT"

  @must
  Scenario: Create new tag
    Given no tag named "Server" exists
    When the user creates a tag named "Server"
    Then a POST request to "/api/v1/tags" creates the tag
    And the tag "Server" appears in the tag list

  @must
  Scenario: Delete existing tag
    Given a tag "Obsolete" exists and is applied to 2 devices
    When the user deletes the tag "Obsolete"
    Then the tag is removed from all devices
    And the tag no longer appears in the tag list

  @should
  Scenario: Bulk tag multiple devices
    Given 3 devices are selected in the device list
    And the tag "IoT" exists
    When the user applies the tag "IoT" via bulk action
    Then all 3 devices have the tag "IoT"
    And the bulk operation completes as a single transaction

  @must
  Scenario: Tags persist across IP changes
    Given a device with display name "Smart TV" is tagged "Media"
    When the device's IP address changes from "192.168.1.10" to "192.168.1.50"
    Then the device still has the tag "Media"
    And the device still has the display name "Smart TV"

  @must
  Scenario: Add notes to device
    Given a device exists with no notes
    When the user adds the note "Main office printer, 2nd floor"
    Then the note is saved to the device record
    And the note is displayed on the device detail page

  @must
  Scenario: Filter device list by tag
    Given 10 devices exist and 4 are tagged "Printer"
    When the user filters the device list by tag "Printer"
    Then only the 4 devices tagged "Printer" are shown

  @should
  Scenario: Default suggested tags are available
    Given the application is running for the first time
    When the user opens the tag selector on any device
    Then default tags including "IoT", "Guest", "Critical", "Printer", and "Mobile" are available
    And no tags are pre-applied to any device

  @must
  Scenario: Case-insensitive tag uniqueness
    Given a tag "IoT" already exists
    When a user attempts to create a tag named "iot"
    Then the existing "IoT" tag is returned
    And no duplicate tag is created
