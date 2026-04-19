import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';

export function getApiKey(): string {
  try {
    return execSync('docker exec netobserver cat /data/.api-key', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    try {
      return fs.readFileSync(path.resolve(process.cwd(), 'data', '.api-key'), 'utf8').trim();
    } catch {
      return 'test-api-key-valid';
    }
  }
}
