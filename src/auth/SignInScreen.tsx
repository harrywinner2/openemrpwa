import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { signInPopup } from './popupChannel';
import { startLinkSignIn, type LinkPrompt } from './linkChannel';
import { describeAccess, type AuthMode } from './scopes';
import { clearServerConfig, loadServerConfig } from '../config/serverConfig';

type Channel = 'popup' | 'link';

export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }): JSX.Element {
  const [mode, setMode] = useState<AuthMode>('clinician');
  const [channel, setChannel] = useState<Channel>('popup');
  const [mrn, setMrn] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<LinkPrompt | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const server = loadServerConfig();

  function handleChangeServer(): void {
    clearServerConfig();
    window.location.reload();
  }

  useEffect(() => {
    if (!linkPrompt || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, linkPrompt.url, { width: 220, margin: 1 }).catch(
      () => undefined,
    );
  }, [linkPrompt]);

  async function handleSignIn(): Promise<void> {
    setError(null);
    if (mode === 'single-patient' && !mrn.trim()) {
      setError('Enter an MRN before signing in.');
      return;
    }
    setBusy(true);

    if (channel === 'popup') {
      const result = await signInPopup(mode, mode === 'single-patient' ? mrn.trim() : undefined);
      setBusy(false);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      onSignedIn();
      return;
    }

    const prompt = await startLinkSignIn(
      mode,
      (result) => {
        setBusy(false);
        if (!result.ok) {
          setError(result.reason);
          setLinkPrompt(null);
          return;
        }
        setLinkPrompt(null);
        onSignedIn();
      },
      mode === 'single-patient' ? mrn.trim() : undefined,
    );
    setLinkPrompt(prompt);
  }

  function handleCancelLink(): void {
    linkPrompt?.cancel();
    setLinkPrompt(null);
    setBusy(false);
  }

  async function copyLink(): Promise<void> {
    if (!linkPrompt) return;
    try {
      await navigator.clipboard.writeText(linkPrompt.url);
    } catch {
      // ignore — fallback is to show the URL inline
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">OpenEMR Patient Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sign in with your OpenEMR account to access patient charts.
        </p>
        {server && (
          <p className="mt-2 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
            <span>
              Server: <code className="font-mono">{server.label}</code>
            </span>
            <button
              type="button"
              onClick={handleChangeServer}
              className="text-blue-600 hover:underline"
            >
              Change
            </button>
          </p>
        )}

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-slate-700">Mode</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ModeButton selected={mode === 'clinician'} onClick={() => setMode('clinician')}>
              Clinician
              <span className="block text-xs font-normal text-slate-500">
                Browse all patients
              </span>
            </ModeButton>
            <ModeButton
              selected={mode === 'single-patient'}
              onClick={() => setMode('single-patient')}
            >
              Single patient
              <span className="block text-xs font-normal text-slate-500">Lock to one chart</span>
            </ModeButton>
          </div>
          <AccessPreview mode={mode} />
        </fieldset>

        {mode === 'single-patient' && (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Patient MRN <span className="font-normal text-slate-500">(optional hint)</span>
            <input
              type="text"
              value={mrn}
              onChange={(e) => setMrn(e.target.value)}
              placeholder="e.g. 12345"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="mt-1 block text-xs text-slate-500">
              The OpenEMR consent screen decides which patient your token is bound to. If it
              prompts you, pick this MRN. The auth server's choice always wins.
            </span>
          </label>
        )}

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-slate-700">Sign-in channel</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ModeButton selected={channel === 'popup'} onClick={() => setChannel('popup')}>
              Popup
              <span className="block text-xs font-normal text-slate-500">Auth window</span>
            </ModeButton>
            <ModeButton selected={channel === 'link'} onClick={() => setChannel('link')}>
              Link / QR
              <span className="block text-xs font-normal text-slate-500">Open / share URL</span>
            </ModeButton>
          </div>
        </fieldset>

        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {!linkPrompt && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSignIn()}
            className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        )}

        {linkPrompt && (
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">Open this URL to sign in:</p>
            <p className="mt-1 break-all rounded bg-white p-2 font-mono text-xs text-slate-700 ring-1 ring-slate-200">
              {linkPrompt.url}
            </p>
            <div className="mt-3 flex gap-2">
              <a
                href={linkPrompt.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
              >
                Open
              </a>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleCancelLink}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              <canvas ref={qrCanvasRef} aria-label="QR code for sign-in URL" />
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              Waiting for the URL to be opened (in this browser)…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({
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

function AccessPreview({ mode }: { mode: AuthMode }): JSX.Element {
  const access = describeAccess(mode);
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-700">{access.headline}</p>
      <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
        {access.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {access.warning && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <span className="font-semibold">Heads up:</span> {access.warning}
        </p>
      )}
    </div>
  );
}
