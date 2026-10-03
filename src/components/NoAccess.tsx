import Link from "next/link";
import { Lock } from "lucide-react";

export default function NoAccess() {
  return (
    <div className="rounded-lg border border-light bg-white px-6 py-12 text-center">
      <Lock size={22} className="mx-auto text-medium" />
      <h1 className="mt-3 font-display text-lg font-semibold text-navy">
        You don&apos;t have access to this page
      </h1>
      <p className="mt-1 text-sm text-charcoal">
        Only the Director and Managers can see team information.
      </p>
      <Link
        href="/tracker"
        className="mt-5 inline-block text-sm font-medium text-blue hover:underline"
      >
        Go to Time Tracker
      </Link>
    </div>
  );
}
