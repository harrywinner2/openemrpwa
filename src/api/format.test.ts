import { describe, expect, it } from 'vitest';
import { format } from './format';
import type {
  AllergyIntolerance,
  CareTeam,
  Condition,
  Encounter,
  MedicationRequest,
  MedicationStatement,
  Patient,
} from './types';

describe('format helpers', () => {
  it('formats name with given + family fallback', () => {
    expect(format.name([{ given: ['Jane', 'Q'], family: 'Doe' }])).toBe('Jane Q Doe');
    expect(format.name([{ text: 'Custom Display' }])).toBe('Custom Display');
    expect(format.name(undefined)).toBe('Unknown');
    expect(format.name([])).toBe('Unknown');
  });

  it('extracts MRN from identifier with type.coding.code === MR', () => {
    const id: Patient['identifier'] = [
      { system: 'http://other', value: 'OTHER-1', type: { coding: [{ code: 'SS' }] } },
      { system: 'http://mrn', value: 'MR-42', type: { coding: [{ code: 'MR' }] } },
    ];
    expect(format.mrn(id)).toBe('MR-42');
  });

  it('falls back to first identifier value when MR coding missing', () => {
    expect(
      format.mrn([{ system: 'http://x', value: 'whatever' }]),
    ).toBe('whatever');
  });

  it('formats gender title-cased and dates trimmed to YYYY-MM-DD', () => {
    expect(format.gender('female')).toBe('Female');
    expect(format.gender(undefined)).toBe('—');
    expect(format.date('1990-05-12T00:00:00Z')).toBe('1990-05-12');
    expect(format.date(undefined)).toBe('—');
  });

  it('summarizes an allergy with reactions joined', () => {
    const a: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      id: '1',
      code: { text: 'Peanuts' },
      criticality: 'high',
      reaction: [{ manifestation: [{ text: 'hives' }, { text: 'swelling' }] }],
    };
    expect(format.allergy(a)).toEqual({
      name: 'Peanuts',
      criticality: 'high',
      reactions: 'hives, swelling',
    });
  });

  it('summarizes a problem', () => {
    const c: Condition = {
      resourceType: 'Condition',
      id: '1',
      code: { text: 'Hypertension' },
      onsetDateTime: '2020-03-04',
    };
    expect(format.problem(c)).toEqual({ name: 'Hypertension', onset: '2020-03-04' });
  });

  it('summarizes a medication statement and request', () => {
    const m: MedicationStatement = {
      resourceType: 'MedicationStatement',
      id: '1',
      medicationCodeableConcept: { text: 'Lisinopril' },
      dosage: [{ text: '10mg daily' }],
    };
    expect(format.medication(m)).toEqual({ name: 'Lisinopril', dose: '10mg daily' });

    const r: MedicationRequest = {
      resourceType: 'MedicationRequest',
      id: '1',
      medicationCodeableConcept: { text: 'Amoxicillin' },
      dosageInstruction: [{ text: '500mg q8h' }],
      dispenseRequest: { quantity: { value: 21, unit: 'tablets' } },
    };
    expect(format.prescription(r)).toEqual({
      name: 'Amoxicillin',
      dose: '500mg q8h',
      quantity: '21 tablets',
    });
  });

  it('summarizes a care team participant', () => {
    const p: NonNullable<CareTeam['participant']>[number] = {
      member: { display: 'Dr. Smith' },
      role: [{ text: 'Primary Care' }],
    };
    expect(format.careMember(p)).toEqual({ name: 'Dr. Smith', role: 'Primary Care' });
  });

  it('summarizes an encounter', () => {
    const e: Encounter = {
      resourceType: 'Encounter',
      id: '1',
      status: 'finished',
      type: [{ text: 'Office Visit' }],
      period: { start: '2024-08-12T09:00:00Z' },
      reasonCode: [{ text: 'Annual physical' }],
    };
    expect(format.encounter(e)).toEqual({
      date: '2024-08-12',
      type: 'Office Visit',
      reason: 'Annual physical',
      status: 'finished',
    });
  });
});
