import Image from "next/image";
import SignInButton from "@/components/SignInButton";
import { allowedDomain } from "@/lib/config";

const ERRORS: Record<string, string> = {
  deactivated:
    "Your account is deactivated. Ask your manager to reactivate it.",
  domain: "That Google account isn't allowed. Use your company account.",
  config:
    "Sign-in isn't finished being set up: SUPABASE_SERVICE_ROLE_KEY is missing from .env.local.",
  cancelled: "Sign-in was cancelled. Try again.",
  failed: "Sign-in didn't finish. Try again.",
  no_profile: "Your profile couldn't be loaded. Sign in again.",
};

function SonarRings() {
  // Echoes the circular mark in the Fathom logo.
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 600"
      className="pointer-events-none absolute -right-48 -bottom-48 h-[640px] w-[640px]"
    >
      {[60, 120, 180, 240, 300].map((r, i) => (
        <circle
          key={r}
          cx="300"
          cy="300"
          r={r}
          fill="none"
          stroke="#00D6B3"
          strokeOpacity={0.16 - i * 0.025}
          strokeWidth="1.5"
        />
      ))}
      <circle cx="300" cy="300" r="5" fill="#00D6B3" fillOpacity="0.5" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const domain = allowedDomain();

  return (
    <div className="flex min-h-screen">
      <section className="relative hidden w-[44%] flex-col overflow-hidden bg-navy px-14 py-12 md:flex">
        <Image
          src="/Fathom_Wordmark_White.png"
          alt="Fathom Research & Strategy"
          width={170}
          height={40}
          priority
        />
        <div className="relative my-auto">
          <span className="mb-6 block h-1 w-12 rounded bg-teal" />
          <h1 className="max-w-[14ch] font-display text-[40px] font-semibold leading-[1.15] text-white">
            Track the work. See where the hours go.
          </h1>
        </div>
        <p className="relative font-display text-sm font-medium text-teal">
          Clarity Beneath the Surface.
        </p>
        <SonarRings />
      </section>

      <section className="flex flex-1 items-center justify-center bg-white px-8">
        <div className="w-full max-w-sm">
          <Image
            src="/Fathom_Wordmark_Navy.png"
            alt="Fathom Research & Strategy"
            width={150}
            height={35}
            className="mb-10 md:hidden"
          />
          <h2 className="font-display text-2xl font-semibold text-navy">
            Sign in to Fathom Time
          </h2>
          <p className="mt-2 text-sm text-charcoal">
            {domain
              ? `Use your @${domain} Google account.`
              : "Use your Google account."}
          </p>

          {message && (
            <p
              role="alert"
              className="mt-6 rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
            >
              {message}
            </p>
          )}

          <SignInButton domain={domain} />
        </div>
      </section>
    </div>
  );
}
