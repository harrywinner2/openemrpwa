/**
 * Narrow FHIR R4 types — only the fields the UI actually reads.
 * We deliberately avoid pulling in `@types/fhir` (huge) because the surface
 * area we touch is small and explicit.
 */

export type Coding = {
  system?: string;
  code?: string;
  display?: string;
};

export type CodeableConcept = {
  coding?: Coding[];
  text?: string;
};

export type Reference = {
  reference?: string;
  display?: string;
};

export type Period = {
  start?: string;
  end?: string;
};

export type HumanName = {
  use?: string;
  text?: string;
  family?: string;
  given?: string[];
};

export type Identifier = {
  system?: string;
  value?: string;
  type?: CodeableConcept;
  use?: string;
};

export type Patient = {
  resourceType: 'Patient';
  id: string;
  active?: boolean;
  name?: HumanName[];
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  identifier?: Identifier[];
};

export type AllergyIntolerance = {
  resourceType: 'AllergyIntolerance';
  id: string;
  code?: CodeableConcept;
  criticality?: 'low' | 'high' | 'unable-to-assess';
  clinicalStatus?: CodeableConcept;
  reaction?: { manifestation?: CodeableConcept[]; severity?: string }[];
};

export type Condition = {
  resourceType: 'Condition';
  id: string;
  code?: CodeableConcept;
  clinicalStatus?: CodeableConcept;
  category?: CodeableConcept[];
  onsetDateTime?: string;
};

export type MedicationStatement = {
  resourceType: 'MedicationStatement';
  id: string;
  status?: string;
  medicationCodeableConcept?: CodeableConcept;
  dosage?: { text?: string }[];
};

export type MedicationRequest = {
  resourceType: 'MedicationRequest';
  id: string;
  status?: string;
  intent?: string;
  medicationCodeableConcept?: CodeableConcept;
  dosageInstruction?: { text?: string }[];
  dispenseRequest?: { quantity?: { value?: number; unit?: string } };
};

export type CareTeam = {
  resourceType: 'CareTeam';
  id: string;
  status?: string;
  participant?: { role?: CodeableConcept[]; member?: Reference }[];
};

export type Encounter = {
  resourceType: 'Encounter';
  id: string;
  status?: string;
  class?: Coding;
  type?: CodeableConcept[];
  period?: Period;
  reasonCode?: CodeableConcept[];
};

export type Bundle<T> = {
  resourceType: 'Bundle';
  type: string;
  total?: number;
  entry?: { resource: T }[];
};
