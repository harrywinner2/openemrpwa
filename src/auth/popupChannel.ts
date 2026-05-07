import { buildAuthUrl, consumePending } from './authUrl';
import { exchangeCode } from './tokenStore';
import type { AuthMode } from './scopes';

export type PopupResult = { ok: true } | { ok: false; reason: string };

const POPUP_FEATURES = 'width=520,height=640,resizable=yes,scrollbars=yes';

export async function signInPopup(mode: AuthMode, patientId?: string): Promise<PopupResult> {
  const { url, pending } = await buildAuthUrl(mode, 'popup');

  const popup = window.open(url, 'oemr_oauth_popup', POPUP_FEATURES);
  if (!popup) {
    return { ok: false, reason: 'Popup was blocked. Allow popups or switch to the link channel.' };
  }

  return new Promise<PopupResult>((resolve) => {
    let settled = false;
    let pollTimer: number | null = null;

    const cleanup = (): void => {
      window.removeEventListener('message', onMessage);
      if (pollTimer !== null) clearInterval(pollTimer);
    };

    const onMessage = (ev: MessageEvent): void => {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; code?: string; state?: string; error?: string };
      if (data?.type !== 'oauth-callback') return;
      if (settled) return;
      settled = true;
      cleanup();

      if (data.error) {
        resolve({ ok: false, reason: data.error });
        return;
      }
      if (!data.code || !data.state || data.state !== pending.state) {
        resolve({ ok: false, reason: 'Invalid auth response (state mismatch).' });
        return;
      }
      const stillPending = consumePending(data.state);
      if (!stillPending) {
        resolve({ ok: false, reason: 'Pending auth context expired.' });
        return;
      }
      exchangeCode(data.code, stillPending.verifier, stillPending.mode, patientId)
        .then(() => resolve({ ok: true }))
        .catch((e: unknown) =>
          resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) }),
        );
    };

    window.addEventListener('message', onMessage);

    // Detect popup closed without completing auth.
    pollTimer = window.setInterval(() => {
      if (popup.closed && !settled) {
        settled = true;
        cleanup();
        resolve({ ok: false, reason: 'Sign-in window was closed before completion.' });
      }
    }, 500);
  });
}
