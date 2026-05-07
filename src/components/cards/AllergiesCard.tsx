import { fhir } from '../../api/fhir';
import { format } from '../../api/format';
import { useFhirQuery } from '../../hooks/useFhirResource';
import { Card, EmptyState, ErrorBox, Spinner } from '../common/Card';

export function AllergiesCard({ patientId }: { patientId: string }): JSX.Element {
  const q = useFhirQuery(['allergies', patientId], () => fhir.allergies(patientId));

  return (
    <Card title="Allergies" count={q.data?.length}>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorBox message={String(q.error)} />}
      {q.data && q.data.length === 0 && <EmptyState message="No known allergies." />}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {q.data.map((a) => {
            const f = format.allergy(a);
            return (
              <li key={a.id} className="py-2">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">
                  Criticality: {f.criticality} · Reactions: {f.reactions}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
