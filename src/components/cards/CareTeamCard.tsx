import { fhir } from '../../api/fhir';
import { format } from '../../api/format';
import { useFhirQuery } from '../../hooks/useFhirResource';
import { Card, EmptyState, ErrorBox, Spinner } from '../common/Card';

export function CareTeamCard({ patientId }: { patientId: string }): JSX.Element {
  const q = useFhirQuery(['careTeam', patientId], () => fhir.careTeam(patientId));

  const members = (q.data ?? []).flatMap((ct) => ct.participant ?? []);

  return (
    <Card title="Care Team" count={members.length}>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorBox message={String(q.error)} />}
      {q.data && members.length === 0 && <EmptyState message="No care team members assigned." />}
      {members.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {members.map((p, idx) => {
            const f = format.careMember(p);
            return (
              <li key={idx} className="py-2">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">{f.role}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
