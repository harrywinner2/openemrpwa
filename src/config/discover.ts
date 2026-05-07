import { deriveLabel, type ServerConfig } from './serverConfig';

type SmartConfig = {
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
};

export class DiscoveryError extends Error {
  constructor(public readonly attemptedUrl: string, message: string) {
    super(message);
  }
}

/**
 * Given a user-entered URL (root or FHIR base), figure out the FHIR base and
 * fetch its SMART well-known configuration. Returns a partial ServerConfig
 * (clientId + registeredAt are filled in by the registration step).
 */
export async function discoverFromInput(
  input: string,
): Promise<Omit<ServerConfig, 'clientId' | 'registeredAt'>> {
  const candidates = candidateFhirBases(input);
  let lastError: DiscoveryError | null = null;

  for (const fhirBaseUrl of candidates) {
    const wellKnown = `${fhirBaseUrl.replace(/\/+$/, '')}/.well-known/smart-configuration`;
    try {
      const res = await fetch(wellKnown, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        lastError = new DiscoveryError(wellKnown, `HTTP ${res.status}`);
        continue;
      }
      const cfg = (await res.json()) as SmartConfig;
      if (!cfg.authorization_endpoint || !cfg.token_endpoint) {
        lastError = new DiscoveryError(
          wellKnown,
          'Discovery doc missing authorization_endpoint or token_endpoint',
        );
        continue;
      }
      return {
        label: deriveLabel(fhirBaseUrl),
        fhirBaseUrl,
        authorizeUrl: cfg.authorization_endpoint,
        tokenUrl: cfg.token_endpoint,
        registrationUrl: cfg.registration_endpoint ?? null,
      };
    } catch (e: unknown) {
      lastError = new DiscoveryError(
        wellKnown,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  throw lastError ?? new DiscoveryError(input, 'No FHIR endpoint discovered');
}

function candidateFhirBases(input: string): string[] {
  const cleaned = input.trim().replace(/\/+$/, '');
  if (!cleaned) return [];

  // If the user already pointed at a FHIR-shaped path, use it as-is.
  if (/\/fhir(\b|$)/i.test(cleaned)) return [cleaned];

  // Otherwise probe in order of likelihood.
  return [`${cleaned}/apis/default/fhir`, cleaned];
}
