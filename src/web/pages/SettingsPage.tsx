import { useState } from 'react';
import { TabBar } from '../components/TabBar';

const settingsTabs = [
  { id: 'general', label: 'General', testId: 'tab-general' },
  { id: 'network', label: 'Network', testId: 'tab-network' },
  { id: 'alerts', label: 'Alerts', testId: 'tab-alerts' },
  { id: 'api', label: 'API', testId: 'tab-api' },
];

const cronDescriptions: Record<string, string> = {
  '*/5 * * * *': 'Runs every 5 minutes',
  '*/15 * * * *': 'Runs every 15 minutes',
  '*/30 * * * *': 'Runs every 30 minutes',
  '0 * * * *': 'Runs every hour',
  '0 */4 * * *': 'Runs every 4 hours',
  '0 0 * * *': 'Runs once per day at midnight',
};

function describeCron(expr: string): string {
  return cronDescriptions[expr.trim()] ?? 'Custom schedule';
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
  const [activeTab, setActiveTab] = useState('general');

  // General tab state
  const [cronExpr, setCronExpr] = useState('*/30 * * * *');
  const [intensity, setIntensity] = useState('normal');
  const [retentionDays, setRetentionDays] = useState(90);

  // Network tab state
  const [subnets] = useState([
    { cidr: '192.168.1.0/24', iface: 'eth0 — primary', enabled: true },
    { cidr: '192.168.2.0/24', iface: 'wlan0 — wireless', enabled: true },
    { cidr: '172.17.0.0/16', iface: 'docker0 — containers', enabled: false },
  ]);
  const [manualSubnet, setManualSubnet] = useState('');

  // Alerts tab state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [smtpServer, setSmtpServer] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpRecipient, setSmtpRecipient] = useState('');
  const [alertCooldown, setAlertCooldown] = useState(300);

  // API tab state
  const [showKey, setShowKey] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const apiKey = 'nobs_a1b2c3d4e5f6g7h8i9j0klmn';

  return (
    <div data-testid="page-settings" className="max-w-[900px]">
      <h1 className="text-xl font-bold text-[#e6edf3] mb-5">Settings</h1>

      <TabBar
        tabs={settingsTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        testId="settings-tabs"
      />

      {/* ===== General Tab ===== */}
      {activeTab === 'general' && (
        <div data-testid="panel-general">
          {/* Scan Schedule */}
          <div className={cardClass}>
            <div className={cardTitleClass}>Scan Schedule</div>
            <div className="mb-0">
              <label htmlFor="cron-input" className={labelClass}>Scan Cadence (cron expression)</label>
              <input
                type="text"
                id="cron-input"
                data-testid="input-cron"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                className={inputClass}
              />
              <div data-testid="cron-preview" className="text-xs text-[#6e7681] mt-1">
                {describeCron(cronExpr)}
              </div>
            </div>
          </div>

          {/* Scan Intensity */}
          <div className={cardClass}>
            <div className={cardTitleClass}>Scan Intensity</div>
            <div data-testid="scan-intensity" className="flex gap-5 mt-1">
              {(['quick', 'normal', 'thorough'] as const).map((val) => (
                <label key={val} className="flex items-center gap-1.5 text-sm text-[#e6edf3] cursor-pointer">
                  <input
                    type="radio"
                    name="intensity"
                    value={val}
                    data-testid={`radio-${val}`}
                    checked={intensity === val}
                    onChange={() => setIntensity(val)}
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

          {/* Data Retention */}
          <div className={cardClass}>
            <div className={cardTitleClass}>Data Retention</div>
            <label htmlFor="retention-days" className={labelClass}>Keep historical data for</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                id="retention-days"
                data-testid="input-retention-days"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                min={1}
                max={365}
                className={`${inputClass} w-24`}
              />
              <span className="text-sm text-[#e6edf3]">days</span>
            </div>
            <div className="text-xs text-[#6e7681] mt-1">
              Older scan results and presence data will be automatically purged.
            </div>
          </div>

          <div className="flex justify-end">
            <button data-testid="btn-save-general" className={btnPrimary}>Save Changes</button>
          </div>
        </div>
      )}

      {/* ===== Network Tab ===== */}
      {activeTab === 'network' && (
        <div data-testid="panel-network">
          {/* Detected Subnets */}
          <div className={cardClass}>
            <div className={cardTitleClass}>Detected Subnets</div>
            <ul data-testid="subnet-list" className="mb-3">
              {subnets.map((s, i) => (
                <li key={s.cidr} className="flex items-center gap-2 py-1.5 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid={`subnet-check-${i + 1}`}
                      defaultChecked={s.enabled}
                      className="accent-[#1f6feb] w-4 h-4"
                    />
                    {s.cidr}
                  </label>
                  <span className="text-xs text-[#6e7681]">({s.iface})</span>
                </li>
              ))}
            </ul>
            <div className="text-xs text-[#6e7681]">Uncheck subnets you don't want to scan.</div>
          </div>

          {/* Add Subnet */}
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
                  onChange={(e) => setManualSubnet(e.target.value)}
                  placeholder="10.0.0.0/24"
                  className={inputClass}
                />
              </div>
              <button data-testid="btn-add-subnet" className={btnPrimary}>Add</button>
            </div>
          </div>

          <div className="flex justify-end">
            <button data-testid="btn-save-network" className={btnPrimary}>Save Changes</button>
          </div>
        </div>
      )}

      {/* ===== Alerts Tab ===== */}
      {activeTab === 'alerts' && (
        <div data-testid="panel-alerts">
          {/* Webhook */}
          <div className={cardClass}>
            <div className={cardTitleClass}>Webhook</div>
            <div className="mb-3">
              <label htmlFor="webhook-url" className={labelClass}>Webhook URL</label>
              <input
                type="text"
                id="webhook-url"
                data-testid="input-webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.example.com/netobserver"
                className={inputClass}
              />
            </div>
            <button data-testid="btn-test-webhook" className={btnSuccess}>Test Webhook</button>
          </div>

          {/* Email SMTP */}
          <div className={cardClass}>
            <div className={cardTitleClass}>Email (SMTP)</div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label htmlFor="smtp-server" className={labelClass}>SMTP Server</label>
                <input type="text" id="smtp-server" data-testid="input-smtp-server" value={smtpServer} onChange={(e) => setSmtpServer(e.target.value)} placeholder="smtp.gmail.com" className={inputClass} />
              </div>
              <div className="w-24">
                <label htmlFor="smtp-port" className={labelClass}>Port</label>
                <input type="number" id="smtp-port" data-testid="input-smtp-port" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label htmlFor="smtp-user" className={labelClass}>Username</label>
                <input type="text" id="smtp-user" data-testid="input-smtp-user" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="alerts@example.com" className={inputClass} />
              </div>
              <div className="flex-1">
                <label htmlFor="smtp-password" className={labelClass}>Password</label>
                <input type="password" id="smtp-password" data-testid="input-smtp-password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="smtp-recipient" className={labelClass}>Recipient Email</label>
              <input type="email" id="smtp-recipient" data-testid="input-smtp-recipient" value={smtpRecipient} onChange={(e) => setSmtpRecipient(e.target.value)} placeholder="admin@example.com" className={inputClass} />
            </div>
            <button data-testid="btn-test-email" className={btnSuccess}>Test Email</button>
          </div>

          {/* Alert Cooldown */}
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
            <button data-testid="btn-save-alerts" className={btnPrimary}>Save Changes</button>
          </div>
        </div>
      )}

      {/* ===== API Tab ===== */}
      {activeTab === 'api' && (
        <div data-testid="panel-api">
          {/* API Key */}
          <div className={cardClass}>
            <div className={cardTitleClass}>API Key</div>
            <div className="mb-3">
              <label className={labelClass}>Current API Key</label>
              <div data-testid="api-key-display" className="flex items-center gap-2 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 font-mono text-sm text-[#8b949e]">
                <span data-testid="api-key-value" className="flex-1">
                  {showKey ? apiKey : `nobs_${'•'.repeat(24)}`}
                </span>
                <button
                  data-testid="btn-show-key"
                  onClick={() => setShowKey((s) => !s)}
                  className={`${btnOutline} !px-2 !py-1 text-xs`}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
                <button
                  data-testid="btn-copy-key"
                  onClick={() => navigator.clipboard.writeText(apiKey)}
                  className={`${btnOutline} !px-2 !py-1 text-xs`}
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {!confirmRegen ? (
                <button data-testid="btn-regenerate-key" onClick={() => setConfirmRegen(true)} className={btnDanger}>
                  Regenerate Key
                </button>
              ) : (
                <>
                  <button
                    data-testid="btn-regenerate-confirm"
                    onClick={() => setConfirmRegen(false)}
                    className={`${btnDanger} !bg-[#f85149] !text-white`}
                  >
                    Confirm Regenerate
                  </button>
                  <button
                    data-testid="btn-regenerate-cancel"
                    onClick={() => setConfirmRegen(false)}
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

          {/* API Docs */}
          <div className={cardClass}>
            <div className={cardTitleClass}>API Documentation</div>
            <div className="text-sm text-[#8b949e]">
              <p>Base URL: <code className="text-[#58a6ff]">http://localhost:8080/api/v1</code></p>
              <p className="mt-2">Include your API key in the <code className="text-[#58a6ff]">X-API-Key</code> header with every request.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
