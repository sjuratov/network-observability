import { execSync } from 'child_process';

export function getApiKey(): string {
  try {
    return execSync('docker exec netobserver cat /data/.api-key').toString().trim();
  } catch {
    return 'test-api-key-valid';
  }
}
