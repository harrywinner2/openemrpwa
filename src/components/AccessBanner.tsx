import { getAccessSummary } from '../auth/tokenStore';

export function AccessBanner(): JSX.Element | null {
  const summary = getAccessSummary();
  if (!summary) return null;

  const isClinician = summary.mode === 'clinician';
  const palette = isClinician
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-emerald-300 bg-emerald-50 text-emerald-900';

  const expires = new Date(summary.expires_at).toLocaleTimeString();
  const userLabel = summary.user_name ?? summary.user_sub ?? 'unknown user';
  const grantedScopes = summary.granted_scope
    .split(/\s+/)
    .filter((s) => s.includes('/'))
    .map(prettyScope);
  const accessKind = isClinician
    ? 'Clinician (user/* — inherits OpenEMR permissions)'
    : `Single patient${summary.patient_context ? ` (PT-${summary.patient_context})` : ''}`;

  return (
    <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${palette}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span>
          <span className="font-semibold">{userLabel}</span> · {accessKind}
        </span>
        <span className="text-[11px] opacity-80">Token expires at {expires}</span>
      </div>
      {grantedScopes.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-[11px] opacity-80">
            Granted scopes ({grantedScopes.length})
          </summary>
          <ul className="mt-1 list-disc pl-5 text-[11px] opacity-90">
            {grantedScopes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function prettyScope(s: string): string {
  // user/Patient.rs → "Read & search Patient (user-level)"
  const match = s.match(/^(user|patient|system)\/(\w+)\.([a-z]+)/);
  if (!match) return s;
  const [, level, resource, ops] = match;
  const opMap: Record<string, string> = {
    rs: 'Read & search',
    r: 'Read',
    s: 'Search',
    c: 'Create',
    u: 'Update',
    d: 'Delete',
    cu: 'Create & update',
    cud: 'Create, update, delete',
    cruds: 'Full access',
  };
  const opLabel = opMap[ops] ?? ops.toUpperCase();
  return `${opLabel} ${resource} (${level}-level)`;
}
