import { redirectUri, type ServerConfig } from './serverConfig';
import { scopesFor } from '../auth/scopes';

export type RegistrationResult =
  | { ok: true; clientId: string; needsAdminEnable: boolean }
  | { ok: false; reason: string };

/**
 * Auto-registers a public PKCE client at the discovered registration_endpoint.
 * After this returns ok, the new client still needs to be flipped to "Enabled"
 * in the OpenEMR admin UI before the OAuth flow will accept it.
 */
export async function registerPublicClient(
  partial: Omit<ServerConfig, 'clientId' | 'registeredAt'>,
  appName = 'OpenEMR Patient Dashboard SPA',
): Promise<RegistrationResult> {
  if (!partial.registrationUrl) {
    return {
      ok: false,
      reason:
        'Server does not advertise a registration_endpoint. Paste a pre-registered client_id instead.',
    };
  }

  const payload = {
    application_type: 'public',
    redirect_uris: [redirectUri()],
    post_logout_redirect_uris: [window.location.origin + '/'],
    client_name: appName,
    token_endpoint_auth_method: 'none',
    contacts: ['portal-admin@example.com'],
    scope: scopesFor('clinician'),
  };

  let res: Response;
  try {
    res = await fetch(partial.registrationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e: unknown) {
    return {
      ok: false,
      reason: `Network error during registration: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!res.ok) {
    return { ok: false, reason: `Registration failed: HTTP ${res.status} — ${await res.text()}` };
  }

  const body = (await res.json()) as { client_id?: string };
  if (!body.client_id) {
    return { ok: false, reason: 'Registration response did not include client_id.' };
  }

  return { ok: true, clientId: body.client_id, needsAdminEnable: true };
}
