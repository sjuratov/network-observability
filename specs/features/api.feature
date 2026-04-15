@inc-05 @f11
Feature: REST API (F11)
  The REST API provides programmatic access to all application data and operations
  under the `/api/v1/` prefix, with API key authentication, cursor-based pagination,
  filtering, and a consistent JSON response envelope.

  Background:
    Given the API server is running
    And the database contains seed data

  # ─── Authentication ───

  @must
  Scenario: Valid API key grants access
    Given a valid API key exists
    When I send a GET request to "/api/v1/devices" with the API key in the "X-API-Key" header
    Then the response status should be 200
    And the response body should contain a "data" property

  @must
  Scenario: Missing API key returns 401
    When I send a GET request to "/api/v1/devices" without an API key
    Then the response status should be 401
    And the response error code should be "UNAUTHORIZED"

  @must
  Scenario: Invalid API key returns 401
    When I send a GET request to "/api/v1/devices" with an invalid API key
    Then the response status should be 401
    And the response error code should be "UNAUTHORIZED"

  # ─── Devices Endpoints ───

  @must
  Scenario: GET /api/v1/devices returns paginated device list
    Given 75 devices exist in the database
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices"
    Then the response status should be 200
    And the response body "data" should be an array of 50 devices
    And the response "meta.pagination.hasMore" should be true
    And the response "meta.pagination.nextCursor" should be a non-empty string
    And the response "meta.pagination.totalCount" should be 75

  @must
  Scenario: GET /api/v1/devices with search filter
    Given devices exist with hostnames "web-server", "db-server", and "printer"
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices?search=server"
    Then the response status should be 200
    And the response body "data" should only contain devices matching "server"

  @should
  Scenario: GET /api/v1/devices with tag filter
    Given devices exist tagged with "IoT" and "Critical"
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices?tag=IoT"
    Then the response status should be 200
    And the response body "data" should only contain devices tagged "IoT"

  @must
  Scenario: GET /api/v1/devices with status filter for online devices
    Given both online and offline devices exist
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices?status=online"
    Then the response status should be 200
    And every device in "data" should have "isOnline" equal to true

  @must
  Scenario: GET /api/v1/devices/:id returns device detail
    Given a device with ID "device-001" exists
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices/device-001"
    Then the response status should be 200
    And the response "data.id" should be "device-001"
    And the response "data" should include "macAddress", "ipAddress", and "isOnline"

  @must
  Scenario: GET /api/v1/devices/:id returns 404 for unknown device
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices/nonexistent-id"
    Then the response status should be 404
    And the response error code should be "NOT_FOUND"

  @must
  Scenario: PATCH /api/v1/devices/:id updates display name and tags
    Given a device with ID "device-001" exists
    And I am authenticated with a valid API key
    When I send a PATCH request to "/api/v1/devices/device-001" with body:
      """
      { "displayName": "Living Room TV", "tags": ["Media", "IoT"] }
      """
    Then the response status should be 200
    And the response "data.displayName" should be "Living Room TV"
    And the response "data.tags" should contain "Media" and "IoT"

  @must
  Scenario: GET /api/v1/devices/:id/history returns device history
    Given a device with ID "device-001" exists with history records
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices/device-001/history"
    Then the response status should be 200
    And the response body "data" should be an array of history entries
    And each history entry should include "type" and "timestamp"

  # ─── Scans Endpoints ───

  @must
  Scenario: POST /api/v1/scans triggers manual scan
    Given no scan is currently running
    And I am authenticated with a valid API key
    When I send a POST request to "/api/v1/scans"
    Then the response status should be 201
    And the response "data.status" should be "in-progress"
    And the response "data.id" should be a non-empty string

  @must
  Scenario: POST /api/v1/scans returns 409 if scan already running
    Given a scan is currently in progress
    And I am authenticated with a valid API key
    When I send a POST request to "/api/v1/scans"
    Then the response status should be 409
    And the response error code should be "CONFLICT"

  @must
  Scenario: GET /api/v1/scans returns paginated scan list
    Given 10 scan records exist
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/scans"
    Then the response status should be 200
    And the response body "data" should be an array of scan records
    And the response should include "meta.pagination"

  @must
  Scenario: GET /api/v1/scans/:id returns scan detail
    Given a scan with ID "scan-001" exists
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/scans/scan-001"
    Then the response status should be 200
    And the response "data.id" should be "scan-001"

  # ─── Stats Endpoints ───

  @must
  Scenario: GET /api/v1/stats/overview returns dashboard stats
    Given devices and scans exist in the database
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/stats/overview"
    Then the response status should be 200
    And the response "data" should include "totalDevices", "newDevices24h", "offlineDevices", and "lastScanAt"

  # ─── Tags Endpoints ───

  @must
  Scenario: GET /api/v1/tags returns all tags
    Given tags "IoT", "Critical", and "Server" exist
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/tags"
    Then the response status should be 200
    And the response body "data" should be an array of 3 tags

  @must
  Scenario: POST /api/v1/tags creates a new tag
    And I am authenticated with a valid API key
    When I send a POST request to "/api/v1/tags" with body:
      """
      { "name": "NewTag" }
      """
    Then the response status should be 201
    And the response "data.name" should be "NewTag"

  @must
  Scenario: DELETE /api/v1/tags/:id removes a tag
    Given a tag with ID "tag-001" exists
    And I am authenticated with a valid API key
    When I send a DELETE request to "/api/v1/tags/tag-001"
    Then the response status should be 204

  # ─── Response Format ───

  @must
  Scenario: All responses use consistent JSON envelope
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices"
    Then the response should have a "data" property
    And the response should have a "meta" property
    And the "meta" should include a "timestamp" in ISO 8601 format

  @must
  Scenario: Pagination includes cursor metadata
    Given 75 devices exist in the database
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices?limit=25"
    Then the response "meta.pagination.limit" should be 25
    And the response "meta.pagination.hasMore" should be true
    And the response "meta.pagination.nextCursor" should be a non-empty string

  @must
  Scenario: Error responses use standard error format
    And I am authenticated with a valid API key
    When I send a GET request to "/api/v1/devices/nonexistent"
    Then the response status should be 404
    And the response should have an "error" property
    And the "error" should include "code" and "message"
    And the response should have a "meta.timestamp" property
