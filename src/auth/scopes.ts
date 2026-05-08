export type AuthMode = 'clinician' | 'single-patient';

const COMMON = ['openid', 'offline_access'];

// Resources we request `.rs` (read+search) scopes for. Kept narrow because some
// servers reject the entire registration if any scope in the bundle is unknown.
// OpenEMR's FHIR exposes MedicationRequest but not MedicationStatement, so we
// only ask for MedicationRequest and surface "Medications" from it.
const RESOURCE_READ = [
  'Patient',
  'AllergyIntolerance',
  'Condition',
  'MedicationRequest',
  'CareTeam',
  'Encounter',
];

/**
 * SMART scope prefix per mode:
 *
 * - `user/*` (clinician)     → token inherits the signing-in user's permissions
 *                              in the EHR. Can list/search across patients. THIS
 *                              IS THE ONLY WAY to do cross-patient navigation in
 *                              SMART-on-FHIR. If the user is an admin in OpenEMR,
 *                              the token reads admin-level data.
 *
 * - `patient/*` (single-pt)  → token is bound to one patient (the auth server
 *                              resolves which at consent time). Cannot list
 *                              other patients, cannot escalate. Strictly
 *                              less powerful than user/*.
 *
 * `system/*` (SMART Backend Services) is a third option but requires a JWKS and
 * is for service-to-service flows — not applicable to a public PKCE SPA.
 */
export function scopesFor(mode: AuthMode): string {
  const prefix = mode === 'clinician' ? 'user' : 'patient';
  const resourceScopes = RESOURCE_READ.map((r) => `${prefix}/${r}.rs`);
  return [...COMMON, ...resourceScopes].join(' ');
}

export type AccessDescription = {
  headline: string;
  bullets: string[];
  warning?: string;
};

export function describeAccess(mode: AuthMode): AccessDescription {
  if (mode === 'clinician') {
    return {
      headline: 'Clinician access (user/*)',
      bullets: [
        'Search and list every patient your OpenEMR account can see',
        'Read each patient\'s allergies, problems, medications, prescriptions, care team',
        'View encounter history',
        'Token inherits the signing-in user\'s OpenEMR permissions',
      ],
      warning:
        'OpenEMR refuses user/* scopes on public (in-browser) clients — that combination requires a confidential client whose secret must live on a server. ' +
        'On vanilla OpenEMR, expect "invalid_scope" at sign-in. ' +
        'If sign-in works, the token still inherits admin-level read access if your account is an admin (SMART has no lesser-user scope). ' +
        'Pick single-patient mode instead unless you know your server supports user/* on public clients.',
    };
  }
  return {
    headline: 'Single-patient access (patient/*)',
    bullets: [
      "Read ONE patient's clinical data (auth server resolves which at consent time)",
      'Cannot list, search, or access any other patient',
      'Cannot perform any administrative action',
      'Strictly less powerful than clinician mode — safe on shared devices',
    ],
  };
}
