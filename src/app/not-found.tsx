import Link from "next/link";

// Any address that doesn't match a page.
export default function NotFound() {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="text-center">
        <p className="font-display text-sm font-semibold text-teal">404</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-navy">Page not found</h1>
        <p className="mt-2 text-sm text-charcoal">Check the address, or head back to your time.</p>
        <Link href="/tracker" className="mt-5 inline-block text-sm font-medium text-blue hover:underline">
          Go to Time Tracker
        </Link>
      </div>
    </main>
  );
}
