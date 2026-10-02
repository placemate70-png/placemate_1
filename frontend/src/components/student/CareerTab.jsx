import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, ArrowRight, Check, Compass, Loader2, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, formatApiError } from "@/lib/api";
import { severity } from "@/lib/readiness";

/**
 * Role discovery driven by /student/role-recommendations — a hybrid of
 * deterministic skill matching and ChromaDB vector similarity. Every number
 * shown here comes from that endpoint; nothing is estimated client-side.
 */
export const CareerTab = ({ profile, roles = [], onTargetChanged }) => {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rec, m] = await Promise.all([
        api.get("/student/role-recommendations"),
        api.get("/student/meta?recommend=1"),
      ]);
      setData(rec.data);
      setMeta(m.data);
      setSelected((current) => current || rec.data.recommendations?.[0]?.role || null);
      setError("");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setTarget = async (role) => {
    setSaving(true);
    try {
      await api.put("/student/profile", { target_role: role });
      toast.success(`Target role set to ${role}`);
      await onTargetChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center border border-border bg-card p-12" data-testid="career-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-dashed border-border bg-card p-12 text-center" data-testid="career-empty">
        <Compass className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        <p className="mt-4 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const recommendations = data?.recommendations || [];
  const detail = recommendations.find((r) => r.role === selected);
  const requirements = meta?.role_requirements?.[selected] || {};
  const levels = meta?.skill_levels || {};

  // Radar: what the role demands vs what the student has actually been assessed at.
  const radar = Object.entries(requirements).map(([skill, required]) => ({
    skill: skill.length > 13 ? `${skill.slice(0, 12)}…` : skill,
    required,
    you: Number(levels[skill] ?? 0),
  }));

  return (
    <div className="space-y-6" data-testid="student-career-tab">
      <section className="grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-[1.4fr_1fr]">
        <div className="bg-[#0A0A0A] p-8 text-white">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-volt">
            <Compass className="h-3.5 w-3.5" /> Career discovery
          </p>
          <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight">
            {recommendations.length} roles ranked for you
          </h3>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
            Ranked by a hybrid of measured skill match and semantic similarity between your profile and each
            role&rsquo;s requirements — not by a single keyword.
          </p>
          <div className="mt-6 flex flex-wrap gap-6">
            <div>
              <p className="font-mono text-3xl font-bold leading-none">{recommendations[0]?.fit_score ?? "--"}%</p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-white/40">Best fit</p>
            </div>
            <div>
              <p className="font-mono text-sm leading-none text-white/70">{data?.current_target || "none"}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-white/40">Current target</p>
            </div>
          </div>
        </div>

        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">How this is scored</p>
          <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li className="border-l-2 border-volt pl-4">
              <span className="font-medium text-foreground">65%</span> measured skill match from your assessments
            </li>
            <li className="border-l-2 border-volt pl-4">
              <span className="font-medium text-foreground">35%</span> semantic similarity (ChromaDB embeddings)
            </li>
            <li className="border-l-2 border-border pl-4 text-xs">
              Method shown per role, so you can see exactly what produced the number.
            </li>
          </ul>
        </div>
      </section>

      {recommendations[0]?.low_confidence ? (
        <div
          className="flex items-start gap-3 border border-amber-500/40 bg-amber-500/10 p-4"
          data-testid="career-low-confidence"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-sm leading-relaxed text-amber-800">
            <span className="font-medium">Low confidence ranking.</span>{" "}
            {recommendations[0].confidence_note} Take more assessments, or add skills this platform tracks, to
            sharpen it.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="role-cards">
        {recommendations.map((rec, index) => {
          const active = rec.role === selected;
          const isTarget = rec.role === data?.current_target;
          return (
            <button
              key={rec.role}
              type="button"
              onClick={() => setSelected(rec.role)}
              data-testid={`role-card-${rec.role.replace(/\W+/g, "-").toLowerCase()}`}
              className={`group border p-6 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                active ? "border-foreground bg-card shadow-sm" : "border-border bg-card hover:border-foreground/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {isTarget ? (
                  <span className="flex items-center gap-1 border border-volt bg-volt/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest">
                    <Target className="h-2.5 w-2.5" /> Target
                  </span>
                ) : null}
              </div>

              <h4 className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight">{rec.role}</h4>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold">{rec.fit_score}%</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">match</span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-muted">
                <div className="h-full bg-volt transition-[width] duration-700" style={{ width: `${rec.fit_score}%` }} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <div>
                  <dt>Skill</dt>
                  <dd className="mt-0.5 text-sm font-bold text-foreground">{rec.skill_match}%</dd>
                </div>
                <div>
                  <dt>Semantic</dt>
                  <dd className="mt-0.5 text-sm font-bold text-foreground">
                    {rec.semantic_score ?? "—"}
                    {rec.semantic_score != null ? "%" : ""}
                  </dd>
                </div>
              </dl>

              {rec.top_gaps?.length ? (
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Close first:</span> {rec.top_gaps.join(", ")}
                </p>
              ) : (
                <p className="mt-4 border-t border-border pt-3 text-xs text-success">All requirements met</p>
              )}
            </button>
          );
        })}
      </section>

      {detail ? (
        <section className="grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-[1fr_1fr]"
          data-testid="role-detail">
          <div className="bg-card p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Role detail</p>
            <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">{detail.role}</h3>

            <div className="mt-6 grid grid-cols-3 gap-px border border-border bg-border">
              {[
                ["Fit", `${detail.fit_score}%`],
                ["Skill match", `${detail.skill_match}%`],
                ["Method", detail.method],
              ].map(([label, value]) => (
                <div key={label} className="bg-card p-4">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
                  <p className="mt-1.5 font-mono text-sm font-bold">{value}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Required levels
            </p>
            <ul className="mt-3 space-y-2.5">
              {Object.entries(requirements).map(([skill, required]) => {
                const you = Number(levels[skill] ?? 0);
                const gapPct = Math.round(100 * Math.min(Math.max(required - you, 0) / required, 1));
                const tone = severity(gapPct);
                return (
                  <li key={skill}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{skill}</span>
                      <span className="font-mono text-xs font-bold">
                        {you.toFixed(1)}
                        <span className="font-normal text-muted-foreground"> / {required}</span>
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-1.5 w-full bg-muted">
                      <div className={`h-full ${tone.bar}`} style={{ width: `${(you / 5) * 100}%` }} />
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 h-3.5 w-px bg-foreground/50"
                        style={{ left: `${(required / 5) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {detail.role !== data?.current_target ? (
              <Button
                onClick={() => setTarget(detail.role)}
                disabled={saving}
                className="mt-7 rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
                data-testid="set-target-role-button"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Make this my target role <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            ) : (
              <p className="mt-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-success">
                <Check className="h-3.5 w-3.5" /> This is your current target
              </p>
            )}
          </div>

          <div className="bg-card p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              You vs required
            </p>
            {radar.length ? (
              <div className="mt-4 h-[340px]" data-testid="career-radar">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} outerRadius="72%">
                    <PolarGrid stroke="#E5E7EB" />
                    <PolarAngleAxis dataKey="skill" tick={{ fontSize: 9, fontFamily: "JetBrains Mono" }} />
                    <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 9 }} axisLine={false} />
                    <Radar name="Required" dataKey="required" stroke="#9CA3AF" fill="#9CA3AF" fillOpacity={0.18} />
                    <Radar name="You" dataKey="you" stroke="#0A0A0A" strokeWidth={2} fill="#C0FF00" fillOpacity={0.45} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-center gap-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-volt" /> You</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-[#9CA3AF]" /> Required</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default CareerTab;
