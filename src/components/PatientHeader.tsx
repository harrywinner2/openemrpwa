import { format } from '../api/format';
import type { Patient } from '../api/types';

export function PatientHeader({ patient }: { patient: Patient }): JSX.Element {
  return (
    <header className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">
            {format.name(patient.name)}
          </h1>
          <p className="text-xs text-slate-500">Patient ID: {patient.id}</p>
        </div>

        <Field label="DOB" value={format.date(patient.birthDate)} />
        <Field label="Sex" value={format.gender(patient.gender)} />
        <Field label="MRN" value={format.mrn(patient.identifier)} />
        <StatusPill active={patient.active ?? true} />
      </div>
    </header>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="text-sm">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }): JSX.Element {
  return (
    <span
      className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
