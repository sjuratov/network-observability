@inc-01 @f13
Feature: Configuration Management
  As a user of the Network Observability application
  I want the application to load, validate, and merge configuration from multiple sources
  So that I can run it with zero config or fine-tune it for my environment

  # --- Zero-Configuration Startup ---

  @must
  Scenario: Application starts with default configuration
    Given no configuration file or environment variables are provided
    When the application starts
    Then the scan cadence is set to "0 */6 * * *"
    And the data retention period is 365 days
    And the scan intensity is "normal"
    And subnets are auto-detected from network interfaces
    And the API port is 8080
    And the log level is "info"
    And the log format is "json"

  @must
  Scenario: Effective configuration is logged at startup with secrets redacted
    Given the application is configured with an API key "abc123secret"
    When the application starts
    Then the effective configuration is logged at info level
    And the API key is displayed as "****cret"

  # --- YAML Config File ---

  @should
  Scenario: Configuration loaded from YAML config file
    Given a YAML configuration file exists at the config path with:
      | parameter         | value           |
      | scan.cadence      | 0 */4 * * *     |
      | scan.intensity    | thorough        |
      | storage.retention_days | 180        |
    When the application starts
    Then the scan cadence is set to "0 */4 * * *"
    And the scan intensity is "thorough"
    And the data retention period is 180 days

  @should
  Scenario: Missing config file is not an error
    Given no configuration file exists at the config path
    When the application starts
    Then the application starts successfully
    And a log message indicates no config file was found
    And default configuration values are used

  @should
  Scenario: Empty config file is treated as no config file
    Given an empty configuration file exists at the config path
    When the application starts
    Then the application starts successfully
    And default configuration values are used

  # --- Environment Variable Override ---

  @must
  Scenario: Environment variable overrides default value
    Given the environment variable "SCAN_CADENCE" is set to "0 */2 * * *"
    And no configuration file is provided
    When the application starts
    Then the scan cadence is set to "0 */2 * * *"

  @must
  Scenario: Environment variable takes precedence over config file
    Given a YAML configuration file sets scan.cadence to "0 */4 * * *"
    And the environment variable "SCAN_CADENCE" is set to "0 */2 * * *"
    When the application starts
    Then the scan cadence is set to "0 */2 * * *"

  @must
  Scenario: Config loading order is defaults then file then env vars
    Given default scan intensity is "normal"
    And a YAML configuration file sets scan.intensity to "thorough"
    And the environment variable "SCAN_INTENSITY" is set to "quick"
    When the application starts
    Then the scan intensity is "quick"

  # --- Subnet Auto-Detection ---

  @must
  Scenario: Subnets auto-detected from network interfaces
    Given no subnets are manually configured
    And the host has non-loopback IPv4 network interfaces
    When the application starts
    Then subnets are detected from all non-loopback IPv4 interfaces
    And loopback interfaces are excluded
    And link-local addresses are excluded
    And Docker bridge interfaces are excluded
    And the detected subnets are logged at info level

  @must
  Scenario: Docker virtual interfaces excluded from auto-detection
    Given no subnets are manually configured
    And the host has interfaces named "eth0", "docker0", "br-abc123", and "veth456def"
    When the application starts
    Then only "eth0" is used for subnet detection
    And "docker0", "br-abc123", and "veth456def" are excluded

  # --- Manual Subnet Configuration ---

  @must
  Scenario: Manual subnet configuration overrides auto-detection
    Given the environment variable "SCAN_SUBNETS" is set to "192.168.1.0/24,10.0.0.0/24"
    When the application starts
    Then the configured subnets are "192.168.1.0/24" and "10.0.0.0/24"
    And auto-detected subnets are not used

  # --- Configuration Validation ---

  @must
  Scenario Outline: Invalid configuration rejected on startup
    Given the configuration parameter "<parameter>" is set to "<invalid_value>"
    When the application starts
    Then the application exits with a non-zero exit code
    And the error message contains "<expected_error>"

    Examples:
      | parameter              | invalid_value  | expected_error                          |
      | scan.subnets           | not-a-subnet   | Invalid subnet                          |
      | scan.subnets           | 999.999.999/24 | Invalid subnet                          |
      | scan.cadence           | not-a-cron     | Invalid cron expression                 |
      | storage.retention_days | 10             | Retention days must be at least 30      |
      | storage.retention_days | -5             | Retention days must be at least 30      |
      | scan.intensity         | extreme        | Must be one of: quick, normal, thorough |

  @must
  Scenario: Invalid YAML syntax in config file
    Given a configuration file with invalid YAML syntax exists at the config path
    When the application starts
    Then the application exits with a non-zero exit code
    And the error message indicates a YAML parse error

  @must
  Scenario: Validation error message identifies the parameter and invalid value
    Given the environment variable "SCAN_CADENCE" is set to "bad-cron"
    When the application starts
    Then the application exits with a non-zero exit code
    And the error message identifies the parameter "scan.cadence"
    And the error message includes the invalid value "bad-cron"
    And the error message describes the expected format

  # --- API Key Auto-Generation ---

  @must
  Scenario: API key auto-generated on first run
    Given no API key is configured via environment variable or config file
    And the application has never been run before
    When the application starts for the first time
    Then a 256-bit random API key is generated
    And the API key is stored persistently
    And the API key is logged at startup for the user to retrieve

  @must
  Scenario: Auto-generated API key persists across restarts
    Given the application previously auto-generated an API key
    When the application restarts without an explicitly configured API key
    Then the previously generated API key is reused
    And a new key is not generated

  @must
  Scenario: Explicitly configured API key overrides auto-generated key
    Given the environment variable "API_KEY" is set to "my-custom-key"
    And the application previously auto-generated a different API key
    When the application starts
    Then the API key "my-custom-key" is used
    And the auto-generated key is not used
