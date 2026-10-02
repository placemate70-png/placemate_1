import { useEffect, useState } from "react";
import {
  Award,
  Briefcase,
  ClipboardList,
  FileText,
  GraduationCap,
  Sparkles,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/api";

const INPUTS = [
  { icon: FileText, title: "Resume", copy: "Your resume analysis", tint: "bg-violet-100 text-violet-600" },
  { icon: GraduationCap, title: "Skills", copy: "Technical & soft skills", tint: "bg-sky-100 text-sky-600" },
  { icon: ClipboardList, title: "Assessments", copy: "Test scores & performance", tint: "bg-emerald-100 text-emerald-600" },
  { icon: Briefcase, title: "Projects", copy: "Academic & personal work", tint: "bg-amber-100 text-amber-600" },
  { icon: Award, title: "Achievements", copy: "Certifications & achievements", tint: "bg-fuchsia-100 text-fuchsia-600" },
];

/** Small SVG ring. `value`/`max` drive the arc; the number is always rendered too. */
const Ring = ({ value, max, stroke, label }) => {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#EFEFEF" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={r} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - circumference * pct}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-mono text-sm font-bold">{String(value).padStart(2, "0")}</span>
        <span className="mt-0.5 text-[7px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
    </div>
  );
};

const OutputCard = ({ icon: Icon, iconTint, title, copy, value, max, stroke, label }) => (
  <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-sm">
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconTint}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold leading-tight">{title}</span>
      <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{copy}</span>
    </span>
    <Ring value={value} max={max} stroke={stroke} label={label} />
  </div>
);

/**
 * Live figures come from /api/public/stats — real aggregates across analysed
 * students, never invented. Until they load (or if the API is unreachable) the
 * rings render at zero rather than showing a placeholder number that looks real.
 */
export const SkillEngineDiagram = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/public/stats")
      .then(({ data }) => alive && setStats(data))
      .catch(() => alive && setStats(null));
    return () => {
      alive = false;
    };
  }, []);

  const strong = stats?.strong_skills ?? 0;
  const gaps = stats?.skill_gaps ?? 0;
  const missing = stats?.missing_skills ?? 0;
  const readiness = stats?.readiness_score ?? 0;
  const tracked = stats?.tracked_skills || 12;

  return (
    <div className="rise" data-testid="skill-engine-diagram">
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* Inputs */}
        <div className="space-y-2.5">
          {INPUTS.map(({ icon: Icon, title, copy, tint }) => (
            <div
              key={title}
              className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                <Icon className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{copy}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Engine */}
        <div className="flex justify-center py-4 lg:py-0">
          <div className="relative flex h-40 w-40 flex-col items-center justify-center rounded-full border border-border bg-gradient-to-b from-white to-emerald-50/60 text-center shadow-sm">
            <Sparkles className="h-5 w-5 text-emerald-500" strokeWidth={2.2} />
            <p className="mt-2 font-display text-base font-semibold leading-tight">
              AI Skill
              <br />
              Engine
            </p>
            <p className="mt-1.5 px-6 text-[10px] leading-tight text-muted-foreground">
              Analyzing your profile for real roles
            </p>
          </div>
        </div>

        {/* Outputs — values are live */}
        <div className="space-y-2.5">
          <OutputCard
            icon={Sparkles} iconTint="bg-emerald-100 text-emerald-600"
            title="Strong Skills" copy="Skills you're good at"
            value={strong} max={tracked} stroke="#10B981" label="Skills"
          />
          <OutputCard
            icon={Award} iconTint="bg-amber-100 text-amber-600"
            title="Skill Gaps" copy="Skills to improve"
            value={gaps} max={tracked} stroke="#F59E0B" label="Skills"
          />
          <OutputCard
            icon={Trophy} iconTint="bg-rose-100 text-rose-600"
            title="Missing Skills" copy="Important skills you lack"
            value={missing} max={tracked} stroke="#EF4444" label="Skills"
          />
        </div>
      </div>

      {/* Readiness summary */}
      <div className="mx-auto mt-5 flex max-w-xl items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Trophy className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight">Placement Ready</span>
          <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
            Personalized roadmap to bridge the gap and get placed
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-2xl font-bold leading-none text-emerald-600"
            data-testid="engine-readiness">
            {readiness}%
          </span>
          <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">Readiness Score</span>
        </span>
      </div>

      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {stats?.students_analysed
          ? `Live averages across ${stats.students_analysed} analysed students`
          : "Live platform averages"}
      </p>
    </div>
  );
};

export default SkillEngineDiagram;
