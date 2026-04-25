import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SettingsApiKeyRegenerateResponse,
  SettingsApiKeyRevealResponse,
  SettingsConfigResponse,
  SettingsConfigUpdateRequest,
  SettingsEmailTestRequest,
  SettingsErrorResponse,
  SettingsGeneralConfig,
  SettingsGeneralField,
  SettingsGeneralValidationErrors,
  SettingsSubnetsResponse,
} from '@shared/types/settings-ui.js';
import { TabBar } from '../components/TabBar';
import { useApi } from '../hooks/useApi';
import { PRESETS, cronToPreset, presetToCron, describeSchedule, type SchedulePreset } from '../utils/scan-schedule-presets';

const settingsTabs = [
  { id: 'general', label: 'General', testId: 'tab-general' },
  { id: 'network', label: 'Network', testId: 'tab-network' },
  { id: 'alerts', label: 'Alerts', testId: 'tab-alerts' },
  { id: 'api', label: 'API', testId: 'tab-api' },
];

type SettingsBanner = {
  tone: 'success' | 'error';
  message: string;
};

type SettingsAlertsConfig = {
  webhookUrl: string;
  smtpServer: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpRecipient: string;
  alertCooldown: number;
};

function maskApiKey(apiKey: string): string {
  const suffix = apiKey.slice(-4);
  return suffix ? `••••${suffix}` : '••••';
}

function persistDashboardApiKey(apiKey: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('netobserver-api-key', apiKey);
  }
}

function toTestIdFragment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase();
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function isValidCidr(value: string) {
  const match = value.match(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/);
  if (!match) {
    return false;
  }

  const [address, prefix] = value.split('/');
  const octets = address.split('.').map(Number);
  const prefixValue = Number(prefix);

  return octets.length === 4
    && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && Number.isInteger(prefixValue)
    && prefixValue >= 0
    && prefixValue <= 32;
}

function sameAlertsConfig(left: SettingsAlertsConfig | null, right: SettingsAlertsConfig) {
  return left !== null
    && left.webhookUrl === right.webhookUrl
    && left.smtpServer === right.smtpServer
    && left.smtpPort === right.smtpPort
    && left.smtpUser === right.smtpUser
    && left.smtpPassword === right.smtpPassword
    && left.smtpRecipient === right.smtpRecipient
    && left.alertCooldown === right.alertCooldown;
}

function alertsConfigFromResponse(data: SettingsConfigResponse['data']): SettingsAlertsConfig {
  const smtp = data.alertEmailSmtp;
  return {
    webhookUrl: data.alertWebhookUrl ?? '',
    smtpServer: smtp?.host ?? '',
    smtpPort: Number.isFinite(smtp?.port) ? smtp!.port : 0,
    smtpUser: smtp?.user ?? '',
    smtpPassword: smtp?.password ?? '',
    smtpRecipient: smtp?.recipient ?? '',
    alertCooldown: data.alertCooldownSeconds ?? 300,
  };
}

const inputClass = 'w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e6edf3] placeholder:text-[#6e7681] focus:outline-none focus:border-[#1f6feb]';
const labelClass = 'block text-xs text-[#8b949e] mb-1';
const cardClass = 'bg-[#161b22] border border-[#30363d] rounded-lg p-5 mb-5';
const cardTitleClass = 'text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-4';
const btnPrimary = 'px-3.5 py-2 bg-[#1f6feb] text-white text-sm font-medium rounded-md hover:bg-[#388bfd] transition-colors';
const btnOutline = 'px-3.5 py-2 text-sm font-medium border border-[#30363d] text-[#e6edf3] rounded-md hover:border-[#1f6feb] hover:text-[#58a6ff] transition-colors';
const btnDanger = 'px-3.5 py-2 text-sm font-medium border border-[#f85149] text-[#f85149] rounded-md hover:bg-[#f85149]/10 transition-colors';
const btnSuccess = 'px-3.5 py-2 text-sm font-medium border border-[#3fb950] text-[#3fb950] rounded-md hover:bg-[#3fb950]/10 transition-colors';

export function SettingsPage() {
  const api = useApi();
  const [activeTab, setActiveTab] = useState('general');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<SettingsBanner | null>(null);

  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalFieldErrors, setGeneralFieldErrors] = useState<SettingsGeneralValidationErrors>({});
  const [restartRequiredFields, setRestartRequiredFields] = useState<SettingsGeneralField[]>([]);
  const [envManagedFields, setEnvManagedFields] = useState<SettingsGeneralField[]>([]);
  const [loadedGeneralSettings, setLoadedGeneralSettings] = useState<SettingsGeneralConfig | null>(null);
  const [settingsApiKey, setSettingsApiKey] = useState('nobs_••••••••••••••••••••••••');

  const [generalSettings, setGeneralSettings] = useState<SettingsGeneralConfig>({
    scanCadence: '*/30 * * * *',
    scanIntensity: 'normal',
    dataRetentionDays: 90,
  });

  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>(() => cronToPreset('*/30 * * * *'));
  const [customCron, setCustomCron] = useState('');

  const handlePresetChange = useCallback((presetId: string) => {
    if (presetId === 'custom') {
      setSchedulePreset({ presetId: 'custom', cron: generalSettings.scanCadence });
      setCustomCron(generalSettings.scanCadence);
      return;
    }
    if (presetId === 'once-a-day') {
      const newPreset: SchedulePreset = { presetId: 'once-a-day', hour: 0 };
      setSchedulePreset(newPreset);
      const cron = presetToCron('once-a-day', 0)!;
      setGeneralSettings((s) => ({ ...s, scanCadence: cron }));
      return;
    }
    const cron = presetToCron(presetId);
    if (cron) {
      setSchedulePreset({ presetId });
      setGeneralSettings((s) => ({ ...s, scanCadence: cron }));
    }
  }, [generalSettings.scanCadence]);

  const handleHourChange = useCallback((hour: number) => {
    setSchedulePreset((prev) => ({ ...prev, hour }));
    const cron = presetToCron('once-a-day', hour)!;
    setGeneralSettings((s) => ({ ...s, scanCadence: cron }));
  }, []);

  const handleCustomCronChange = useCallback((value: string) => {
    setCustomCron(value);
    setSchedulePreset((prev) => ({ ...prev, cron: value }));
    setGeneralSettings((s) => ({ ...s, scanCadence: value }));
  }, []);

  const [detectedSubnets, setDetectedSubnets] = useState<SettingsSubnetsResponse['data']['detected']>([]);
  const [configuredSubnets, setConfiguredSubnets] = useState<string[]>([]);
  const [loadedConfiguredSubnets, setLoadedConfiguredSubnets] = useState<string[]>([]);
  const [manualSubnet, setManualSubnet] = useState('');
  const [manualSubnetError, setManualSubnetError] = useState<string | null>(null);
  const [isSavingNetwork, setIsSavingNetwork] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [smtpServer, setSmtpServer] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpRecipient, setSmtpRecipient] = useState('');
  const [alertCooldown, setAlertCooldown] = useState(300);
  const [loadedAlertsSettings, setLoadedAlertsSettings] = useState<SettingsAlertsConfig | null>(null);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isSavingAlerts, setIsSavingAlerts] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<SettingsBanner | null>(null);
  const [emailTestResult, setEmailTestResult] = useState<SettingsBanner | null>(null);

  const [showKey, setShowKey] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [freshRegeneratedApiKey, setFreshRegeneratedApiKey] = useState<string | null>(null);
  const [isRevealingApiKey, setIsRevealingApiKey] = useState(false);
  const [isRegeneratingApiKey, setIsRegeneratingApiKey] = useState(false);

  const envManagedSet = useMemo(() => new Set(envManagedFields), [envManagedFields]);
  const hasGeneralChanges = loadedGeneralSettings !== null && (
    loadedGeneralSettings.scanCadence !== generalSettings.scanCadence
    || loadedGeneralSettings.scanIntensity !== generalSettings.scanIntensity
    || loadedGeneralSettings.dataRetentionDays !== generalSettings.dataRetentionDays
  );
  const hasNetworkChanges = !arraysEqual(loadedConfiguredSubnets, configuredSubnets);
  const currentAlertsSettings: SettingsAlertsConfig = {
    webhookUrl,
    smtpServer,
    smtpPort,
    smtpUser,
    smtpPassword,
    smtpRecipient,
    alertCooldown,
  };
  const hasAlertsChanges = !sameAlertsConfig(loadedAlertsSettings, currentAlertsSettings);

  function normalizeFieldMessage(field: SettingsGeneralField, message: string) {
    if (field === 'scanCadence' && message.includes('Invalid cron expression')) {
      return 'Invalid cron expression';
    }

    if (field === 'dataRetentionDays' && message.includes('retention')) {
      return 'Retention must be at least 30 days';
    }

    return message;
  }

  function extractErrorBody(error: unknown): SettingsErrorResponse | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }

    const candidate = error as Error & { body?: unknown };
    if (!candidate.body || typeof candidate.body !== 'object') {
      return undefined;
    }

    return candidate.body as SettingsErrorResponse;
  }

  function validateGeneralSettings(config: SettingsGeneralConfig): SettingsGeneralValidationErrors {
    const errors: SettingsGeneralValidationErrors = {};

    if (config.scanCadence.trim().split(/\s+/).length !== 5) {
      errors.scanCadence = 'Invalid cron expression';
    }

    if (!Number.isFinite(config.dataRetentionDays) || config.dataRetentionDays < 30) {
      errors.dataRetentionDays = 'Retention must be at least 30 days';
    }

    return errors;
  }

  function applyAlertsSettings(next: SettingsAlertsConfig) {
    setWebhookUrl(next.webhookUrl);
    setSmtpServer(next.smtpServer);
    setSmtpPort(next.smtpPort);
    setSmtpUser(next.smtpUser);
    setSmtpPassword(next.smtpPassword);
    setSmtpRecipient(next.smtpRecipient);
    setAlertCooldown(next.alertCooldown);
    setLoadedAlertsSettings(next);
  }

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [configResponse, subnetsResponse]: [SettingsConfigResponse, SettingsSubnetsResponse] = await Promise.all([
        api.getSettings(),
        api.getSettingsSubnets(),
      ]);

      const nextGeneralSettings: SettingsGeneralConfig = {
        scanCadence: configResponse.data.scanCadence,
        scanIntensity: configResponse.data.scanIntensity,
        dataRetentionDays: configResponse.data.dataRetentionDays,
      };

      setGeneralSettings(nextGeneralSettings);
      setLoadedGeneralSettings(nextGeneralSettings);

      // Hydrate schedule preset from loaded cron
      const loadedPreset = cronToPreset(configResponse.data.scanCadence);
      setSchedulePreset(loadedPreset);
      if (loadedPreset.presetId === 'custom' && loadedPreset.cron) {
        setCustomCron(loadedPreset.cron);
      }

      setEnvManagedFields(
        configResponse.meta.envOverridden.filter((field): field is SettingsGeneralField =>
          field === 'scanCadence' || field === 'scanIntensity' || field === 'dataRetentionDays',
        ),
      );
      setSettingsApiKey(configResponse.data.apiKey);
      setRestartRequiredFields([]);
      setGeneralFieldErrors({});
      setDetectedSubnets(subnetsResponse.data.detected);
      const nextConfiguredSubnets = subnetsResponse.data.configured.map((entry) => entry.cidr);
      setConfiguredSubnets(nextConfiguredSubnets);
      setLoadedConfiguredSubnets(nextConfiguredSubnets);
      setManualSubnet('');
      setManualSubnetError(null);
      applyAlertsSettings(alertsConfigFromResponse(configResponse.data));
      setWebhookTestResult(null);
      setEmailTestResult(null);
    } catch {
      setLoadError('Unable to load settings. Check server connection.');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSaveGeneral() {
    const validationErrors = validateGeneralSettings(generalSettings);
    if (Object.keys(validationErrors).length > 0) {
      setGeneralFieldErrors(validationErrors);
      return;
    }

    if (!loadedGeneralSettings) {
      return;
    }

    const payload: SettingsConfigUpdateRequest = {};

    if (generalSettings.scanCadence !== loadedGeneralSettings.scanCadence) {
      payload.scanCadence = generalSettings.scanCadence;
    }

    if (generalSettings.scanIntensity !== loadedGeneralSettings.scanIntensity) {
      payload.scanIntensity = generalSettings.scanIntensity;
    }

    if (generalSettings.dataRetentionDays !== loadedGeneralSettings.dataRetentionDays) {
      payload.dataRetentionDays = generalSettings.dataRetentionDays;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    setIsSavingGeneral(true);
    setBanner(null);
    setGeneralFieldErrors({});

    try {
      const response = await api.updateSettings(payload);
      const nextGeneralSettings: SettingsGeneralConfig = {
        scanCadence: response.data.scanCadence,
        scanIntensity: response.data.scanIntensity,
        dataRetentionDays: response.data.dataRetentionDays,
      };

      setGeneralSettings(nextGeneralSettings);
      setLoadedGeneralSettings(nextGeneralSettings);
      setRestartRequiredFields(response.meta.restartRequired.filter((field): field is SettingsGeneralField =>
        field === 'scanCadence' || field === 'scanIntensity' || field === 'dataRetentionDays',
      ));
      setBanner({ tone: 'success', message: 'Settings saved successfully' });
    } catch (error) {
      const errorBody = extractErrorBody(error);
      const details = errorBody?.error.details ?? [];
      const nextFieldErrors: SettingsGeneralValidationErrors = {};

      for (const detail of details) {
        if (
          detail.field === 'scanCadence'
          || detail.field === 'scanIntensity'
          || detail.field === 'dataRetentionDays'
        ) {
          nextFieldErrors[detail.field] = normalizeFieldMessage(detail.field, detail.message);
        }
      }

      setGeneralFieldErrors(nextFieldErrors);
      setBanner({
        tone: 'error',
        message: errorBody?.error.message ?? 'Unable to save settings. Check server connection.',
      });
    } finally {
      setIsSavingGeneral(false);
    }
  }

  function handleManualSubnetChange(value: string) {
    setManualSubnet(value);
    if (!value.trim()) {
      setManualSubnetError(null);
      return;
    }

    if (isValidCidr(value.trim())) {
      setManualSubnetError(null);
    }
  }

  function handleAddSubnet() {
    const normalized = manualSubnet.trim();
    if (!isValidCidr(normalized)) {
      setManualSubnetError('Enter a valid CIDR subnet');
      return;
    }

    if (!configuredSubnets.includes(normalized)) {
      setConfiguredSubnets((current) => [...current, normalized]);
    }
    setManualSubnet('');
    setManualSubnetError(null);
  }

  function handleRemoveSubnet(cidr: string) {
    setConfiguredSubnets((current) => current.filter((value) => value !== cidr));
    setManualSubnetError(null);
  }

  async function handleSaveNetwork() {
    if (!hasNetworkChanges || manualSubnetError) {
      return;
    }

    setIsSavingNetwork(true);
    setBanner(null);

    try {
      const response = await api.updateSettings({ subnets: configuredSubnets });
      setConfiguredSubnets(response.data.subnets);
      setLoadedConfiguredSubnets(response.data.subnets);
      setBanner({ tone: 'success', message: 'Settings saved successfully' });
    } catch (error) {
      const errorBody = extractErrorBody(error);
      setBanner({
        tone: 'error',
        message: errorBody?.error.message ?? 'Unable to save settings. Check server connection.',
      });
    } finally {
      setIsSavingNetwork(false);
    }
  }

  async function handleTestWebhook() {
    if (!webhookUrl.trim()) {
      return;
    }

    setIsTestingWebhook(true);
    setWebhookTestResult(null);

    try {
      const response = await api.testSettingsWebhook({ url: webhookUrl.trim() });
      setWebhookTestResult({ tone: 'success', message: response.data.message });
    } catch (error) {
      const errorBody = extractErrorBody(error);
      setWebhookTestResult({
        tone: 'error',
        message: errorBody?.error.message ?? 'Unable to test webhook.',
      });
    } finally {
      setIsTestingWebhook(false);
    }
  }

  async function handleTestEmail() {
    const payload: SettingsEmailTestRequest = {
      host: smtpServer.trim(),
      port: smtpPort,
      user: smtpUser.trim(),
      password: smtpPassword,
      recipient: smtpRecipient.trim(),
    };

    if (!payload.host || !payload.recipient || !Number.isFinite(payload.port) || payload.port < 1) {
      return;
    }

    setIsTestingEmail(true);
    setEmailTestResult(null);

    try {
      const response = await api.testSettingsEmail(payload);
      setEmailTestResult({ tone: 'success', message: response.data.message });
    } catch (error) {
      const errorBody = extractErrorBody(error);
      setEmailTestResult({
        tone: 'error',
        message: errorBody?.error.message ?? 'Unable to test email delivery.',
      });
    } finally {
      setIsTestingEmail(false);
    }
  }

  async function handleSaveAlerts() {
    if (!loadedAlertsSettings) {
      return;
    }

    const payload: SettingsConfigUpdateRequest = {};
    const normalizedWebhookUrl = webhookUrl.trim();
    const normalizedSmtpServer = smtpServer.trim();
    const normalizedSmtpUser = smtpUser.trim();
    const normalizedSmtpRecipient = smtpRecipient.trim();

    if (normalizedWebhookUrl !== loadedAlertsSettings.webhookUrl) {
      payload.alertWebhookUrl = normalizedWebhookUrl || null;
    }

    if (
      normalizedSmtpServer !== loadedAlertsSettings.smtpServer
      || smtpPort !== loadedAlertsSettings.smtpPort
      || normalizedSmtpUser !== loadedAlertsSettings.smtpUser
      || smtpPassword !== loadedAlertsSettings.smtpPassword
      || normalizedSmtpRecipient !== loadedAlertsSettings.smtpRecipient
    ) {
      payload.alertEmailSmtp = {
        host: normalizedSmtpServer,
        port: smtpPort,
        user: normalizedSmtpUser,
        password: smtpPassword,
        recipient: normalizedSmtpRecipient,
      };
    }

    if (alertCooldown !== loadedAlertsSettings.alertCooldown) {
      payload.alertCooldownSeconds = alertCooldown;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    setIsSavingAlerts(true);
    setBanner(null);

    try {
      const response = await api.updateSettings(payload);
      applyAlertsSettings(alertsConfigFromResponse(response.data));
      setBanner({ tone: 'success', message: 'Alert settings saved' });
    } catch (error) {
      const errorBody = extractErrorBody(error);
      setBanner({
        tone: 'error',
        message: errorBody?.error.message ?? 'Unable to save settings. Check server connection.',
      });
    } finally {
      setIsSavingAlerts(false);
    }
  }

  async function handleToggleApiKeyVisibility() {
    if (freshRegeneratedApiKey || showKey) {
      setFreshRegeneratedApiKey(null);
      setShowKey(false);
      return;
    }

    if (revealedApiKey) {
      setShowKey(true);
      return;
    }

    setIsRevealingApiKey(true);
    setBanner(null);

    try {
      const response: SettingsApiKeyRevealResponse = await api.revealSettingsApiKey();
      setFreshRegeneratedApiKey(null);
      setRevealedApiKey(response.data.apiKey);
      setShowKey(true);
    } catch (error) {
      const errorBody = extractErrorBody(error);
      setBanner({
        tone: 'error',
        message: errorBody?.error.message ?? 'Unable to reveal API key. Check server connection.',
      });
    } finally {
      setIsRevealingApiKey(false);
    }
  }

  async function handleCopyApiKey() {
    if (!revealedApiKey) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setBanner({ tone: 'error', message: 'Unable to copy API key.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(revealedApiKey);
      setBanner({ tone: 'success', message: 'Copied!' });
    } catch {
      setBanner({ tone: 'error', message: 'Unable to copy API key.' });
    }
  }

  async function handleRegenerateApiKey() {
    setIsRegeneratingApiKey(true);
    setBanner(null);

    try {
      const response: SettingsApiKeyRegenerateResponse = await api.regenerateSettingsApiKey();
      const nextApiKey = response.data.apiKey;
      persistDashboardApiKey(nextApiKey);
      setSettingsApiKey(maskApiKey(nextApiKey));
      setFreshRegeneratedApiKey(nextApiKey);
      setRevealedApiKey(nextApiKey);
      setShowKey(true);
      setConfirmRegen(false);
      setBanner({ tone: 'success', message: response.data.message });
    } catch (error) {
      const errorBody = extractErrorBody(error);
      setBanner({
        tone: 'error',
        message: errorBody?.error.message ?? 'Unable to regenerate API key. Check server connection.',
      });
    } finally {
      setIsRegeneratingApiKey(false);
    }
  }

  const generalSaveDisabled = isLoading || isSavingGeneral || !hasGeneralChanges;
  const networkSaveDisabled = isLoading || isSavingNetwork || !!manualSubnetError || !hasNetworkChanges;
  const alertsSaveDisabled = isLoading || isSavingAlerts || !hasAlertsChanges;
  const webhookTestDisabled = isLoading || isTestingWebhook || !webhookUrl.trim();
  const emailTestDisabled = isLoading || isTestingEmail || !smtpServer.trim() || !smtpRecipient.trim() || !Number.isFinite(smtpPort) || smtpPort < 1;
  const bannerMessage = banner?.message ?? loadError;
  const bannerTone = banner?.tone ?? (loadError ? 'error' : null);
  const bannerClass = bannerTone === 'error'
    ? 'bg-[#3d1116] border-[#f85149] text-[#f85149]'
    : 'bg-[#132a13] border-[#3fb950] text-[#3fb950]';
  const visibleApiKey = freshRegeneratedApiKey ?? (showKey && revealedApiKey ? revealedApiKey : null);
  const displayedApiKey = isRevealingApiKey ? 'Loading...' : visibleApiKey ?? maskApiKey(settingsApiKey);
  const copyKeyDisabled = !visibleApiKey || isRevealingApiKey || isRegeneratingApiKey;

  return (
    <div data-testid="page-settings" className="max-w-[900px]">
      <h1 className="text-xl font-bold text-[#e6edf3] mb-5">Settings</h1>

      <div data-testid="settings-form">
        <TabBar
          tabs={settingsTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          testId="settings-tabs"
        />

        <div
          data-testid="alert-banner"
          className={`mb-4 rounded-md border px-4 py-2 text-sm ${bannerMessage ? bannerClass : 'hidden'}`}
        >
          {bannerMessage ?? 'Settings saved successfully'}
        </div>

        <div
          data-testid="settings-loading"
          className={`mb-4 rounded-md border border-[#30363d] bg-[#161b22] px-4 py-2 text-sm text-[#8b949e] ${isLoading ? '' : 'hidden'}`}
        >
          Loading settings...
        </div>

        <div
          data-error-message={loadError ?? 'Unable to load settings. Check server connection.'}
          className={`mb-4 rounded-md border border-[#f85149] bg-[#3d1116] px-4 py-3 text-sm text-[#f85149] ${loadError ? '' : 'hidden'}`}
        >
          <div className="mt-3">
            <button
              type="button"
              data-testid="settings-retry"
              className={btnOutline}
              onClick={() => { void loadSettings(); }}
            >
              Retry
            </button>
          </div>
        </div>

        {activeTab === 'general' && !loadError && (
          <div data-testid="panel-general" className={isLoading ? 'hidden' : ''}>
            <div
              data-testid="restart-required-banner"
              className={`mb-4 rounded-md border border-[#1f6feb] bg-[#0d1f33] px-4 py-2 text-sm text-[#58a6ff] ${restartRequiredFields.length > 0 ? '' : 'hidden'}`}
            >
              Some changes require a restart
            </div>

            <div className={cardClass}>
              <div className={cardTitleClass}>Scan Schedule</div>
              <div className="mb-0">
                <div className="mb-1 flex items-center gap-2">
                  <label htmlFor="schedule-preset" className={`${labelClass} mb-0`}>How often should scans run?</label>
                  <span
                    data-testid="field-scan-cadence-restart"
                    className={`rounded-full border border-[#1f6feb] px-2 py-0.5 text-[11px] text-[#58a6ff] ${restartRequiredFields.includes('scanCadence') ? '' : 'hidden'}`}
                  >
                    Requires restart
                  </span>
                </div>
                <select
                  id="schedule-preset"
                  data-testid="select-schedule-preset"
                  value={schedulePreset.presetId}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className={inputClass}
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>

                {schedulePreset.presetId === 'once-a-day' && (
                  <div className="mt-2" data-testid="hour-picker-group">
                    <label htmlFor="schedule-hour" className={labelClass}>At what time?</label>
                    <select
                      id="schedule-hour"
                      data-testid="select-schedule-hour"
                      value={schedulePreset.hour ?? 0}
                      onChange={(e) => handleHourChange(Number(e.target.value))}
                      className={inputClass}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                )}

                {schedulePreset.presetId === 'custom' && (
                  <div className="mt-2" data-testid="custom-cron-group">
                    <label htmlFor="cron-input" className={labelClass}>Cron expression</label>
                    <input
                      type="text"
                      id="cron-input"
                      data-testid="input-cron"
                      value={customCron}
                      onChange={(e) => handleCustomCronChange(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}

                <div
                  data-testid="field-scan-cadence-error"
                  className={`mt-1 text-xs text-[#f85149] ${generalFieldErrors.scanCadence ? '' : 'hidden'}`}
                >
                  {generalFieldErrors.scanCadence ?? 'Invalid cron expression'}
                </div>
                <div data-testid="cron-preview" className="text-xs text-[#6e7681] mt-1">
                  {describeSchedule(schedulePreset)}
                </div>
              </div>
            </div>

            <div className={cardClass}>
              <div className={cardTitleClass}>Scan Intensity</div>
              <div className="mb-2 flex items-center gap-2">
                <span
                  data-testid="field-scan-intensity-restart"
                  className={`rounded-full border border-[#1f6feb] px-2 py-0.5 text-[11px] text-[#58a6ff] ${restartRequiredFields.includes('scanIntensity') ? '' : 'hidden'}`}
                >
                  Requires restart
                </span>
                <span
                  data-testid="field-scan-intensity-env-managed"
                  className={`rounded-full border border-[#e3b341] px-2 py-0.5 text-[11px] text-[#e3b341] ${envManagedSet.has('scanIntensity') ? '' : 'hidden'}`}
                >
                  Set via environment variable
                </span>
              </div>
              <div data-testid="scan-intensity" className="flex gap-5 mt-1">
                {(['quick', 'normal', 'thorough'] as const).map((val) => (
                  <label key={val} className="flex items-center gap-1.5 text-sm text-[#e6edf3] cursor-pointer">
                    <input
                      type="radio"
                      name="intensity"
                      value={val}
                      data-testid={`radio-${val}`}
                      checked={generalSettings.scanIntensity === val}
                      onChange={() => setGeneralSettings((current) => ({ ...current, scanIntensity: val }))}
                      disabled={envManagedSet.has('scanIntensity')}
                      className="accent-[#1f6feb]"
                    />
                    {val.charAt(0).toUpperCase() + val.slice(1)}
                  </label>
                ))}
              </div>
              <div className="text-xs text-[#6e7681] mt-2">
                Quick: ARP only (~30s) · Normal: ARP + basic ports (~3min) · Thorough: full port scan (~10min)
              </div>
            </div>

            <div className={cardClass}>
              <div className={cardTitleClass}>Data Retention</div>
              <label htmlFor="retention-days" className={labelClass}>Keep historical data for</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="retention-days"
                  data-testid="input-retention-days"
                  value={generalSettings.dataRetentionDays}
                  onChange={(e) => setGeneralSettings((current) => ({ ...current, dataRetentionDays: Number(e.target.value) }))}
                  min={1}
                  max={365}
                  className={`${inputClass} w-24`}
                />
                <span className="text-sm text-[#e6edf3]">days</span>
              </div>
              <div
                data-testid="field-retention-days-error"
                className={`mt-1 text-xs text-[#f85149] ${generalFieldErrors.dataRetentionDays ? '' : 'hidden'}`}
              >
                {generalFieldErrors.dataRetentionDays ?? 'Retention must be at least 30 days'}
              </div>
              <div className="text-xs text-[#6e7681] mt-1">
                Older scan results and presence data will be automatically purged.
              </div>
            </div>

            <div className="flex justify-end">
              <button
                data-testid="btn-save-general"
                className={`${btnPrimary} ${generalSaveDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                disabled={generalSaveDisabled}
                onClick={() => { void handleSaveGeneral(); }}
              >
                {isSavingGeneral ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'network' && !loadError && (
          <div data-testid="panel-network" className={isLoading ? 'hidden' : ''}>
            <div data-testid="subnet-list">
              <div className={cardClass}>
                <div className={cardTitleClass}>Detected Subnets</div>
                <ul data-testid="subnet-detected-list" className="mb-3 space-y-2">
                  {detectedSubnets.map((entry) => (
                    <li
                      key={entry.cidr}
                      data-testid={`detected-subnet-${toTestIdFragment(entry.cidr)}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-[#30363d] px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="text-[#e6edf3]">{entry.cidr}</div>
                        {entry.interface ? <div className="text-xs text-[#6e7681]">{entry.interface}</div> : null}
                      </div>
                      <span
                        data-testid={`detected-subnet-badge-${toTestIdFragment(entry.cidr)}`}
                        className="rounded-full border border-[#1f6feb] px-2 py-0.5 text-[11px] text-[#58a6ff]"
                      >
                        Detected
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-[#6e7681]">Detected subnets are read-only and reflect the live network scan environment.</div>
              </div>

              <div className={cardClass}>
                <div className={cardTitleClass}>Configured Subnets</div>
                <ul data-testid="subnet-configured-list" className="mb-3 space-y-2">
                  {configuredSubnets.map((cidr) => (
                    <li
                      key={cidr}
                      data-testid={`configured-subnet-${toTestIdFragment(cidr)}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-[#30363d] px-3 py-2 text-sm"
                    >
                      <span className="text-[#e6edf3]">{cidr}</span>
                      <button
                        type="button"
                        data-testid={`configured-subnet-remove-${toTestIdFragment(cidr)}`}
                        className={btnOutline}
                        onClick={() => handleRemoveSubnet(cidr)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-[#6e7681]">Configured subnets are editable and saved back to runtime settings.</div>
              </div>
            </div>

            <div className={cardClass}>
              <div className={cardTitleClass}>Add Subnet Manually</div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="manual-subnet" className={labelClass}>Subnet (CIDR notation)</label>
                  <input
                    type="text"
                    id="manual-subnet"
                    data-testid="input-manual-subnet"
                    value={manualSubnet}
                    onChange={(e) => handleManualSubnetChange(e.target.value)}
                    placeholder="10.0.0.0/24"
                    className={inputClass}
                  />
                  <div
                    data-testid="field-manual-subnet-error"
                    className={`mt-1 text-xs text-[#f85149] ${manualSubnetError ? '' : 'hidden'}`}
                  >
                    {manualSubnetError ?? 'Enter a valid CIDR subnet'}
                  </div>
                </div>
                <button type="button" data-testid="btn-add-subnet" className={btnPrimary} onClick={handleAddSubnet}>
                  Add
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                data-testid="btn-save-network"
                className={`${btnPrimary} ${networkSaveDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                disabled={networkSaveDisabled}
                onClick={() => { void handleSaveNetwork(); }}
              >
                {isSavingNetwork ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && !loadError && (
          <div data-testid="panel-alerts" className={isLoading ? 'hidden' : ''}>
            <div className={cardClass}>
              <div className={cardTitleClass}>Webhook</div>
              <div className="mb-3">
                <label htmlFor="webhook-url" className={labelClass}>Webhook URL</label>
                <input
                  type="text"
                  id="webhook-url"
                  data-testid="input-webhook-url"
                  value={webhookUrl}
                  onChange={(e) => {
                    setWebhookUrl(e.target.value);
                    setWebhookTestResult(null);
                  }}
                  placeholder="https://hooks.example.com/netobserver"
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                data-testid="btn-test-webhook"
                className={`${btnSuccess} ${webhookTestDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                disabled={webhookTestDisabled}
                onClick={() => { void handleTestWebhook(); }}
              >
                {isTestingWebhook ? 'Testing...' : 'Test Webhook'}
              </button>
              <div
                data-testid="webhook-test-result"
                className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                  webhookTestResult
                    ? webhookTestResult.tone === 'error'
                      ? 'border-[#f85149] bg-[#3d1116] text-[#f85149]'
                      : 'border-[#3fb950] bg-[#132a13] text-[#3fb950]'
                    : 'hidden'
                }`}
              >
                {webhookTestResult?.message ?? 'Webhook test result'}
              </div>
            </div>

            <div className={cardClass}>
              <div className={cardTitleClass}>Email (SMTP)</div>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label htmlFor="smtp-server" className={labelClass}>SMTP Server</label>
                  <input
                    type="text"
                    id="smtp-server"
                    data-testid="input-smtp-server"
                    value={smtpServer}
                    onChange={(e) => {
                      setSmtpServer(e.target.value);
                      setEmailTestResult(null);
                    }}
                    placeholder="smtp.gmail.com"
                    className={inputClass}
                  />
                </div>
                <div className="w-24">
                  <label htmlFor="smtp-port" className={labelClass}>Port</label>
                  <input
                    type="number"
                    id="smtp-port"
                    data-testid="input-smtp-port"
                    value={Number.isFinite(smtpPort) ? smtpPort : ''}
                    onChange={(e) => {
                      setSmtpPort(e.target.value === '' ? 0 : Number(e.target.value));
                      setEmailTestResult(null);
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label htmlFor="smtp-user" className={labelClass}>Username</label>
                  <input
                    type="text"
                    id="smtp-user"
                    data-testid="input-smtp-user"
                    value={smtpUser}
                    onChange={(e) => {
                      setSmtpUser(e.target.value);
                      setEmailTestResult(null);
                    }}
                    placeholder="alerts@example.com"
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="smtp-password" className={labelClass}>Password</label>
                  <input
                    type="password"
                    id="smtp-password"
                    data-testid="input-smtp-password"
                    value={smtpPassword}
                    onChange={(e) => {
                      setSmtpPassword(e.target.value);
                      setEmailTestResult(null);
                    }}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="smtp-recipient" className={labelClass}>Recipient Email</label>
                <input
                  type="email"
                  id="smtp-recipient"
                  data-testid="input-smtp-recipient"
                  value={smtpRecipient}
                  onChange={(e) => {
                    setSmtpRecipient(e.target.value);
                    setEmailTestResult(null);
                  }}
                  placeholder="admin@example.com"
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                data-testid="btn-test-email"
                className={`${btnSuccess} ${emailTestDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                disabled={emailTestDisabled}
                onClick={() => { void handleTestEmail(); }}
              >
                {isTestingEmail ? 'Testing...' : 'Test Email'}
              </button>
              <div
                data-testid="email-test-result"
                className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                  emailTestResult
                    ? emailTestResult.tone === 'error'
                      ? 'border-[#f85149] bg-[#3d1116] text-[#f85149]'
                      : 'border-[#3fb950] bg-[#132a13] text-[#3fb950]'
                    : 'hidden'
                }`}
              >
                {emailTestResult?.message ?? 'Email test result'}
              </div>
            </div>

            <div className={cardClass}>
              <div className={cardTitleClass}>Alert Cooldown</div>
              <label htmlFor="cooldown" className={labelClass}>Minimum time between repeated alerts</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="cooldown"
                  data-testid="input-alert-cooldown"
                  value={alertCooldown}
                  onChange={(e) => setAlertCooldown(Number(e.target.value))}
                  min={0}
                  className={`${inputClass} w-24`}
                />
                <span className="text-sm text-[#e6edf3]">seconds</span>
              </div>
              <div className="text-xs text-[#6e7681] mt-1">
                Default: 300 seconds (5 minutes). Set to 0 for no cooldown.
              </div>
            </div>

            <div className="flex justify-end">
              <button
                data-testid="btn-save-alerts"
                className={`${btnPrimary} ${alertsSaveDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                disabled={alertsSaveDisabled}
                onClick={() => { void handleSaveAlerts(); }}
              >
                {isSavingAlerts ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        <div data-testid="panel-api" className={activeTab === 'api' ? '' : 'hidden'}>
            <div className={cardClass}>
              <div className={cardTitleClass}>API Key</div>
              <div className="mb-3">
                <label className={labelClass}>Current API Key</label>
                <div data-testid="api-key-display" className="flex items-center gap-2 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 font-mono text-sm text-[#8b949e]">
                  <span data-testid="api-key-value" className="flex-1">
                    {displayedApiKey}
                  </span>
                  <button
                    data-testid="btn-show-key"
                    onClick={() => { void handleToggleApiKeyVisibility(); }}
                    disabled={isLoading || isRevealingApiKey || isRegeneratingApiKey}
                    className={`${btnOutline} !px-2 !py-1 text-xs`}
                  >
                    {isRevealingApiKey ? 'Loading...' : visibleApiKey ? 'Hide' : 'Show'}
                  </button>
                  <button
                    data-testid="btn-copy-key"
                    onClick={() => { void handleCopyApiKey(); }}
                    disabled={copyKeyDisabled}
                    className={`${btnOutline} !px-2 !py-1 text-xs ${copyKeyDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    Copy
                  </button>
                </div>
                <div data-testid="api-rate-limit-info" className="mt-2 text-xs text-[#6e7681]">
                  Rate limit: 100 requests per minute. Reveal the key only when needed and re-hide it when finished.
                </div>
              </div>
              <div className="flex gap-2">
                {!confirmRegen ? (
                  <button
                    data-testid="btn-regenerate-key"
                    onClick={() => setConfirmRegen(true)}
                    disabled={isLoading || isRegeneratingApiKey}
                    className={`${btnDanger} ${isLoading || isRegeneratingApiKey ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    Regenerate Key
                  </button>
                ) : (
                  <>
                    <button
                      data-testid="btn-regenerate-confirm"
                      onClick={() => { void handleRegenerateApiKey(); }}
                      disabled={isRegeneratingApiKey}
                      className={`${btnDanger} !bg-[#f85149] !text-white ${isRegeneratingApiKey ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      {isRegeneratingApiKey ? 'Regenerating...' : 'Confirm Regenerate'}
                    </button>
                    <button
                      data-testid="btn-regenerate-cancel"
                      onClick={() => setConfirmRegen(false)}
                      disabled={isRegeneratingApiKey}
                      className={btnOutline}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              <div className="text-xs text-[#6e7681] mt-2">
                ⚠ Regenerating will invalidate the current key immediately. All integrations using this key will need to be updated.
              </div>
            </div>

            <div className={cardClass}>
              <div className={cardTitleClass}>API Documentation</div>
              <div className="text-sm text-[#8b949e]">
                <p>Base URL: <code className="text-[#58a6ff]">http://localhost:8080/api/v1</code></p>
                <p className="mt-2">Include your API key in the <code className="text-[#58a6ff]">X-API-Key</code> header with every request.</p>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
