@inc-02 @f2
Feature: Device Fingerprinting & Identity
  As a network admin
  I want devices to be recognized by composite fingerprint
  So that I see a stable device list even when IPs change

  # ─── MAC-Based Identity ───

  @must
  Scenario: Same MAC across scans resolves to same device
    Given a device with MAC "aa:bb:cc:dd:ee:ff" was previously seen at IP "192.168.1.100"
    When a new scan discovers MAC "aa:bb:cc:dd:ee:ff" at IP "192.168.1.150"
    Then the scan result resolves to the same device record
    And the device's IP history contains both "192.168.1.100" and "192.168.1.150"

  @must
  Scenario: MAC address normalization — uppercase colon-separated
    Given a scan result with MAC "AA:BB:CC:DD:EE:FF"
    When the MAC is normalized
    Then the normalized MAC is "aa:bb:cc:dd:ee:ff"

  @must
  Scenario: MAC address normalization — dash-separated
    Given a scan result with MAC "AA-BB-CC-DD-EE-FF"
    When the MAC is normalized
    Then the normalized MAC is "aa:bb:cc:dd:ee:ff"

  @must
  Scenario: MAC address normalization — no separator
    Given a scan result with MAC "AABBCCDDEEFF"
    When the MAC is normalized
    Then the normalized MAC is "aa:bb:cc:dd:ee:ff"

  # ─── MAC Randomization Detection ───

  @should
  Scenario: Detect locally-administered (randomized) MAC
    Given a scan result with MAC "da:a1:19:00:00:01"
    When MAC randomization is checked
    Then the MAC is flagged as randomized

  @should
  Scenario: Universally-administered MAC is not flagged as randomized
    Given a scan result with MAC "3c:22:fb:00:00:01"
    When MAC randomization is checked
    Then the MAC is not flagged as randomized

  # ─── OUI Vendor Lookup ───

  @must
  Scenario: OUI lookup resolves known vendor
    Given the OUI database contains prefix "3C:22:FB" mapped to "Apple, Inc."
    When OUI lookup is performed for MAC "3c:22:fb:aa:bb:cc"
    Then the vendor is "Apple, Inc."

  @must
  Scenario: OUI lookup for unknown prefix returns null
    Given the OUI database does not contain prefix "FF:FF:FF"
    When OUI lookup is performed for MAC "ff:ff:ff:00:00:01"
    Then the vendor is null

  # ─── Composite Fingerprint ───

  @must
  Scenario: Composite fingerprint built from available signals
    Given a device with MAC "aa:bb:cc:dd:ee:ff"
    And the device has hostname "printer-office"
    And the device has vendor "HP Inc."
    And the device has open services "631/tcp,9100/tcp"
    When the composite fingerprint is built
    Then the fingerprint includes the MAC address
    And the fingerprint includes the hostname
    And the fingerprint includes the vendor
    And the fingerprint includes the services

  @must
  Scenario: Composite fingerprint with minimal signals
    Given a device with MAC "aa:bb:cc:dd:ee:ff"
    And the device has no hostname
    And the device has no vendor
    And the device has no open services
    When the composite fingerprint is built
    Then the fingerprint includes only the MAC address

  # ─── IP History Tracking ───

  @must
  Scenario: IP change is recorded in history
    Given a device with MAC "aa:bb:cc:dd:ee:ff" has IP history:
      | ipAddress     | firstSeen           | lastSeen            |
      | 192.168.1.100 | 2024-01-01T00:00:00 | 2024-01-15T00:00:00 |
    When the device is seen at IP "192.168.1.150" at "2024-01-16T00:00:00"
    Then the IP history contains 2 entries
    And the latest entry has IP "192.168.1.150"

  @must
  Scenario: Same IP revisited creates new history entry
    Given a device with MAC "aa:bb:cc:dd:ee:ff" has IP history:
      | ipAddress     | firstSeen           | lastSeen            |
      | 192.168.1.100 | 2024-01-01T00:00:00 | 2024-01-15T00:00:00 |
      | 192.168.1.150 | 2024-01-16T00:00:00 | 2024-02-01T00:00:00 |
    When the device is seen at IP "192.168.1.100" at "2024-02-02T00:00:00"
    Then the IP history contains 3 entries
    And the latest entry has IP "192.168.1.100"

  @must
  Scenario: Multiple IPs on same device tracked independently
    Given a device with MAC "aa:bb:cc:dd:ee:ff"
    When the device is seen at IP "192.168.1.10" at "2024-01-01T00:00:00"
    And the device is seen at IP "192.168.1.20" at "2024-01-02T00:00:00"
    Then the IP history contains 2 entries

  # ─── Device Merge ───

  @must
  Scenario: Merge two device records into one
    Given device A with MAC "aa:bb:cc:11:22:33" and 5 scan appearances
    And device B with MAC "aa:bb:cc:44:55:66" and 3 scan appearances
    When device A and device B are merged keeping name "Main Server"
    Then one merged device record exists
    And the merged device contains both MACs
    And the merged device has 8 total scan appearances
    And the merged device display name is "Main Server"

  @must
  Scenario: Merge combines IP histories from both devices
    Given device A has IP history with 2 entries
    And device B has IP history with 3 entries
    When device A and device B are merged keeping name "Server"
    Then the merged device has 5 IP history entries

  # ─── Device Split ───

  @must
  Scenario: Split a device record into two
    Given a merged device with MACs "aa:bb:cc:11:22:33" and "dd:ee:ff:11:22:33"
    And the device has 10 scan appearances
    And MAC "dd:ee:ff:11:22:33" accounts for 4 of the appearances
    When MAC "dd:ee:ff:11:22:33" is split into a new device
    Then two device records exist
    And the original device has 6 scan appearances
    And the new device has 4 scan appearances
    And no scan data is lost
