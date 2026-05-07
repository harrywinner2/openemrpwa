export type AuthMode = 'clinician' | 'single-patient';

const COMMON = ['openid', 'offline_access'];

const RESOURCE_READ = [
  'Patient',
  'AllergyIntolerance',
  'Condition',
  'MedicationRequest',
  'MedicationStatement',
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
        'If your OpenEMR account is an admin, the app will inherit admin-level read access. SMART-on-FHIR has no "lesser" user scope — the token sees what you see. Only use clinician mode on a trusted device.',
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
