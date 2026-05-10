import { useNavigate, useParams } from '@tanstack/react-router';
import { fhir } from '../api/fhir';
import { useFhirQuery } from '../hooks/useFhirResource';
import { clearToken, getToken } from '../auth/tokenStore';
import { AccessBanner } from '../components/AccessBanner';
import { ErrorBox, Spinner } from '../components/common/Card';
import { PatientHeader } from '../components/PatientHeader';
import { AllergiesCard } from '../components/cards/AllergiesCard';
import { ProblemsCard } from '../components/cards/ProblemsCard';
import { MedicationsCard } from '../components/cards/MedicationsCard';
import { PrescriptionsCard } from '../components/cards/PrescriptionsCard';
import { CareTeamCard } from '../components/cards/CareTeamCard';
import { EncountersCard } from '../components/cards/EncountersCard';
import { CopilotPanel } from '../components/CopilotPanel';

export function PatientDashboardPage(): JSX.Element {
  const { id } = useParams({ from: '/patient/$id' });
  const navigate = useNavigate();
  const token = getToken();
  const q = useFhirQuery(['patient', id], () => fhir.patient(id));

  return (
    <div className="mx-auto max-w-5xl p-4">
      <AccessBanner />
      <nav className="mb-3 flex items-center justify-between text-sm">
        {token?.mode === 'clinician' ? (
          <button
            type="button"
            onClick={() => void navigate({ to: '/' })}
            className="text-blue-600 hover:underline"
          >
            ← Back to patients
          </button>
        ) : (
          <span className="text-xs text-slate-500">Single-patient session</span>
        )}
        <button
          type="button"
          onClick={() => clearToken()}
          className="text-slate-500 hover:text-slate-900"
        >
          Sign out
        </button>
      </nav>

      {q.isLoading && <Spinner />}
      {q.isError && <ErrorBox message={String(q.error)} />}
      {q.data && (
        <>
          <PatientHeader patient={q.data} />
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <AllergiesCard patientId={id} />
            <ProblemsCard patientId={id} />
            <MedicationsCard patientId={id} />
            <PrescriptionsCard patientId={id} />
            <CareTeamCard patientId={id} />
            <EncountersCard patientId={id} />
          </div>
        </>
      )}
      {/* W3: in-portal Co-Pilot panel. Self-gates via /capabilities.php
          probe — renders nothing if the OpenEMR backend isn't configured. */}
      <CopilotPanel />
    </div>
  );
}
