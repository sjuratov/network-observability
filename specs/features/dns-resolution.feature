@inc-04 @f6
Feature: DNS/mDNS/SSDP Resolution
  As a network admin
  I want devices to show human-readable names resolved via DNS, mDNS, and SSDP
  So that I can quickly identify devices without memorizing IP or MAC addresses

  # ─── Reverse DNS (PTR) ───

  @must
  Scenario: Reverse DNS resolves hostname for an IP
    Given a device at IP "192.168.1.50" has a PTR record "nas.home.arpa"
    When the resolver performs a reverse DNS lookup for "192.168.1.50"
    Then the resolved DNS name is "nas.home.arpa"

  @must
  Scenario: Reverse DNS returns null for IP with no PTR record
    Given a device at IP "192.168.1.99" has no PTR record
    When the resolver performs a reverse DNS lookup for "192.168.1.99"
    Then the resolved DNS name is null

  @must
  Scenario: Reverse DNS handles timeout gracefully
    Given the DNS resolver is unreachable or slow
    When the resolver performs a reverse DNS lookup for "192.168.1.10"
    Then the lookup returns null without throwing an error
    And the scan pipeline continues without interruption

  # ─── mDNS Discovery ───

  @should
  Scenario: mDNS discovers Bonjour-announcing devices
    Given an Apple TV on the network announces via mDNS as "Living Room._airplay._tcp.local"
    When the mDNS discovery runs
    Then the mDNS results include an entry for the Apple TV's IP
    And the entry contains instance name "Living Room" and service "_airplay._tcp"

  @should
  Scenario: mDNS query for .local domain names
    Given a device announces itself as "myprinter.local" via mDNS
    When the mDNS discovery queries for ".local" names
    Then the results include "myprinter.local" mapped to its IP address

  # ─── SSDP / UPnP Discovery ───

  @should
  Scenario: SSDP discovers UPnP devices
    Given a Sonos speaker responds to SSDP M-SEARCH
    When the SSDP discovery runs
    Then the SSDP results include an entry for the speaker's IP
    And the entry contains a friendly name

  @should
  Scenario: SSDP parses device description XML for friendly name
    Given SSDP device description XML containing friendlyName "Kitchen Sonos One" and manufacturer "Sonos" and model "Sonos One"
    When the SSDP description XML is parsed
    Then the parsed info has friendlyName "Kitchen Sonos One"
    And the parsed info has manufacturer "Sonos"
    And the parsed info has modelName "Sonos One"

  # ─── Integration & Prioritization ───

  @must
  Scenario: Resolved names integrated into device profile
    Given a device at IP "192.168.1.50" with DNS name "nas.home.arpa" and mDNS names and SSDP info
    When the device names are resolved
    Then the resolved result contains dns, mdns, and ssdp fields
    And a displayName is computed from the available names

  @must
  Scenario: Name prioritization — user-assigned overrides all
    Given resolved names with dns "nas.home.arpa" and mdns "MyNAS" and ssdp "Network Storage"
    And the user has assigned the name "Dad's NAS"
    When the display name is prioritized
    Then the display name is "Dad's NAS"

  @must
  Scenario: Name prioritization — mDNS preferred over DNS and SSDP
    Given resolved names with dns "server.local" and mdns "Home Server" and ssdp "Media Box"
    And the user has not assigned a name
    When the display name is prioritized
    Then the display name is "Home Server"

  # ─── Caching ───

  @should
  Scenario: DNS result caching — cached results returned within TTL
    Given a resolver cache with "192.168.1.50" cached with TTL 3600 seconds
    And the cache entry is not expired
    When the cache is queried for "192.168.1.50"
    Then the cached resolved names are returned

  @should
  Scenario: Cache expiry — stale results refreshed after TTL
    Given a resolver cache with "192.168.1.50" cached with TTL 1 second
    And the cache entry has expired
    When the cache is queried for "192.168.1.50"
    Then the cached result is null

  @should
  Scenario: Cache clear operation
    Given a resolver cache with entries for multiple IPs
    When the cache is cleared
    Then all cache entries are removed
    And querying any previously cached IP returns null

  # ─── Error Resilience ───

  @must
  Scenario: Resolver failure does not block scan pipeline
    Given the DNS resolver throws an error for "192.168.1.10"
    And mDNS discovery throws an error
    When the full device name resolution runs for "192.168.1.10"
    Then the result still contains a displayName fallback
    And no error is thrown to the caller
