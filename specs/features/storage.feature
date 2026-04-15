@inc-01 @f4
Feature: Historical Data Storage
  As a user of the Network Observability application
  I want scan results and device data stored in a durable embedded database
  So that I can query historical network state and survive container restarts

  # --- Database Initialization ---

  @must
  Scenario: Database created and initialized on first startup
    Given the application starts for the first time with no existing database
    When the startup sequence completes
    Then the database file is created at the configured path
    And WAL journal mode is enabled
    And foreign keys are enabled
    And no errors are logged during initialization

  @must
  Scenario: Database schema contains all required tables
    Given the application has started successfully
    When the database schema is inspected
    Then the following tables exist:
      | table_name        |
      | devices           |
      | scans             |
      | scan_results      |
      | device_history    |
      | device_tags       |
      | schema_migrations |

  @must
  Scenario: Schema migrations are tracked
    Given the application starts with a fresh database
    When the schema migrations run
    Then the schema_migrations table records each applied migration version
    And each migration has an applied_at timestamp

  # --- Storing Scan Results ---

  @must
  Scenario: Scan metadata is recorded
    Given the database is initialized
    When a network scan completes
    Then a scan record is created with:
      | field            | present |
      | id               | yes     |
      | started_at       | yes     |
      | completed_at     | yes     |
      | status           | yes     |
      | subnets_scanned  | yes     |
      | devices_found    | yes     |
      | new_devices      | yes     |
    And the scan status is "completed"

  @must
  Scenario: Scan start and end times are accurately recorded
    Given the database is initialized
    When a network scan starts at "2024-01-15T10:00:00Z"
    And the scan completes at "2024-01-15T10:03:30Z"
    Then the scan record has started_at "2024-01-15T10:00:00Z"
    And the scan record has completed_at "2024-01-15T10:03:30Z"

  @must
  Scenario: Failed scan records error information
    Given the database is initialized
    When a network scan fails with error "Network timeout on subnet 10.0.0.0/24"
    Then the scan record status is "failed"
    And the scan record errors field contains "Network timeout on subnet 10.0.0.0/24"

  # --- Storing Device Data ---

  @must
  Scenario: Discovered device is persisted with required fields
    Given the database is initialized
    And a scan has been recorded
    When a device is discovered with MAC "AA:BB:CC:DD:EE:FF" and IP "192.168.1.42"
    Then a device record exists with MAC address "AA:BB:CC:DD:EE:FF"
    And a scan_results record links the device to the scan
    And the scan_results record includes the IP address "192.168.1.42"
    And the scan_results record includes the MAC address "AA:BB:CC:DD:EE:FF"

  @must
  Scenario: Discovery method is recorded for each device per scan
    Given the database is initialized
    And a scan has been recorded
    When a device is discovered via "arp" and "icmp" methods
    Then the scan_results record for that device includes discovery methods "arp" and "icmp"

  @must
  Scenario: Device first_seen_at and last_seen_at are set on initial discovery
    Given the database is initialized
    When a new device is discovered for the first time
    Then the device record has first_seen_at set to the current timestamp
    And the device record has last_seen_at set to the current timestamp

  @must
  Scenario: Device last_seen_at is updated on subsequent scans
    Given a device was first discovered in a previous scan
    When the same device is found again in a new scan
    Then the device last_seen_at is updated to the new scan time
    And the device first_seen_at remains unchanged

  @must
  Scenario: Each scan creates per-device snapshot records
    Given the database is initialized
    When a scan discovers 3 devices
    Then 3 scan_results records are created
    And each scan_results record references the scan ID
    And each scan_results record references a device ID

  # --- Data Retention Cleanup ---

  @must
  Scenario: Retention cleanup removes old scan data
    Given the data retention period is configured to 180 days
    And scan records exist from 200 days ago
    And scan records exist from 100 days ago
    When the retention cleanup job runs
    Then scan records older than 180 days are deleted
    And scan_results linked to deleted scans are deleted
    And device_history entries linked to deleted scans are deleted
    And scan records from 100 days ago are retained

  @must
  Scenario: Retention cleanup preserves device identity records
    Given the data retention period is configured to 180 days
    And a device was first seen 200 days ago
    And all scan_results for that device are older than 180 days
    When the retention cleanup job runs
    Then the device record itself is not deleted
    And only the historical scan data is removed

  @must
  Scenario: Retention cleanup runs on application startup
    Given old scan data exists beyond the retention period
    When the application starts
    Then the retention cleanup job executes during startup
    And expired data is removed

  @should
  Scenario: Retention cleanup runs after each scan completes
    Given old scan data exists beyond the retention period
    When a new scan completes successfully
    Then the retention cleanup job executes after the scan
    And expired data is removed

  # --- Database Persistence ---

  @must
  Scenario: Database persists across container restarts
    Given the database is stored at the configured volume path
    And devices have been discovered and stored
    When the container is stopped and restarted with the same volume mount
    Then all previously stored device data is intact
    And all previously stored scan records are queryable

  @must
  Scenario: WAL mode ensures crash recovery
    Given the application is writing scan results to the database
    When the application process is unexpectedly terminated
    And the application restarts
    Then the database is not corrupted
    And the most recently committed scan data is intact

  # --- Database Health ---

  @should
  Scenario: Database path is configurable
    Given the environment variable "STORAGE_DB_PATH" is set to "/custom/path/my.db"
    When the application starts
    Then the database is created at "/custom/path/my.db"

  @must
  Scenario: Default database path is used when not configured
    Given no database path is configured
    When the application starts
    Then the database is created at the default path "/data/network-observability.db"
