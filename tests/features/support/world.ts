import { World, setWorldConstructor, type IWorldOptions } from '@cucumber/cucumber';
import {
  chromium,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getApiKey } from '../../../e2e/helpers/config.ts';
import { DashboardPage } from '../../../e2e/pages/DashboardPage.ts';
import { DeviceListPage } from '../../../e2e/pages/DeviceListPage.ts';

const SCREENSHOT_BASE_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');
const DEFAULT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080';

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export class CustomWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  request!: APIRequestContext;
  dashboard?: DashboardPage;
  deviceList?: DeviceListPage;
  latestResponse?: APIResponse;
  latestResponseJson?: unknown;
  featureName = '';
  scenarioName = '';
  stepIndex = 0;
  offlineCount = 0;
  currentRowIndex = 0;
  unsupportedStatusFilter = 'archived';

  constructor(options: IWorldOptions) {
    super(options);
  }

  async openBrowser() {
    const apiKey = getApiKey();
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext({ baseURL: DEFAULT_BASE_URL, viewport: { width: 1280, height: 720 } });
    this.page = await this.context.newPage();
    await this.page.addInitScript((key: string) => {
      if (!localStorage.getItem('netobserver-api-key')) {
        localStorage.setItem('netobserver-api-key', key);
      }
    }, apiKey);
    this.request = await playwrightRequest.newContext({
      baseURL: DEFAULT_BASE_URL,
      extraHTTPHeaders: { 'X-API-Key': apiKey },
    });
  }

  async closeBrowser() {
    await this.request?.dispose();
    await this.context?.close();
    await this.browser?.close();
  }

  get screenshotDir(): string {
    return path.join(
      SCREENSHOT_BASE_DIR,
      slugify(this.featureName || 'unknown-feature'),
      slugify(this.scenarioName || 'unknown-scenario'),
    );
  }

  async takeStepScreenshot(stepText: string): Promise<string | undefined> {
    if (!this.page) {
      return undefined;
    }

    fs.mkdirSync(this.screenshotDir, { recursive: true });
    const filePath = path.join(this.screenshotDir, `${String(this.stepIndex).padStart(3, '0')}-${slugify(stepText)}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }
}

setWorldConstructor(CustomWorld);
