import { useState } from 'react';
import { discoverFromInput, DiscoveryError } from '../config/discover';
import { registerPublicClient } from '../config/registerClient';
import { saveServerConfig, type ServerConfig } from '../config/serverConfig';
import { env } from '../env';

type Mode = 'auto' | 'manual';

export function ServerPickerScreen({ onConfigured }: { onConfigured: () => void }): JSX.Element {
  const [serverUrl, setServerUrl] = useState<string>(env.defaultServerUrl());
  const [manualClientId, setManualClientId] = useState<string>('');
  const [mode, setMode] = useState<Mode>('auto');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleConnect(): Promise<void> {
    setBusy(true);
    setError(null);
    setSuccess(null);

    let partial: Omit<ServerConfig, 'clientId' | 'registeredAt'>;
    try {
      partial = await discoverFromInput(serverUrl);
    } catch (e: unknown) {
      const msg =
        e instanceof DiscoveryError
          ? `Couldn't discover a SMART endpoint at ${e.attemptedUrl}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setBusy(false);
      return;
    }

    if (mode === 'manual') {
      if (!manualClientId.trim()) {
        setError('Enter a client_id, or switch to "Auto-register".');
        setBusy(false);
        return;
      }
      saveServerConfig({
        ...partial,
        clientId: manualClientId.trim(),
        registeredAt: Date.now(),
      });
      onConfigured();
      return;
    }

    const result = await registerPublicClient(partial);
    if (!result.ok) {
      setError(
        `${result.reason}\n\nTry "Use existing client_id" instead — paste a client_id that an admin has already registered.`,
      );
      setBusy(false);
      return;
    }

    saveServerConfig({
      ...partial,
      clientId: result.clientId,
      registeredAt: Date.now(),
    });
    setSuccess(
      `Registered new client_id ${result.clientId}. ${
        result.needsAdminEnable
          ? 'Ask the OpenEMR admin to enable this client (Admin → System → API Clients) before signing in.'
          : ''
      }`,
    );
    setBusy(false);
    // small UX delay so the success message is visible
    window.setTimeout(onConfigured, 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Connect to an OpenEMR server</h1>
        <p className="mt-1 text-sm text-slate-600">
          This dashboard works against any OpenEMR instance that has registered this app's
          origin (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{window.location.origin}</code>)
          as a redirect URI.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          OpenEMR URL
          <input
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://emr.example.com"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Either the root URL or the FHIR base. We'll probe both.
          </span>
        </label>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-slate-700">Client</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ToggleButton selected={mode === 'auto'} onClick={() => setMode('auto')}>
              Auto-register
              <span className="block text-xs font-normal text-slate-500">
                Self-service, needs admin to enable
              </span>
            </ToggleButton>
            <ToggleButton selected={mode === 'manual'} onClick={() => setMode('manual')}>
              Use existing client_id
              <span className="block text-xs font-normal text-slate-500">
                If admin already registered one
              </span>
            </ToggleButton>
          </div>
        </fieldset>

        {mode === 'manual' && (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            client_id
            <input
              type="text"
              value={manualClientId}
              onChange={(e) => setManualClientId(e.target.value)}
              placeholder="abc123-…"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
        )}

        {error && (
          <pre className="mt-4 whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </pre>
        )}
        {success && (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {success}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleConnect()}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

function ToggleButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left text-sm font-medium transition ${
        selected
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}
