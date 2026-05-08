import { redirectUri, type ServerConfig } from './serverConfig';
import { scopesFor } from '../auth/scopes';

export type RegistrationResult =
  | { ok: true; clientId: string; needsAdminEnable: boolean }
  | { ok: false; reason: string };

/**
 * Auto-registers a public PKCE client.
 *
 * Tries the discovery-advertised `registration_endpoint` first, then falls back
 * to the OpenEMR convention (`<oauth-base>/registration`, derived from the
 * authorize endpoint). Some OpenEMR versions don't list the registration
 * endpoint in `.well-known/smart-configuration` even though the endpoint is
 * present and reachable.
 */
export async function registerPublicClient(
  partial: Omit<ServerConfig, 'clientId' | 'registeredAt'>,
  appName = 'OpenEMR Patient Dashboard SPA',
): Promise<RegistrationResult> {
  const candidates = registrationCandidates(partial);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'Could not determine a registration endpoint from the server config.',
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

  const failures: string[] = [];

  for (const url of candidates) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e: unknown) {
      failures.push(`${url} — network error: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (res.status === 404 || res.status === 405) {
      // Try the next candidate.
      failures.push(`${url} — HTTP ${res.status}`);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        reason:
          `Registration endpoint at ${url} returned HTTP ${res.status}.\n\n` +
          `Body: ${truncate(body, 400)}\n\n` +
          (res.status === 401 || res.status === 403
            ? 'The endpoint exists but is gated. Some OpenEMR installs require ' +
              'the registration endpoint to be opened or require admin pre-creation. ' +
              'Either: (a) pre-register from your shell with scripts/register-client.sh, ' +
              '(b) ask an admin to enable open dynamic client registration, or ' +
              '(c) paste an existing client_id below.'
            : 'Unexpected response — check OpenEMR logs.'),
      };
    }

    const body = (await res.json()) as { client_id?: string };
    if (!body.client_id) {
      return { ok: false, reason: 'Registration response did not include client_id.' };
    }
    return { ok: true, clientId: body.client_id, needsAdminEnable: true };
  }

  return {
    ok: false,
    reason:
      'No working registration endpoint found. Tried:\n  ' +
      failures.join('\n  ') +
      '\n\nUse "Use existing client_id" instead — register from a shell with ' +
      'scripts/register-client.sh, or have an admin pre-create the client.',
  };
}

function registrationCandidates(
  partial: Omit<ServerConfig, 'clientId' | 'registeredAt'>,
): string[] {
  const out = new Set<string>();
  if (partial.registrationUrl) out.add(partial.registrationUrl);
  // OpenEMR convention: replace `/authorize` with `/registration` on the
  // authorization endpoint. Works for the default-site path
  // /oauth2/default/authorize → /oauth2/default/registration.
  const conventional = partial.authorizeUrl.replace(/\/authorize(?:\b|\/?$)/, '/registration');
  if (conventional !== partial.authorizeUrl) out.add(conventional);
  return Array.from(out);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…';
}
