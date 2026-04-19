import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as serverModule from '@api/server.js';

describe('Server static asset resolution (bugfix docker root 404)', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-static-assets-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers the container public directory when running from compiled dist output', () => {
    // Validates: specs/frd-dashboard.md AC-10.1 and the requirement that the dashboard
    // is served by the same container as the API.
    const compiledModuleDir = path.join(tempDir, 'dist', 'src', 'api');
    const containerPublicDir = path.join(tempDir, 'public');

    fs.mkdirSync(compiledModuleDir, { recursive: true });
    fs.mkdirSync(containerPublicDir, { recursive: true });
    fs.writeFileSync(path.join(containerPublicDir, 'index.html'), '<!doctype html><title>NetObserver</title>');

    const resolveStaticAssetsDir = Reflect.get(serverModule, 'resolveStaticAssetsDir');

    expect(typeof resolveStaticAssetsDir).toBe('function');
    expect(resolveStaticAssetsDir(compiledModuleDir)).toBe(containerPublicDir);
  });
});
