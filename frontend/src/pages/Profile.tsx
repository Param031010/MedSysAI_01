import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/profile/Field";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { LoadError } from "@/components/LoadError";
import { getProfile, saveProfile } from "@/services/profile";
import type { ProfileInput } from "@/services/profile";
import type { ProfileRecord } from "@/types";

export default function Profile() {
  const [profile, setProfile] = useState<ProfileRecord | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    getProfile()
      .then((p) => {
        if (!active) return;
        setProfile(p);
        setEditing(!p);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  async function handleSave(input: ProfileInput) {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveProfile(input);
      setProfile(saved);
      setEditing(false);
    } catch {
      setError("Couldn't save your profile — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader eyebrow="Profile" title="Record" />
        <LoadError
          message="Couldn't load your profile — the backend may be unreachable."
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div>
        <PageHeader eyebrow="Profile" title="Record" />
        <p className="px-5 py-16 text-center text-sm text-stone sm:px-8">
          Loading your record…
        </p>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <PageHeader
          eyebrow="Profile"
          title={profile ? profile.fullName : "Set up your record"}
          meta={profile ? "Edit record" : "Tell us about yourself to get started"}
        />
        <ProfileForm
          initial={profile}
          saving={saving}
          error={error}
          onCancel={profile ? () => setEditing(false) : undefined}
          onSave={handleSave}
        />
      </div>
    );
  }

  if (!profile) {
    // Unreachable: `editing` is always true above whenever `profile` is null.
    return null;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Profile"
        title={profile.fullName}
        meta="Record"
        action={
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-4 py-2 text-[13px] text-ink transition-colors hover:border-teal-deep/60"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            Edit
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            Measurements
          </h2>
          <dl>
            <Field label="Age" value={`${profile.age} yrs`} />
            <Field label="Weight" value={`${profile.weightKg} kg`} />
            <Field label="Height" value={`${profile.heightCm} cm`} />
            <Field label="BMI" value={profile.bmi.toFixed(1)} />
            <Field label="Blood group" value={profile.bloodGroup} />
          </dl>
        </section>

        <section>
          <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            Emergency contact
          </h2>
          <dl>
            <Field label="Name" value={profile.emergencyContact.name} />
            <Field label="Relation" value={profile.emergencyContact.relation} />
            <Field label="Phone" value={profile.emergencyContact.phone} />
          </dl>
        </section>

        <section>
          <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            History
          </h2>
          {profile.conditions.length === 0 ? (
            <p className="py-3.5 text-[13px] text-stone">No conditions on record.</p>
          ) : (
            <dl>
              {profile.conditions.map((c) => (
                <Field key={c} label="Condition" value={c} />
              ))}
            </dl>
          )}
        </section>

        <section>
          <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            Medications
          </h2>
          {profile.medications.length === 0 ? (
            <p className="py-3.5 text-[13px] text-stone">No medications on record.</p>
          ) : (
            <dl>
              {profile.medications.map((m) => (
                <Field key={m.name} label={m.name} value={m.dosage} />
              ))}
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
