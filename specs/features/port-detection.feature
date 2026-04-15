@inc-03 @f5
Feature: Port & Service Detection
  As a security-conscious user
  I want to see open ports and identified services on every device
  So that I can detect unexpected services or changes on my network

  Background:
    Given the application is configured and running
    And a network scan has discovered devices

  # ─── TCP Port Scanning ───

  @must
  Scenario: TCP port scanning detects open ports
    Given a device at "192.168.1.10" has ports 22 and 80 open
    When a port scan runs against the device
    Then the result includes port 22 with protocol "tcp" and state "open"
    And the result includes port 80 with protocol "tcp" and state "open"

  # ─── Service Identification ───

  @must
  Scenario: Service identification from well-known ports
    Given a device has the following open ports:
      | port | protocol |
      | 22   | tcp      |
      | 80   | tcp      |
      | 443  | tcp      |
    When service identification runs
    Then port 22 is identified as service "ssh"
    And port 80 is identified as service "http"
    And port 443 is identified as service "https"

  @must
  Scenario: Common service identification covers standard services
    Given the following port-to-service mappings are defined:
      | port  | service |
      | 22    | ssh     |
      | 53    | dns     |
      | 80    | http    |
      | 443   | https   |
      | 445   | smb     |
      | 631   | ipp     |
      | 8080  | http-alt|
    When service identification is invoked for each port
    Then each port maps to the expected service name

  # ─── Configurable Port Range ───

  @must
  Scenario: Configurable port range top-100
    Given the port range is configured as "top-100"
    When the port range is parsed
    Then the result contains exactly 100 port numbers

  @must
  Scenario: Configurable port range top-1000
    Given the port range is configured as "top-1000"
    When the port range is parsed
    Then the result contains exactly 1000 port numbers

  @must
  Scenario: Custom port range is parsed correctly
    Given the port range is configured as "1-1024"
    When the port range is parsed
    Then the result contains 1024 port numbers from 1 to 1024

  # ─── Port State Change Tracking ───

  @must
  Scenario: Port state change tracking — new port opened
    Given a device previously had ports [22, 80] open
    And the current scan finds ports [22, 80, 443] open
    When port changes are detected
    Then a change record shows port 443 changed from "closed" to "open"

  @must
  Scenario: Port state change tracking — port closed
    Given a device previously had ports [22, 80, 8080] open
    And the current scan finds ports [22, 80] open
    When port changes are detected
    Then a change record shows port 8080 changed from "open" to "closed"

  # ─── Service Version Detection ───

  @should
  Scenario: Service version detection from banner
    Given a device has port 22 open with banner "SSH-2.0-OpenSSH_8.9"
    When service identification runs with the banner
    Then the service is identified as "ssh"
    And the version is extracted as "OpenSSH_8.9"

  # ─── Empty Results ───

  @must
  Scenario: Empty port result for device with no open ports
    Given a device at "192.168.1.50" has no open ports
    When a port scan runs against the device
    Then the result is an empty list of ports

  # ─── Per-Device Per-Scan Storage ───

  @must
  Scenario: Port scan results stored per device per scan
    Given a scan with ID "scan-abc" discovers device "device-1"
    And the port scan finds ports 22 and 443 open on "device-1"
    When the results are recorded
    Then the port results are associated with scan "scan-abc" and device "device-1"
    And each port entry includes port number, protocol, and state
