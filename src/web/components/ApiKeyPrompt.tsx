import { useState } from 'react';

interface ApiKeyPromptProps {
  onSubmit: (apiKey: string) => void;
  onDismiss?: () => void;
  mode?: 'modal' | 'banner';
}

export function ApiKeyPrompt({ onSubmit, onDismiss, mode = 'banner' }: ApiKeyPromptProps) {
  const [key, setKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      onSubmit(key.trim());
    }
  };

  if (mode === 'modal') {
    return (
      <div data-testid="api-key-prompt-overlay" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div data-testid="api-key-prompt" className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-lg p-6 w-full max-w-md">
          <h3 className="text-lg font-semibold text-[#e6edf3] mb-2">API Key Required</h3>
          <p className="text-sm text-[#8b949e] mb-4">
            Enter your NetObserver API key to connect to the server.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              data-testid="api-key-prompt-input"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="nobs_..."
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e6edf3] font-mono placeholder:text-[#6e7681] focus:outline-none focus:border-[#1f6feb] mb-4"
            />
            <div className="flex justify-end gap-2">
              {onDismiss && (
                <button
                  type="button"
                  data-testid="api-key-prompt-cancel"
                  onClick={onDismiss}
                  className="px-4 py-2 text-sm font-medium text-[#e6edf3] border border-[#30363d] rounded-md hover:bg-[#30363d] transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                data-testid="api-key-prompt-submit"
                className="px-4 py-2 text-sm font-medium text-white bg-[#1f6feb] rounded-md hover:bg-[#388bfd] transition-colors"
              >
                Connect
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="api-key-prompt" className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 mb-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <span className="text-sm text-[#8b949e]">API Key:</span>
        <input
          data-testid="api-key-prompt-input"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="nobs_..."
          className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e6edf3] font-mono placeholder:text-[#6e7681] focus:outline-none focus:border-[#1f6feb]"
        />
        <button
          type="submit"
          data-testid="api-key-prompt-submit"
          className="px-3 py-1.5 text-sm font-medium text-white bg-[#1f6feb] rounded-md hover:bg-[#388bfd] transition-colors"
        >
          Connect
        </button>
        {onDismiss && (
          <button
            type="button"
            data-testid="api-key-prompt-cancel"
            onClick={onDismiss}
            className="px-3 py-1.5 text-sm font-medium text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            ✕
          </button>
        )}
      </form>
    </div>
  );
}
