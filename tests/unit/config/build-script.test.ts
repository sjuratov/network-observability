import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('Build configuration', () => {
  it('uses the web Vite config for the default build script', () => {
    // Validates: specs/frd-dashboard.md, specs/frd-api.md
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.build).toContain('vite build --config vite.config.web.ts');
  });
});
