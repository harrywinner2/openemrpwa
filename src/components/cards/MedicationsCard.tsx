import { fhir } from '../../api/fhir';
import { format } from '../../api/format';
import { useFhirQuery } from '../../hooks/useFhirResource';
import { Card, EmptyState, ErrorBox, Spinner } from '../common/Card';

export function MedicationsCard({ patientId }: { patientId: string }): JSX.Element {
  const q = useFhirQuery(['medications', patientId], () => fhir.medications(patientId));

  return (
    <Card title="Medications" count={q.data?.length}>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorBox message={String(q.error)} />}
      {q.data && q.data.length === 0 && <EmptyState message="No active medications." />}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {q.data.map((m) => {
            const f = format.medication(m);
            return (
              <li key={m.id} className="py-2">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">{f.dose}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
