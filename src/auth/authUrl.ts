import { loadServerConfig, redirectUri } from '../config/serverConfig';
import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce';
import { scopesFor, type AuthMode } from './scopes';

export type AuthChannel = 'popup' | 'link';

export type PendingAuth = {
  state: string;
  verifier: string;
  mode: AuthMode;
  channel: AuthChannel;
  createdAt: number;
};

const PENDING_PREFIX = 'oauth.pending.';

export class NoServerConfigError extends Error {
  constructor() {
    super('No OpenEMR server configured. Pick a server first.');
  }
}

export async function buildAuthUrl(
  mode: AuthMode,
  channel: AuthChannel,
): Promise<{ url: string; pending: PendingAuth }> {
  const cfg = loadServerConfig();
  if (!cfg) throw new NoServerConfigError();

  const verifier = generateCodeVerifier();
  const state = generateState();
  const challenge = await deriveCodeChallenge(verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: scopesFor(mode),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  const pending: PendingAuth = { state, verifier, mode, channel, createdAt: Date.now() };
  sessionStorage.setItem(PENDING_PREFIX + state, JSON.stringify(pending));

  return {
    url: `${cfg.authorizeUrl}?${params.toString()}`,
    pending,
  };
}

export function consumePending(state: string): PendingAuth | null {
  const key = PENDING_PREFIX + state;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  sessionStorage.removeItem(key);
  try {
    return JSON.parse(raw) as PendingAuth;
  } catch {
    return null;
  }
}
