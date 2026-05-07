import { fhir } from '../../api/fhir';
import { format } from '../../api/format';
import { useFhirQuery } from '../../hooks/useFhirResource';
import { Card, EmptyState, ErrorBox, Spinner } from '../common/Card';

export function PrescriptionsCard({ patientId }: { patientId: string }): JSX.Element {
  const q = useFhirQuery(['prescriptions', patientId], () => fhir.prescriptions(patientId));

  return (
    <Card title="Prescriptions" count={q.data?.length}>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorBox message={String(q.error)} />}
      {q.data && q.data.length === 0 && <EmptyState message="No active prescriptions." />}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {q.data.map((r) => {
            const f = format.prescription(r);
            return (
              <li key={r.id} className="py-2">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">
                  {f.dose} · Qty: {f.quantity}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
