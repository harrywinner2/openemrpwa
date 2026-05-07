import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { fhir } from '../api/fhir';
import { format } from '../api/format';
import { useFhirQuery } from '../hooks/useFhirResource';
import { clearToken, getToken } from '../auth/tokenStore';
import { AccessBanner } from '../components/AccessBanner';
import { EmptyState, ErrorBox, Spinner } from '../components/common/Card';

export function PatientPickerPage(): JSX.Element {
  const [query, setQuery] = useState<string>('');
  const navigate = useNavigate();
  const token = getToken();

  // single-patient mode short-circuits the picker
  if (token?.mode === 'single-patient' && token.patient_id) {
    void navigate({ to: '/patient/$id', params: { id: token.patient_id } });
  }

  const q = useFhirQuery(['patients', query], () => fhir.searchPatients(query, 50));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <AccessBanner />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Patients</h1>
        <button
          type="button"
          onClick={() => clearToken()}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Sign out
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
      />

      <div className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm">
        {q.isLoading && (
          <div className="p-4">
            <Spinner />
          </div>
        )}
        {q.isError && (
          <div className="p-4">
            <ErrorBox message={String(q.error)} />
          </div>
        )}
        {q.data && q.data.length === 0 && (
          <div className="p-4">
            <EmptyState message="No patients found." />
          </div>
        )}
        {q.data && q.data.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {q.data.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/patient/$id', params: { id: p.id } })}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span>
                    <span className="font-medium text-slate-900">{format.name(p.name)}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      MRN {format.mrn(p.identifier)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {format.gender(p.gender)} · DOB {format.date(p.birthDate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
