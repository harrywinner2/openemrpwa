import { describe, expect, it } from 'vitest';
import { describeAccess, scopesFor } from './scopes';

describe('scopesFor', () => {
  it('always includes openid + offline_access', () => {
    expect(scopesFor('clinician')).toContain('openid');
    expect(scopesFor('clinician')).toContain('offline_access');
    expect(scopesFor('single-patient')).toContain('openid');
    expect(scopesFor('single-patient')).toContain('offline_access');
  });

  it('clinician mode requests user/* scopes for cross-patient navigation', () => {
    const s = scopesFor('clinician');
    expect(s).toContain('user/Patient.rs');
    expect(s).toContain('user/AllergyIntolerance.rs');
    expect(s).toContain('user/Encounter.rs');
    expect(s).not.toMatch(/\bpatient\//);
  });

  it('single-patient mode requests patient/* scopes (auth server binds the patient)', () => {
    const s = scopesFor('single-patient');
    expect(s).toContain('patient/Patient.rs');
    expect(s).toContain('patient/AllergyIntolerance.rs');
    expect(s).toContain('patient/Encounter.rs');
    expect(s).not.toMatch(/\buser\//);
  });
});

describe('describeAccess', () => {
  it('warns about admin-inheritance only for clinician mode', () => {
    expect(describeAccess('clinician').warning).toMatch(/admin/i);
    expect(describeAccess('single-patient').warning).toBeUndefined();
  });

  it('headlines reflect SMART scope prefix', () => {
    expect(describeAccess('clinician').headline).toContain('user/*');
    expect(describeAccess('single-patient').headline).toContain('patient/*');
  });
});
