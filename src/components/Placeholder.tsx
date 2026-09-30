export default function Placeholder({
  phase,
  children,
}: {
  phase: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-light bg-white px-6 py-10">
      <p className="font-display text-sm font-semibold text-navy">
        Built in Phase {phase}
      </p>
      <div className="mt-2 max-w-prose text-sm leading-relaxed text-charcoal">
        {children}
      </div>
    </div>
  );
}
