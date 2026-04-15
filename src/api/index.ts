import { loadConfig, validateConfig } from './config/loader.js';
import { createDatabase } from './db/database.js';
import { createServer } from './server.js';
import { createScheduler } from './scanner/scheduler.js';
import pino from 'pino';

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main() {
  const config = await loadConfig();

  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error('Invalid configuration:', validation.errors);
    process.exit(1);
  }

  const logger = pino({ level: config.logLevel });

  logger.info(
    {
      subnets: config.subnets,
      scanCadence: config.scanCadence,
      scanIntensity: config.scanIntensity,
      port: config.webUiPort,
    },
    'Starting NetObserver',
  );

  // Initialize database
  const db = createDatabase(config.dbPath);
  await db.initialize();
  logger.info({ dbPath: config.dbPath }, 'Database initialized');

  // Create Fastify server with routes, auth, CORS
  const server = await createServer({ config, db, logger });

  // Set up scan scheduler
  const scheduler = createScheduler({
    cadence: config.scanCadence,
    intensity: config.scanIntensity,
    runOnStartup: false,
  });
  scheduler.start();
  logger.info({ cadence: config.scanCadence }, 'Scan scheduler started');

  // Graceful shutdown handler
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received');

    // Stop scheduler so no new scans start
    scheduler.stop();
    logger.info('Scan scheduler stopped');

    // Wait for any in-progress scan to finish (with timeout)
    if (scheduler.isRunning()) {
      logger.info('Waiting for in-progress scan to complete...');
      const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
      while (scheduler.isRunning() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (scheduler.isRunning()) {
        logger.warn('Scan did not complete within shutdown timeout');
      }
    }

    // Close database
    try {
      db.close();
      logger.info('Database closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database');
    }

    // Close Fastify server
    try {
      await server.close();
      logger.info('Server closed');
    } catch (err) {
      logger.error({ err }, 'Error closing server');
    }

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start listening
  await server.listen({ port: config.webUiPort, host: '0.0.0.0' });
  logger.info({ port: config.webUiPort }, 'NetObserver listening');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
