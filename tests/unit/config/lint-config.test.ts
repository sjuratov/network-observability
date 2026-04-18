import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Lint configuration', () => {
  it('provides a runnable ESLint setup for the lint script', () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(pkg.scripts?.lint).toBe('eslint src/ tests/');
    expect(pkg.devDependencies?.eslint).toBeTruthy();
    expect(existsSync(join(process.cwd(), 'eslint.config.mjs'))).toBe(true);
  });
});
