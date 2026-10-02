import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReadinessBadge from "@/components/ReadinessBadge";
import { api, formatApiError } from "@/lib/api";
import { gapLevel, severity } from "@/lib/readiness";

export const SkillGapTab = ({ profile, report, roles, readiness, onAnalyzed }) => {
  const [role, setRole] = useState(profile.target_role || roles[0] || "");
  const [running, setRunning] = useState(false);
  // Per-skill recommendations live on the skill_gaps rows, which /student/progress
  // exposes keyed by skill — the report itself only carries a flat list.
  const [advice, setAdvice] = useState({});

  const loadAdvice = useCallback(async () => {
    try {
      const { data } = await api.get("/student/progress");
      setAdvice(
        Object.fromEntries((data.items || []).filter((i) => i.recommendation).map((i) => [i.skill, i.recommendation]))
      );
    } catch {
      setAdvice({});
    }
  }, []);

  useEffect(() => {
    loadAdvice();
  }, [loadAdvice, report?.id]);

  const run = async () => {
    setRunning(true);
    try {
      const { data } = await api.post("/student/analyze", { target_role: role });
      toast.success(`Readiness score ${data.overall_score}/100`);
      onAnalyzed();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setRunning(false);
    }
  };

  const chartData = (report?.gaps || []).map((g) => ({
    skill: g.skill.length > 14 ? `${g.skill.slice(0, 13)}…` : g.skill,
    current: g.current,
    required: g.required,
  }));

  return (
    <div className="space-y-6" data-testid="student-skillgap-tab">
      <section className="grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-4">
        <div className="bg-[#0A0A0A] p-8 text-white">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-volt">Readiness score</p>
          <p className="mt-4 font-mono text-6xl font-bold leading-none" data-testid="readiness-score">
            {report ? report.overall_score : "--"}
          </p>
          <p className="mt-2 font-mono text-xs text-white/50">/ 100</p>
          <div className="mt-6 h-1 w-full bg-white/10">
            <div className="h-full bg-volt transition-[width] duration-500"
              style={{ width: `${report ? report.overall_score : 0}%` }} />
          </div>
        </div>
        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Readiness status</p>
          <div className="mt-4">
            <ReadinessBadge value={readiness} testId="student-readiness-badge" />
          </div>
          {profile.readiness_override ? (
            <p className="mt-4 text-xs text-muted-foreground" data-testid="readiness-override-note">
              Set by your placement coordinator{profile.coordinator_note ? `: “${profile.coordinator_note}”` : ""}
            </p>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">Derived from your latest analysis</p>
          )}
        </div>
        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Target role</p>
          <p className="mt-4 text-base font-medium" data-testid="analysis-target-role">
            {report?.target_role || profile.target_role || "Not set"}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Engine: {report?.provider || "not run"}
          </p>
        </div>
        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Run analysis</p>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="mt-4 h-10 rounded-sm" data-testid="analyze-role-select">
              <SelectValue placeholder="Target role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={run} disabled={running || !role}
            className="mt-4 w-full rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
            data-testid="run-analysis-button">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Analyse skill gap
          </Button>
        </div>
      </section>

      {running ? <div className="h-px w-full beam" data-testid="analysis-beam" /> : null}

      {report ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="border border-border bg-card p-8">
              <h3 className="font-display text-xl font-semibold tracking-tight">Current vs required level</h3>
              <div className="mt-8 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="skill" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} interval={0}
                      angle={-25} textAnchor="end" height={70} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                    <Tooltip contentStyle={{ borderRadius: 2, fontFamily: "IBM Plex Sans", fontSize: 12 }} />
                    <Bar dataKey="required" fill="#E5E7EB" />
                    <Bar dataKey="current" fill="#C0FF00">
                      {chartData.map((entry) => (
                        <Cell key={entry.skill} fill={entry.current >= entry.required ? "#10B981" : "#C0FF00"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-6">
              <div className="border border-border bg-card p-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">AI summary</p>
                <p className="mt-4 text-sm leading-relaxed" data-testid="analysis-summary">{report.summary}</p>
              </div>
              <div className="border border-border bg-card p-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Recommended actions
                </p>
                <ol className="mt-4 space-y-3" data-testid="analysis-recommendations">
                  {report.recommendations.map((rec, index) => (
                    <li key={rec} className="flex gap-3 text-sm leading-relaxed">
                      <span className="font-mono text-xs font-bold text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section className="border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
              <h3 className="font-display text-lg font-semibold tracking-tight">Gap breakdown</h3>
              <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-destructive" /> Critical</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-amber-500" /> Moderate</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-success" /> On track</span>
              </div>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
              {report.gaps.map((gap) => {
                const level = gapLevel(gap);
                const tone = severity(level);
                const tip = advice[gap.skill];
                return (
                  <div
                    key={gap.skill}
                    className="bg-card p-6"
                    data-testid={`gap-${gap.skill.replace(/[^a-z]/gi, "-").toLowerCase()}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{gap.skill}</p>
                      <span
                        className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${tone.chip}`}
                        data-testid={`gap-priority-${gap.skill.replace(/[^a-z]/gi, "-").toLowerCase()}`}
                      >
                        {tone.priority}
                      </span>
                    </div>

                    <p className="mt-3 font-mono text-2xl font-bold">
                      {gap.current}
                      <span className="text-sm font-normal text-muted-foreground">/{gap.required}</span>
                    </p>

                    {/* 0-100 gap score, coloured by severity. The number is always
                        present so severity never depends on colour alone. */}
                    <div className="mt-3 h-1.5 w-full bg-muted">
                      <div className={`h-full ${tone.bar}`} style={{ width: `${level}%` }} />
                    </div>
                    <p className={`mt-2 font-mono text-[10px] uppercase tracking-widest ${tone.text}`}>
                      {level > 0 ? `gap ${level}% · ${tone.label}` : "requirement met"}
                    </p>

                    {tip ? (
                      <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                        {tip}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="border border-dashed border-border bg-card p-12 text-center" data-testid="no-analysis-state">
          <p className="text-sm text-muted-foreground">
            Complete at least one assessment, then run the analysis to see your skill gaps.
          </p>
        </div>
      )}
    </div>
  );
};

export default SkillGapTab;
