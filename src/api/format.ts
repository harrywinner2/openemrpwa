import type {
  AllergyIntolerance,
  CareTeam,
  CodeableConcept,
  Condition,
  Encounter,
  HumanName,
  Identifier,
  MedicationRequest,
  MedicationStatement,
  Patient,
} from './types';

export function formatName(name?: HumanName[]): string {
  if (!name || name.length === 0) return 'Unknown';
  const n = name[0];
  if (n.text) return n.text;
  const given = (n.given ?? []).join(' ');
  return [given, n.family].filter(Boolean).join(' ').trim() || 'Unknown';
}

export function formatMrn(identifier?: Identifier[]): string {
  if (!identifier) return '—';
  const mr = identifier.find((i) =>
    (i.type?.coding ?? []).some((c) => c.code === 'MR'),
  );
  return mr?.value ?? identifier[0]?.value ?? '—';
}

export function formatGender(g?: Patient['gender']): string {
  if (!g) return '—';
  return g.charAt(0).toUpperCase() + g.slice(1);
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function codeText(c?: CodeableConcept): string {
  if (!c) return '—';
  if (c.text) return c.text;
  return c.coding?.find((x) => x.display)?.display ?? c.coding?.[0]?.code ?? '—';
}

export const format = {
  name: formatName,
  mrn: formatMrn,
  gender: formatGender,
  date: formatDate,

  allergy(a: AllergyIntolerance): { name: string; criticality: string; reactions: string } {
    return {
      name: codeText(a.code),
      criticality: a.criticality ?? '—',
      reactions: (a.reaction ?? [])
        .flatMap((r) => r.manifestation ?? [])
        .map(codeText)
        .filter((s) => s !== '—')
        .join(', ') || '—',
    };
  },

  problem(c: Condition): { name: string; onset: string } {
    return { name: codeText(c.code), onset: formatDate(c.onsetDateTime) };
  },

  medication(m: MedicationStatement): { name: string; dose: string } {
    return {
      name: codeText(m.medicationCodeableConcept),
      dose: m.dosage?.find((d) => d.text)?.text ?? '—',
    };
  },

  prescription(r: MedicationRequest): { name: string; dose: string; quantity: string } {
    const q = r.dispenseRequest?.quantity;
    return {
      name: codeText(r.medicationCodeableConcept),
      dose: r.dosageInstruction?.find((d) => d.text)?.text ?? '—',
      quantity: q?.value !== undefined ? `${q.value}${q.unit ? ' ' + q.unit : ''}` : '—',
    };
  },

  careMember(p: NonNullable<CareTeam['participant']>[number]): { name: string; role: string } {
    return {
      name: p.member?.display ?? '—',
      role: codeText(p.role?.[0]),
    };
  },

  encounter(e: Encounter): { date: string; type: string; reason: string; status: string } {
    return {
      date: formatDate(e.period?.start),
      type: codeText(e.type?.[0]),
      reason: codeText(e.reasonCode?.[0]),
      status: e.status ?? '—',
    };
  },
};
