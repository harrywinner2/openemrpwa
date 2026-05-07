import { fhir } from '../../api/fhir';
import { format } from '../../api/format';
import { useFhirQuery } from '../../hooks/useFhirResource';
import { Card, EmptyState, ErrorBox, Spinner } from '../common/Card';

export function EncountersCard({ patientId }: { patientId: string }): JSX.Element {
  const q = useFhirQuery(['encounters', patientId], () => fhir.encounters(patientId));

  return (
    <Card title="Encounters" count={q.data?.length}>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorBox message={String(q.error)} />}
      {q.data && q.data.length === 0 && <EmptyState message="No prior encounters." />}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {q.data.map((e) => {
            const f = format.encounter(e);
            return (
              <li key={e.id} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{f.type}</span>
                  <span className="text-xs text-slate-500">{f.date}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {f.reason !== '—' ? `${f.reason} · ` : ''}Status: {f.status}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
