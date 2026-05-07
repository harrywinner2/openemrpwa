import { buildAuthUrl, consumePending } from './authUrl';
import { exchangeCode } from './tokenStore';
import type { AuthMode } from './scopes';

export type LinkPrompt = {
  url: string;
  state: string;
  cancel: () => void;
};

const SIGNAL_KEY = 'oauth.signal';

export async function startLinkSignIn(
  mode: AuthMode,
  onComplete: (result: { ok: true } | { ok: false; reason: string }) => void,
  patientId?: string,
): Promise<LinkPrompt> {
  const { url, pending } = await buildAuthUrl(mode, 'link');

  let cancelled = false;
  const onStorage = (ev: StorageEvent): void => {
    if (ev.key !== SIGNAL_KEY || !ev.newValue) return;
    let signal: { state?: string; code?: string; error?: string };
    try {
      signal = JSON.parse(ev.newValue) as typeof signal;
    } catch {
      return;
    }
    if (signal.state !== pending.state) return;
    localStorage.removeItem(SIGNAL_KEY);
    window.removeEventListener('storage', onStorage);
    if (cancelled) return;

    if (signal.error || !signal.code) {
      onComplete({ ok: false, reason: signal.error ?? 'No authorization code received.' });
      return;
    }
    const stillPending = consumePending(pending.state);
    if (!stillPending) {
      onComplete({ ok: false, reason: 'Pending auth context expired.' });
      return;
    }
    exchangeCode(signal.code, stillPending.verifier, stillPending.mode, patientId)
      .then(() => onComplete({ ok: true }))
      .catch((e: unknown) =>
        onComplete({ ok: false, reason: e instanceof Error ? e.message : String(e) }),
      );
  };

  window.addEventListener('storage', onStorage);

  return {
    url,
    state: pending.state,
    cancel: () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    },
  };
}

/**
 * Called by the /oauth-callback page when it has no opener (link channel).
 * Writes the auth code into localStorage so the originating tab's `storage`
 * event listener picks it up. Tokens themselves are NOT in localStorage —
 * just the single-use auth code, which is itself bound by PKCE to the
 * originator's verifier and worthless to anyone else.
 */
export function postLinkSignal(payload: { state: string; code?: string; error?: string }): void {
  localStorage.setItem(SIGNAL_KEY, JSON.stringify(payload));
}
