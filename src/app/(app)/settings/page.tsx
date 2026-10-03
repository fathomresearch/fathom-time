import { Circle, CircleAlert, CircleCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ProfileForm from "@/components/ProfileForm";
import { requireProfile } from "@/lib/auth";
import { checkSetup } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await requireProfile();
  const isDirector = profile.role === "director";
  const items = isDirector ? await checkSetup() : [];
  const allZones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title="Settings" />

      <section className="mb-6 rounded-lg border border-light bg-white p-6">
        <h2 className="mb-4 font-display text-base font-semibold text-navy">
          Your profile
        </h2>
        <ProfileForm
          name={profile.name}
          email={profile.email}
          timezone={profile.timezone}
          allZones={allZones}
        />
      </section>

      {isDirector && (
        <section className="rounded-lg border border-light bg-white">
          <div className="border-b border-light px-6 py-4">
            <h2 className="font-display text-base font-semibold text-navy">
              Setup check
            </h2>
            <p className="mt-1 text-sm text-charcoal">
              Reads your <code>.env.local</code>. Restart{" "}
              <code>npm run dev</code> after editing it. Only the Director sees
              this.
            </p>
          </div>
          <ul>
            {items.map((item) => (
              <li
                key={item.label}
                className="flex items-start gap-3 border-b border-lightest px-6 py-3 last:border-b-0"
              >
                {item.ok ? (
                  <CircleCheck size={18} className="mt-0.5 shrink-0 text-teal" />
                ) : item.optional ? (
                  <Circle size={18} className="mt-0.5 shrink-0 text-medium" />
                ) : (
                  <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy">{item.label}</p>
                  <p className="truncate text-sm text-charcoal">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
