# Tech Stack Resolution

## Overview

Single-process Node.js application serving both API (Fastify) and SPA (React/Vite) from a Docker container. SQLite for embedded storage. nmap for network scanning.

All technologies researched and validated for compatibility. Version constraints are exact where stability matters, caret (`^`) where minor updates are safe.

---

## Runtime & Language

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22 LTS | Async I/O runtime, single language across full stack, built-in `fetch` for webhooks |
| TypeScript | ^5.x | Type safety for data-heavy domain model (devices, scans, alerts) |

---

## Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| fastify | ^5.x | API framework — 2-3x faster than Express, native JSON Schema validation |
| @fastify/swagger | ^9.x | Auto-generated OpenAPI spec from route schemas |
| @fastify/swagger-ui | ^5.x | Interactive API documentation UI |
| @fastify/cors | latest | CORS support for development |
| @fastify/static | latest | Serve SPA build artifacts from same container |
| better-sqlite3 | ^12.x | Fastest Node.js SQLite binding, synchronous API, WAL mode |
| pino | ^9.x | Structured JSON logging (Fastify's native logger) |
| env-schema | ^6.x | JSON Schema validation for environment variables at startup |
| js-yaml | ^4.x | YAML configuration file parsing |
| dotenv | ^16.x | `.env` file support for local development |
| croner | ^9.x | Cron scheduling — zero-dep, timezone support, catch-up for missed executions |
| nodemailer | ^6.x | SMTP email for alert notifications |

> **HTTP client:** Built-in `fetch` (Node.js 22) is used for webhook HTTP POST calls — no external dependency needed.

---

## Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | ^19.x | Component framework |
| Vite | ^6.x | Build tool with HMR dev server |
| react-router | ^7.x | Client-side SPA routing |
| recharts | ^3.x | Charts (bar, line, pie, area) built on D3 |
| @tanstack/react-table | ^8.x | Headless table with sort, filter, pagination |
| tailwindcss | ^4.x | Utility-first CSS, responsive design |

---

## Network Scanning & Discovery

| Technology | Version | Purpose |
|------------|---------|---------|
| nmap | 7.95 (CLI) | ARP/ICMP/SYN scan, service detection, XML output — installed in Docker image |
| fast-xml-parser | ^5.x | Parse nmap XML output to JSON |
| oui | ^13.x | IEEE OUI database for MAC → vendor lookup |
| multicast-dns | ^7.x | mDNS (Bonjour) device and service discovery |
| node-ssdp | ^4.x | SSDP/UPnP device discovery |

---

## Infrastructure & Deployment

| Technology | Version | Purpose |
|------------|---------|---------|
| Docker | — | Containerized deployment |
| node:22-slim | Base image | Minimal Node.js image + nmap via `apt` |

**Docker configuration:**

- Host networking (`--network=host`) for Layer 2 ARP scanning
- Capabilities: `NET_RAW`, `NET_ADMIN`
- Volume: `/data` for SQLite persistence
- Multi-stage build: Vite builds frontend → copy dist → serve via `@fastify/static`

---

## Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| vitest | ^3.x | Unit and integration tests (Vite-native, Jest-compatible API) |
| playwright | latest | End-to-end browser testing for dashboard |

---

## Key Architecture Decisions

1. **Node.js over Python/Go** — Single language for full stack. Best ecosystem coverage for mDNS, SSDP, OUI, and cron scheduling.

2. **Fastify over Express** — 2-3x faster request handling. Native JSON Schema validation on routes. Built-in Swagger generation satisfies API documentation requirements.

3. **SQLite over PostgreSQL** — Embedded, zero-config database. Docker volume persistence is sufficient. WAL mode handles concurrent reads during active scans.

4. **nmap CLI over library wrappers** — Direct invocation with XML parsing gives full control over scan arguments and output. Avoids unmaintained wrapper dependencies.

5. **React SPA over Next.js** — No SSR needed for a local network tool. Simpler Docker deployment with a single `@fastify/static` handler.

6. **croner over node-cron** — Zero dependencies. Catch-up for missed scans after container restart. Timezone support.

7. **Recharts over Chart.js** — Declarative React components with built-in responsive containers. Better integration with React state.

8. **Tailwind CSS** — Rapid UI development. Utility-first approach pairs well with headless `@tanstack/react-table` (no style conflicts).

---

## Dependency Summary

### Production Dependencies

```
fastify                   ^5.x
@fastify/swagger          ^9.x
@fastify/swagger-ui       ^5.x
@fastify/cors             latest
@fastify/static           latest
better-sqlite3            ^12.x
pino                      ^9.x
env-schema                ^6.x
js-yaml                   ^4.x
dotenv                    ^16.x
croner                    ^9.x
nodemailer                ^6.x
fast-xml-parser           ^5.x
oui                       ^13.x
multicast-dns             ^7.x
node-ssdp                 ^4.x
react                     ^19.x
react-dom                 ^19.x
react-router              ^7.x
recharts                  ^3.x
@tanstack/react-table     ^8.x
```

### Dev Dependencies

```
typescript                ^5.x
vite                      ^6.x
tailwindcss               ^4.x
vitest                    ^3.x
playwright                latest
```

### System Dependencies (Docker)

```
nmap                      7.95
```

---

## Increment Configuration Contracts

### ext-pre-001 — Device status reconciliation

| Variable | Default | Purpose |
|----------|---------|---------|
| `PRESENCE_OFFLINE_THRESHOLD` | `1` | Number of missed completed scans required before a device transitions from `unknown`/`online` to `offline`. This value must be used consistently by the scan pipeline, `GET /api/v1/devices`, and `GET /api/v1/stats/overview`. |
