import { fhir } from '../../api/fhir';
import { format } from '../../api/format';
import { useFhirQuery } from '../../hooks/useFhirResource';
import { Card, EmptyState, ErrorBox, Spinner } from '../common/Card';

export function ProblemsCard({ patientId }: { patientId: string }): JSX.Element {
  const q = useFhirQuery(['problems', patientId], () => fhir.problems(patientId));

  return (
    <Card title="Problem List" count={q.data?.length}>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorBox message={String(q.error)} />}
      {q.data && q.data.length === 0 && <EmptyState message="No active problems." />}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {q.data.map((p) => {
            const f = format.problem(p);
            return (
              <li key={p.id} className="py-2">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">Onset: {f.onset}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
