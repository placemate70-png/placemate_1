import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Target,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";

const RESOURCE_ICON = { course: BookOpen, docs: FileText, practice: Terminal };

/** "3 weeks" -> 3. Durations drive the week numbering so the plan is a real calendar. */
function weeksIn(duration) {
  const match = String(duration || "").match(/(\d+)\s*week/i);
  return Math.max(1, match ? Number(match[1]) : 1);
}

/** Turn ordered steps into cumulative week ranges: 3w then 2w -> "Week 1-3", "Week 4-5". */
function withWeekRanges(steps) {
  let cursor = 1;
  return (steps || []).map((step) => {
    const span = weeksIn(step.duration);
    const start = cursor;
    const end = cursor + span - 1;
    cursor = end + 1;
    return { ...step, weekStart: start, weekEnd: end, weekLabel: start === end ? `Week ${start}` : `Week ${start}–${end}` };
  });
}

export const RoadmapTab = ({ profile, roles = [], onChanged }) => {
  const [roadmap, setRoadmap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [role, setRole] = useState(profile?.target_role || "");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/student/roadmap");
      setRoadmap(data || null);
      if (data?.target_role) setRole((current) => current || data.target_role);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post("/student/roadmap", { target_role: role || null });
      setRoadmap(data);
      toast.success(`Roadmap ready — ${data.steps.length} steps`);
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setGenerating(false);
    }
  };

  // Print-to-PDF: scoped by a body class so only #roadmap-print is visible in the
  // print view. Avoids pulling in a PDF library for a page the browser can already
  // render perfectly.
  const downloadPdf = () => {
    document.body.classList.add("printing-roadmap");
    const cleanup = () => {
      document.body.classList.remove("printing-roadmap");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 2000); // Safari/iOS never fire afterprint reliably
  };

  const steps = withWeekRanges(roadmap?.steps);
  const totalWeeks = steps.length ? steps[steps.length - 1].weekEnd : 0;

  return (
    <div className="space-y-6" data-testid="student-roadmap-tab">
      <section className="grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-[1.5fr_1fr]">
        <div className="bg-[#0A0A0A] p-8 text-white">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-volt">Preparation roadmap</p>
          <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight">
            {roadmap ? roadmap.target_role : "No roadmap yet"}
          </h3>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60" data-testid="roadmap-summary">
            {roadmap?.summary ||
              "Generate a step-by-step plan built from your assessed skill gaps, with a learning resource for every step."}
          </p>
          {roadmap ? (
            <div className="mt-6 flex flex-wrap items-center gap-6">
              <div>
                <p className="font-mono text-3xl font-bold leading-none">{steps.length}</p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-white/40">Steps</p>
              </div>
              <div>
                <p className="font-mono text-3xl font-bold leading-none">{totalWeeks}</p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-white/40">Weeks</p>
              </div>
              <div>
                <p className="font-mono text-xs text-white/50" data-testid="roadmap-provider">
                  Engine: {roadmap.provider}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Build a plan</p>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="mt-4 h-10 rounded-sm" data-testid="roadmap-role-select">
              <SelectValue placeholder="Target role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={generate}
            disabled={generating || !role}
            className="mt-4 w-full rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
            data-testid="generate-roadmap-button"
          >
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {roadmap ? "Regenerate roadmap" : "Generate roadmap"}
          </Button>
          {roadmap ? (
            <Button
              variant="outline"
              onClick={downloadPdf}
              className="mt-3 w-full rounded-full"
              data-testid="roadmap-download-button"
            >
              <Download className="mr-2 h-4 w-4" /> Download as PDF
            </Button>
          ) : null}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Steps come from your latest assessed gaps, so run an assessment first for the sharpest plan.
          </p>
        </div>
      </section>

      {generating ? <div className="h-px w-full beam" data-testid="roadmap-beam" /> : null}

      {loading ? (
        <div className="flex justify-center border border-border bg-card p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!loading && !roadmap ? (
        <div className="border border-dashed border-border bg-card p-12 text-center" data-testid="no-roadmap-state">
          <Target className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-4 text-sm text-muted-foreground">
            Pick a target role and generate your first roadmap.
          </p>
        </div>
      ) : null}

      {steps.length ? (
        <div id="roadmap-print" className="space-y-4">
          <div className="hidden print:mb-6 print:block">
            <h1 className="font-display text-2xl font-semibold">PlaceMate — {roadmap.target_role} roadmap</h1>
            <p className="mt-1 text-sm">{roadmap.summary}</p>
          </div>

          {steps.map((step) => (
            <article
              key={step.order}
              className="border border-border bg-card p-8"
              data-testid={`roadmap-step-${step.order}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#0A0A0A] font-mono text-sm font-bold text-volt">
                    {String(step.order).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {step.weekLabel} · {step.duration}
                    </p>
                    <h4 className="mt-1.5 font-display text-lg font-semibold tracking-tight">{step.skill}</h4>
                  </div>
                </div>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{step.action}</p>

              {step.resources?.length ? (
                <div className="mt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Learning resources
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {step.resources.map((resource) => {
                      const Icon = RESOURCE_ICON[resource.type] || FileText;
                      return (
                        <li key={resource.url}>
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-start gap-3 border border-border p-3 transition-colors duration-200 hover:border-foreground/40"
                            data-testid={`roadmap-resource-${step.order}`}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium leading-snug">{resource.title}</span>
                              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                {resource.type}
                              </span>
                            </span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 print:hidden" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default RoadmapTab;
