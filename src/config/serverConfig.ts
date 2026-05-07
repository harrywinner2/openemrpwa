export type ServerConfig = {
  /** Display label, derived from the host portion of fhirBaseUrl. */
  label: string;
  /** e.g. https://localhost:9300/apis/default/fhir */
  fhirBaseUrl: string;
  /** From .well-known/smart-configuration */
  authorizeUrl: string;
  /** From .well-known/smart-configuration */
  tokenUrl: string;
  /** From .well-known/smart-configuration; null if dynamic registration unsupported */
  registrationUrl: string | null;
  /** Public PKCE client id; auto-registered or pasted */
  clientId: string;
  /** Epoch ms; for cache-busting on stale client_ids */
  registeredAt: number;
};

const STORAGE_KEY = 'oauth.serverConfig';

export function loadServerConfig(): ServerConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServerConfig;
  } catch {
    return null;
  }
}

export function saveServerConfig(cfg: ServerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearServerConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function deriveLabel(fhirBaseUrl: string): string {
  try {
    return new URL(fhirBaseUrl).host;
  } catch {
    return fhirBaseUrl;
  }
}

export function redirectUri(): string {
  return window.location.origin + '/oauth-callback';
}
