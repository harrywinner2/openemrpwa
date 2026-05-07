export function Card({
  title,
  count,
  children,
}: {
  title: string;
  count?: number | undefined;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {typeof count === 'number' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {count}
          </span>
        )}
      </header>
      <div className="px-4 py-3 text-sm text-slate-700">{children}</div>
    </section>
  );
}

export function Spinner(): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-slate-500">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      <span>Loading…</span>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }): JSX.Element {
  return (
    <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{message}</p>
  );
}

export function EmptyState({ message }: { message: string }): JSX.Element {
  return <p className="italic text-slate-500">{message}</p>;
}
