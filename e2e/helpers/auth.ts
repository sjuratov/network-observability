import { Page } from '@playwright/test';

export async function setApiKey(page: Page, apiKey: string) {
  await page.evaluate((key) => {
    localStorage.setItem('netobserver-api-key', key);
  }, apiKey);
}
