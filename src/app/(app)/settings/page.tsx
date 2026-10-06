"use client";

import PageHeader from "@/components/PageHeader";
import ProfileForm from "@/components/ProfileForm";
import { useSession } from "@/lib/session";

export default function SettingsPage() {
  const { profile, reloadProfile } = useSession();
  return (
    <>
      <PageHeader title="Settings" />
      <section className="mb-6 rounded-lg border border-light bg-white p-6">
        <h2 className="mb-4 font-display text-base font-semibold text-navy">Your profile</h2>
        <ProfileForm
          id={profile.id}
          name={profile.name}
          email={profile.email}
          timezone={profile.timezone}
          onSaved={reloadProfile}
        />
      </section>
    </>
  );
}
