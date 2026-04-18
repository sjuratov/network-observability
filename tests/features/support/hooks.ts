import { After, AfterStep, Before, BeforeAll } from '@cucumber/cucumber';
import fs from 'node:fs';
import path from 'node:path';
import { CustomWorld } from './world.ts';

BeforeAll(async function () {
  fs.mkdirSync(path.resolve(process.cwd(), 'docs', 'screenshots'), { recursive: true });
});

Before(async function (this: CustomWorld, { pickle, gherkinDocument }) {
  this.featureName = gherkinDocument.feature?.name ?? 'unknown-feature';
  this.scenarioName = pickle.name;
  this.stepIndex = 0;
  this.offlineCount = 0;
  this.currentRowIndex = 0;
  this.unsupportedStatusFilter = 'archived';
  await this.openBrowser();
});

AfterStep(async function (this: CustomWorld, { pickleStep }) {
  this.stepIndex += 1;
  await this.takeStepScreenshot(pickleStep.text);
});

After(async function (this: CustomWorld) {
  await this.takeStepScreenshot('final-state');
  await this.closeBrowser();
});
