import Link from "next/link";

// Shown inside the app, e.g. for a team member link that no longer exists.
export default function AppNotFound() {
  return (
    <div className="rounded-lg border border-light bg-white px-6 py-12 text-center">
      <h1 className="font-display text-lg font-semibold text-navy">Not found</h1>
      <p className="mt-1 text-sm text-charcoal">That page or person doesn&apos;t exist.</p>
      <Link href="/tracker" className="mt-5 inline-block text-sm font-medium text-blue hover:underline">
        Go to Time Tracker
      </Link>
    </div>
  );
}
