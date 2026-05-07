import { useEffect, useState } from 'react';
import { postLinkSignal } from './linkChannel';

type Status = 'working' | 'done' | 'error';

export function OAuthCallbackPage(): JSX.Element {
  const [status, setStatus] = useState<Status>('working');
  const [message, setMessage] = useState<string>('Completing sign-in…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') ?? undefined;
    const state = params.get('state');
    const error = params.get('error') ?? params.get('error_description') ?? undefined;

    if (!state) {
      setStatus('error');
      setMessage('Missing state parameter. This page is only meant to be reached via OAuth redirect.');
      return;
    }

    const inPopup = window.opener && window.opener !== window;

    if (inPopup) {
      try {
        window.opener.postMessage(
          { type: 'oauth-callback', code, state, error },
          window.location.origin,
        );
      } catch {
        // Cross-origin opener — fall through to link signal as a backup.
      }
      setStatus('done');
      setMessage('Sign-in complete. You can close this window.');
      window.setTimeout(() => window.close(), 200);
      return;
    }

    postLinkSignal({ state, code, error });
    setStatus('done');
    setMessage('Sign-in complete. You can close this tab and return to the app.');
    window.setTimeout(() => window.close(), 400);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">
          {status === 'error' ? 'Sign-in failed' : 'Signing in…'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}
