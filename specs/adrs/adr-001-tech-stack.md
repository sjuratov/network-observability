# ADR-001: Technology Stack Selection

## Status

Accepted

## Context

The Network Observability application requires: network scanning (ARP, ICMP, SYN, mDNS, SSDP), an embedded database for device and scan history, a REST API with OpenAPI documentation, a web dashboard with charts and tables, and Docker deployment with host networking for Layer 2 access. We need a cohesive technology stack that a single developer can maintain, runs in a single container, and covers all functional requirements.

## Decision

- **Runtime:** Node.js 22 LTS with TypeScript — single language across API and frontend, built-in `fetch` for webhooks, mature async I/O for concurrent scan operations.
- **API:** Fastify ^5.x with JSON Schema validation and auto-generated Swagger docs. Serves both REST endpoints (`/api/*`) and the SPA (`/*` via `@fastify/static`).
- **Database:** SQLite via better-sqlite3 ^12.x in WAL mode — embedded, zero-config, persisted via Docker volume.
- **Scanning:** nmap 7.95 CLI invoked directly with XML output parsed by fast-xml-parser. mDNS via multicast-dns, SSDP via node-ssdp, MAC vendor lookup via oui.
- **Frontend:** React ^19.x SPA built with Vite ^6.x. Recharts for visualization, @tanstack/react-table for data grids, Tailwind CSS for styling, react-router for client-side navigation.
- **Scheduling:** croner ^9.x for cron-based scan scheduling with catch-up after missed executions.
- **Deployment:** Docker multi-stage build on node:22-slim. Host networking with NET_RAW/NET_ADMIN capabilities for ARP scanning.
- **Testing:** Vitest for unit/integration tests, Playwright for e2e browser tests.

## Consequences

### Positive

- Single language (TypeScript) across entire stack reduces context switching and enables shared types.
- Single process, single container simplifies deployment and operations.
- SQLite eliminates external database dependency — zero configuration for end users.
- Fastify's native JSON Schema validation provides request validation and OpenAPI docs from a single source of truth.
- nmap CLI gives full control over scan types without depending on potentially unmaintained Node.js wrapper libraries.
- croner's catch-up feature ensures scheduled scans are not silently lost after container restarts.

### Negative

- SQLite limits write concurrency — only one writer at a time (mitigated by WAL mode for concurrent reads).
- Host networking reduces container isolation — required for ARP but limits deployment flexibility.
- nmap requires root/capabilities — container must run with elevated privileges.
- Single-process architecture means a crash in any component (API, scan, scheduler) takes down everything.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQLite performance under high device count (>10k) | Low | Medium | WAL mode, indexed queries, pagination. Migration to PostgreSQL is straightforward if needed. |
| nmap CLI interface changes between versions | Low | Low | Pin nmap 7.95 in Dockerfile, parse structured XML output. |
| better-sqlite3 native compilation issues | Medium | Medium | Pre-built binaries available for node:22-slim. Multi-stage Docker build isolates build deps. |
| React 19 ecosystem compatibility | Low | Low | Major libraries (recharts, react-router, tanstack) already support React 19. |
