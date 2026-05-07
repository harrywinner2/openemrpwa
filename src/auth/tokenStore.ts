import { loadServerConfig, redirectUri } from '../config/serverConfig';
import type { AuthMode } from './scopes';

const TOKEN_KEY = 'oauth.token';
const REFRESH_LEAD_MS = 60_000;

export type StoredToken = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at: number;
  /** Scope actually granted by the auth server (may be a subset of requested). */
  scope: string;
  mode: AuthMode;
  /** Patient context — from token response `patient` claim if patient/* scopes used. */
  patient_id?: string;
  /** Display name extracted from id_token if present. */
  user_name?: string;
  /** Subject identifier from id_token (the OpenEMR user id). */
  user_sub?: string;
};

type RawTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
  /** SMART launch context — set when patient/* scopes resolve to a specific patient. */
  patient?: string;
};

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded + '==='.slice((padded.length + 3) % 4));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractIdentity(idToken: string | undefined): {
  user_name?: string;
  user_sub?: string;
} {
  if (!idToken) return {};
  const claims = decodeJwtPayload(idToken);
  if (!claims) return {};
  const out: { user_name?: string; user_sub?: string } = {};
  if (typeof claims.sub === 'string') out.user_sub = claims.sub;
  const candidate =
    (typeof claims.name === 'string' && claims.name) ||
    (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
    (typeof claims.email === 'string' && claims.email) ||
    null;
  if (candidate) out.user_name = candidate;
  return out;
}

type Listener = (token: StoredToken | null) => void;
const listeners = new Set<Listener>();
let refreshTimer: number | null = null;

function emit(token: StoredToken | null): void {
  for (const l of listeners) l(token);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToken(): StoredToken | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  const t = getToken();
  return t !== null && t.expires_at > Date.now();
}

export function setToken(token: StoredToken): void {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  scheduleRefresh(token);
  emit(token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  emit(null);
}

function requireServer(): { tokenUrl: string; clientId: string } {
  const cfg = loadServerConfig();
  if (!cfg) throw new Error('No OpenEMR server configured.');
  return { tokenUrl: cfg.tokenUrl, clientId: cfg.clientId };
}

export async function exchangeCode(
  code: string,
  verifier: string,
  mode: AuthMode,
  patientId?: string,
): Promise<StoredToken> {
  const { tokenUrl, clientId } = requireServer();
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const raw = (await res.json()) as RawTokenResponse;
  const identity = extractIdentity(raw.id_token);
  const stored: StoredToken = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    id_token: raw.id_token,
    expires_at: Date.now() + raw.expires_in * 1000,
    scope: raw.scope ?? '',
    mode,
    // Token-issued patient context wins over user-typed MRN.
    patient_id: raw.patient ?? patientId,
    ...identity,
  };
  setToken(stored);
  return stored;
}

export type AccessSummary = {
  mode: AuthMode;
  granted_scope: string;
  patient_context: string | null;
  user_name: string | null;
  user_sub: string | null;
  expires_at: number;
};

export function getAccessSummary(): AccessSummary | null {
  const t = getToken();
  if (!t) return null;
  return {
    mode: t.mode,
    granted_scope: t.scope,
    patient_context: t.patient_id ?? null,
    user_name: t.user_name ?? null,
    user_sub: t.user_sub ?? null,
    expires_at: t.expires_at,
  };
}

export async function refresh(): Promise<StoredToken | null> {
  const current = getToken();
  if (!current?.refresh_token) return null;
  let serverInfo: ReturnType<typeof requireServer>;
  try {
    serverInfo = requireServer();
  } catch {
    return null;
  }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
    client_id: serverInfo.clientId,
  });
  const res = await fetch(serverInfo.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    clearToken();
    return null;
  }
  const raw = (await res.json()) as RawTokenResponse;
  const next: StoredToken = {
    ...current,
    access_token: raw.access_token,
    refresh_token: raw.refresh_token ?? current.refresh_token,
    id_token: raw.id_token ?? current.id_token,
    expires_at: Date.now() + raw.expires_in * 1000,
    scope: raw.scope ?? current.scope,
  };
  setToken(next);
  return next;
}

function scheduleRefresh(token: StoredToken): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  if (!token.refresh_token) return;
  const delay = Math.max(token.expires_at - Date.now() - REFRESH_LEAD_MS, 5_000);
  refreshTimer = window.setTimeout(() => {
    void refresh();
  }, delay);
}

export function rehydrate(): void {
  const t = getToken();
  if (t) scheduleRefresh(t);
}
