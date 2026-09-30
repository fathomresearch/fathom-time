export default function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex min-h-10 items-center justify-between gap-4">
      <h1 className="font-display text-2xl font-semibold text-navy">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
