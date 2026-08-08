/**
 * Consistent top bar for panel pages: title left, muted text state after it,
 * actions at the far right — keep children to plain text spans and small
 * chips, exactly like every panel page uses it.
 */
export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5 text-sm">
      <h1 className="shrink-0 text-sm font-semibold">{title}</h1>
      {children}
    </header>
  );
}
