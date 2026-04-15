@inc-07 @f7
Feature: New Device Alerts
  As a network administrator
  I want to receive alerts when a previously unknown device appears on my network
  So that I can investigate potential unauthorized access immediately

  # --- New Device Detection ---

  @must
  Scenario: New device triggers alert when alerting is enabled
    Given alerting is enabled with a webhook URL configured
    And the known device list contains 5 devices
    When a scan discovers a device with MAC "AA:BB:CC:DD:EE:FF" not in the known list
    Then a new-device alert is generated for "AA:BB:CC:DD:EE:FF"

  @must
  Scenario: Known device does not trigger alert
    Given alerting is enabled
    And the device with MAC "AA:BB:CC:DD:EE:FF" is already in the known device list
    When a scan discovers the device with MAC "AA:BB:CC:DD:EE:FF"
    Then no new-device alert is generated

  # --- Webhook Delivery ---

  @must
  Scenario: Webhook delivers HTTP POST with device details
    Given a webhook URL "https://hooks.example.com/notify" is configured
    When a new-device alert is triggered for a device
    Then an HTTP POST is sent to "https://hooks.example.com/notify"
    And the request body is JSON containing "event", "timestamp", and "device" fields
    And the "device" object includes "mac", "ip", "vendor", and "hostname"

  @must
  Scenario: Alert payload includes MAC, IP, vendor, hostname
    Given a new device is discovered with MAC "AA:BB:CC:DD:EE:FF", IP "192.168.1.42", vendor "Apple, Inc.", and hostname "iPhone-Living-Room"
    When the alert payload is built for this device
    Then the payload "device.mac" is "AA:BB:CC:DD:EE:FF"
    And the payload "device.ip" is "192.168.1.42"
    And the payload "device.vendor" is "Apple, Inc."
    And the payload "device.hostname" is "iPhone-Living-Room"
    And the payload "event" is "new_device_detected"

  # --- Email Delivery ---

  @should
  Scenario: Email alert sent via SMTP
    Given SMTP is configured with host "smtp.example.com" and recipient "admin@example.com"
    When a new-device alert is triggered for a device with hostname "iPhone-Living-Room"
    Then an email is sent via SMTP to "admin@example.com"
    And the email subject contains "iPhone-Living-Room"
    And the email body contains the device MAC, IP, and vendor

  # --- Cooldown and Deduplication ---

  @must
  Scenario: Alert cooldown prevents duplicate alerts
    Given alerting is enabled with a cooldown of 3600 seconds
    And a new-device alert was sent for device "d-123" 5 minutes ago
    When the same device "d-123" is seen again in a subsequent scan
    Then no duplicate alert is sent for device "d-123"

  # --- Retry Logic ---

  @should
  Scenario: Alert retry on delivery failure with max 3 retries and backoff
    Given a webhook URL is configured
    And the webhook endpoint returns a 500 error on the first 2 attempts
    When a new-device alert is sent
    Then the system retries up to 3 times with exponential backoff
    And each retry attempt is logged with attempt number and error
    And the 3rd attempt succeeds and the alert status is "sent"

  # --- Test Endpoints ---

  @should
  Scenario: Test webhook endpoint verifies connectivity
    Given a webhook URL "https://hooks.example.com/notify" is configured
    When the test webhook endpoint is called
    Then a test payload is sent to the webhook URL
    And the response indicates whether the webhook is reachable

  @should
  Scenario: Test email endpoint verifies SMTP config
    Given SMTP is configured with host "smtp.example.com"
    When the test email endpoint is called
    Then a test email is sent to the configured recipients
    And the response indicates whether the SMTP server accepted the message

  # --- Alert History ---

  @must
  Scenario: Alert history records sent and failed status
    Given alerting is enabled and a webhook alert is delivered successfully
    And a second webhook alert fails delivery
    When the alert history is queried
    Then it contains an entry with status "sent" for the first alert
    And it contains an entry with status "failed" for the second alert
    And each entry includes timestamp, device ID, delivery type, and retry count

  # --- Suppression ---

  @must
  Scenario: No alert when alerting is not configured
    Given no webhook URL and no SMTP settings are configured
    When a new device is discovered
    Then no alert is generated
    And no error is raised

  @must
  Scenario: Device marked as known suppresses future alerts
    Given a device with MAC "AA:BB:CC:DD:EE:FF" exists with "known" set to false
    When the device is marked as "known"
    And the device reappears in a subsequent scan after being offline
    Then no new-device alert is triggered for "AA:BB:CC:DD:EE:FF"
