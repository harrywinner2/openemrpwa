import { loadServerConfig } from '../config/serverConfig';
import { getToken, refresh } from '../auth/tokenStore';
import type {
  AllergyIntolerance,
  Bundle,
  CareTeam,
  Condition,
  Encounter,
  MedicationRequest,
  Patient,
} from './types';

class FhirError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function fhirBase(): string {
  const cfg = loadServerConfig();
  if (!cfg) throw new FhirError(0, 'No OpenEMR server configured');
  return cfg.fhirBaseUrl;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let token = getToken();
  if (!token) throw new FhirError(401, 'Not authenticated');
  if (token.expires_at <= Date.now()) {
    token = await refresh();
    if (!token) throw new FhirError(401, 'Session expired and refresh failed');
  }
  const url = `${fhirBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/fhir+json',
      ...init.headers,
      Authorization: `Bearer ${token.access_token}`,
    },
  });
  if (res.status === 401) {
    const refreshed = await refresh();
    if (!refreshed) throw new FhirError(401, 'Session expired');
    const retry = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/fhir+json',
        ...init.headers,
        Authorization: `Bearer ${refreshed.access_token}`,
      },
    });
    if (!retry.ok) {
      throw new FhirError(retry.status, await retry.text());
    }
    return retry;
  }
  if (!res.ok) {
    throw new FhirError(res.status, await res.text());
  }
  return res;
}

async function getResource<T>(path: string): Promise<T> {
  const res = await authedFetch(path);
  return (await res.json()) as T;
}

async function searchBundle<T>(path: string): Promise<T[]> {
  const bundle = await getResource<Bundle<T>>(path);
  return (bundle.entry ?? []).map((e) => e.resource);
}

// Roughly: 8-4-4-4-12 hex (RFC 4122). Used to decide whether a hand-typed
// patient id needs to be resolved as an MRN/identifier first.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const fhir = {
  /**
   * Fetch one patient by id. If `id` looks like a UUID we hit /Patient/{id}
   * directly; otherwise (e.g. a hand-typed MRN/pid) we fall back to
   * /Patient?identifier={id} and return the first match. Lets the URL bar
   * accept either form.
   */
  patient: async (id: string): Promise<Patient> => {
    if (UUID_RE.test(id)) {
      return getResource<Patient>(`/Patient/${id}`);
    }
    const matches = await searchBundle<Patient>(
      `/Patient?identifier=${encodeURIComponent(id)}`,
    );
    if (matches.length === 0) {
      throw new FhirError(
        404,
        `No patient found with id or identifier "${id}". Use the search picker or paste a UUID.`,
      );
    }
    return matches[0];
  },

  searchPatients: (query: string, count = 50) => {
    const params = new URLSearchParams({ _count: String(count) });
    if (query.trim()) params.set('name', query.trim());
    return searchBundle<Patient>(`/Patient?${params.toString()}`);
  },

  allergies: (patientId: string) =>
    searchBundle<AllergyIntolerance>(`/AllergyIntolerance?patient=${patientId}`),

  problems: (patientId: string) =>
    searchBundle<Condition>(
      `/Condition?patient=${patientId}&category=problem-list-item&clinical-status=active`,
    ),

  // Active meds — uses MedicationRequest because OpenEMR's FHIR doesn't expose
  // MedicationStatement. status=active gets the current med list; we don't
  // filter by intent so both order-based prescriptions and plan-style
  // medication entries surface.
  medications: (patientId: string) =>
    searchBundle<MedicationRequest>(
      `/MedicationRequest?patient=${patientId}&status=active`,
    ),

  prescriptions: (patientId: string) =>
    searchBundle<MedicationRequest>(
      `/MedicationRequest?patient=${patientId}&intent=order&status=active`,
    ),

  careTeam: (patientId: string) =>
    searchBundle<CareTeam>(`/CareTeam?patient=${patientId}&status=active`),

  encounters: (patientId: string, count = 20) =>
    searchBundle<Encounter>(`/Encounter?patient=${patientId}&_sort=-date&_count=${count}`),
};

export { FhirError };
