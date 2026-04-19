export default {
  paths: [
    'specs/features/device-list-status.feature',
    'specs/features/device-detail-activity.feature',
    'specs/features/device-detail-ports.feature',
    'specs/features/settings-ui.feature',
  ],
  import: [
    'tsx/esm',
    'tests/features/support/**/*.ts',
    'tests/features/step-definitions/**/*.ts',
  ],
  format: ['progress'],
};
