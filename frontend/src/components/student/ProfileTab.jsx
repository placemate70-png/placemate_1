import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";

const Field = ({ label, children, hint }) => (
  <div>
    <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{label}</Label>
    <div className="mt-2">{children}</div>
    {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

/** Read-only presentation of a value, used whenever the form is not in edit mode. */
const ReadOnly = ({ value, testId }) => (
  <p
    className="flex h-11 items-center border border-transparent bg-muted/40 px-3 text-sm"
    data-testid={testId}
  >
    {value === "" || value === null || value === undefined ? (
      <span className="text-muted-foreground">Not set</span>
    ) : (
      value
    )}
  </p>
);

const toForm = (profile) => ({
  roll_number: profile.roll_number || "",
  degree: profile.degree || "",
  graduation_year: profile.graduation_year || "",
  cgpa: profile.cgpa ?? "",
  target_role: profile.target_role || "",
  headline: profile.headline || "",
  skills: (profile.skills || []).join(", "),
  projects_count: profile.projects_count || 0,
  internships_count: profile.internships_count || 0,
});

export const ProfileTab = ({ profile, roles, user, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toForm(profile));
  const [saving, setSaving] = useState(false);

  // Keep the form in step with refreshed profile data while not editing, so a
  // resume upload that prefills skills is reflected here too.
  useEffect(() => {
    if (!editing) setForm(toForm(profile));
  }, [profile, editing]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Write-once: the server rejects any change after it is set, so the input is
  // locked here rather than letting the student type a value that will bounce.
  const rollLocked = Boolean(profile.roll_number);

  const cancel = () => {
    setForm(toForm(profile));
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        degree: form.degree || null,
        graduation_year: form.graduation_year ? Number(form.graduation_year) : null,
        cgpa: form.cgpa === "" ? null : Number(form.cgpa),
        target_role: form.target_role || null,
        headline: form.headline || null,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        projects_count: Number(form.projects_count) || 0,
        internships_count: Number(form.internships_count) || 0,
      };
      // Only send the roll number while it is still unset.
      if (!rollLocked && form.roll_number.trim()) payload.roll_number = form.roll_number.trim();
      Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);

      await api.put("/student/profile", payload);
      toast.success("Profile saved");
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" data-testid="student-profile-tab">
      <section className="border border-border bg-card p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-semibold tracking-tight">Placement profile</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Completeness feeds directly into your readiness score.
            </p>
          </div>

          {editing ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={cancel}
                disabled={saving}
                className="rounded-full"
                data-testid="profile-cancel-button"
              >
                <X className="mr-2 h-3.5 w-3.5" /> Cancel
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
                data-testid="profile-save-button"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setEditing(true)}
              className="rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
              data-testid="profile-edit-button"
            >
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit profile
            </Button>
          )}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Field
            label="Roll number"
            hint={rollLocked ? "Set once and cannot be changed. Ask your coordinator to correct it." : undefined}
          >
            {rollLocked ? (
              <div className="relative">
                <ReadOnly value={profile.roll_number} testId="profile-roll-number" />
                <Lock className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            ) : editing ? (
              <Input
                value={form.roll_number}
                onChange={(e) => set("roll_number", e.target.value)}
                placeholder="NIT21CS004"
                className="h-11 rounded-sm"
                data-testid="profile-roll-number"
              />
            ) : (
              <ReadOnly value="" testId="profile-roll-number" />
            )}
          </Field>

          <Field label="Degree">
            {editing ? (
              <Input value={form.degree} onChange={(e) => set("degree", e.target.value)} placeholder="B.Tech"
                className="h-11 rounded-sm" data-testid="profile-degree" />
            ) : (
              <ReadOnly value={form.degree} testId="profile-degree" />
            )}
          </Field>

          <Field label="Graduation year">
            {editing ? (
              <Input type="number" value={form.graduation_year}
                onChange={(e) => set("graduation_year", e.target.value)} className="h-11 rounded-sm"
                data-testid="profile-graduation-year" />
            ) : (
              <ReadOnly value={form.graduation_year} testId="profile-graduation-year" />
            )}
          </Field>

          <Field label="CGPA (0-10)">
            {editing ? (
              <Input type="number" step="0.01" value={form.cgpa} onChange={(e) => set("cgpa", e.target.value)}
                className="h-11 rounded-sm" data-testid="profile-cgpa" />
            ) : (
              <ReadOnly value={form.cgpa} testId="profile-cgpa" />
            )}
          </Field>

          <Field label="Target role">
            {editing ? (
              <Select value={form.target_role} onValueChange={(v) => set("target_role", v)}>
                <SelectTrigger className="h-11 rounded-sm" data-testid="profile-target-role">
                  <SelectValue placeholder="Select target role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r} data-testid={`role-option-${r.replace(/[^a-z]/gi, "-").toLowerCase()}`}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <ReadOnly value={form.target_role} testId="profile-target-role" />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Projects">
              {editing ? (
                <Input type="number" value={form.projects_count}
                  onChange={(e) => set("projects_count", e.target.value)} className="h-11 rounded-sm"
                  data-testid="profile-projects" />
              ) : (
                <ReadOnly value={form.projects_count} testId="profile-projects" />
              )}
            </Field>
            <Field label="Internships">
              {editing ? (
                <Input type="number" value={form.internships_count}
                  onChange={(e) => set("internships_count", e.target.value)} className="h-11 rounded-sm"
                  data-testid="profile-internships" />
              ) : (
                <ReadOnly value={form.internships_count} testId="profile-internships" />
              )}
            </Field>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <Field label="Headline">
            {editing ? (
              <Input value={form.headline} onChange={(e) => set("headline", e.target.value)}
                placeholder="Final-year CS student targeting backend roles" className="h-11 rounded-sm"
                data-testid="profile-headline" />
            ) : (
              <ReadOnly value={form.headline} testId="profile-headline" />
            )}
          </Field>

          <Field
            label="Skills (comma separated)"
            hint={editing ? "Declared skills add context for the AI recommendations." : undefined}
          >
            {editing ? (
              <Textarea value={form.skills} onChange={(e) => set("skills", e.target.value)} rows={3}
                className="rounded-sm" data-testid="profile-skills" />
            ) : (
              <div className="flex flex-wrap gap-2" data-testid="profile-skills">
                {form.skills
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((skill) => (
                    <span key={skill} className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
                      {skill}
                    </span>
                  ))}
                {!form.skills.trim() ? <span className="text-sm text-muted-foreground">Not set</span> : null}
              </div>
            )}
          </Field>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="border border-border bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Institution binding</p>
          <p className="mt-3 font-display text-lg font-semibold tracking-tight">{user.institution_name || "—"}</p>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {profile.department}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Only the verified coordinator of this institution and department can ever be shown your record.
          </p>
        </div>

        <div className="border border-border bg-[#0A0A0A] p-8 text-white">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-volt">Who can see this</p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Your verified placement coordinator can review your resume, scores and readiness as part of managing
            placements for {profile.department}.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-white/50">
            Coordinators outside your institution or department can never see your record, and every resume view
            and score access is written to the audit log with a timestamp.
          </p>
        </div>
      </aside>
    </div>
  );
};

export default ProfileTab;
