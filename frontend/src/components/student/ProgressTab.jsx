import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Award, CheckCircle2, Circle, CircleDot, Flame, Loader2, Lock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReadinessBadge from "@/components/ReadinessBadge";
import { api, formatApiError } from "@/lib/api";
import { PROGRESS_LABELS, severity } from "@/lib/readiness";

const STATUS_ICON = { pending: Circle, in_progress: CircleDot, completed: CheckCircle2 };
// Clicking a row advances it; a completed task cycles back to pending.
const NEXT_STATUS = { pending: "in_progress", in_progress: "completed", completed: "pending" };

export const ProgressTab = ({ report, readiness }) => {
  const [progress, setProgress] = useState(null);
  const [game, setGame] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, r, g] = await Promise.all([
        api.get("/student/progress"),
        api.get("/student/reports"),
        api.get("/student/gamification"),
      ]);
      setProgress(p.data);
      setGame(g.data);
      // /reports is newest-first; the chart reads oldest-first.
      setHistory(
        [...r.data].reverse().map((item, index) => ({
          attempt: index + 1,
          score: item.overall_score,
          role: item.target_role,
          date: new Date(item.created_at).toLocaleDateString(),
        }))
      );
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const advance = async (item) => {
    const next = NEXT_STATUS[item.status] || "in_progress";
    setBusy(item.skill);
    try {
      await api.put(`/student/progress/${encodeURIComponent(item.skill)}`, { status: next });
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center border border-border bg-card p-12" data-testid="progress-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const first = history[0]?.score;
  const latest = history[history.length - 1]?.score;
  const delta = first !== undefined && latest !== undefined ? latest - first : 0;
  const items = progress?.items || [];

  const score = latest ?? report?.overall_score ?? 0;
  const RING = 2 * Math.PI * 52; // r=52

  return (
    <div className="space-y-6" data-testid="student-progress-tab">
      {game ? (
        <section
          className="grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-[auto_1fr]"
          data-testid="gamification-panel"
        >
          <div className="flex items-center gap-8 bg-[#0A0A0A] p-8 text-white">
            {/* Animated score ring — stroke-dashoffset transitions on mount/update. */}
            <div className="relative h-32 w-32 shrink-0">
              <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="52" fill="none" stroke="#C0FF00" strokeWidth="8" strokeLinecap="butt"
                  strokeDasharray={RING}
                  strokeDashoffset={RING - (RING * Math.min(Math.max(score, 0), 100)) / 100}
                  style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-3xl font-bold leading-none" data-testid="score-ring-value">{score}</span>
                <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-white/40">/ 100</span>
              </div>
            </div>

            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-volt">Level</p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight" data-testid="game-level">
                {game.level}
              </p>
              <p className="mt-3 font-mono text-xs text-white/50">
                {game.xp.toLocaleString()} XP
                {game.next_level ? ` · ${game.next_level_xp.toLocaleString()} for ${game.next_level}` : " · max level"}
              </p>
              <div className="mt-3 h-1.5 w-44 bg-white/10">
                <div
                  className="h-full bg-volt transition-[width] duration-700"
                  style={{ width: `${game.level_progress}%` }}
                />
              </div>
              <p className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/60"
                data-testid="game-streak">
                <Flame className={`h-3.5 w-3.5 ${game.streak_days > 0 ? "text-volt" : "text-white/30"}`} />
                {game.streak_days > 0 ? `${game.streak_days}-day streak` : "No active streak"}
                <span className="text-white/30">· {game.active_days} active days</span>
              </p>
            </div>
          </div>

          <div className="bg-card p-8">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Achievements</p>
              <p className="font-mono text-xs font-bold" data-testid="badges-earned">
                {game.badges_earned}/{game.badges.length}
              </p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="badge-gallery">
              {game.badges.map((badge) => (
                <div
                  key={badge.id}
                  title={badge.description}
                  className={`flex items-start gap-2.5 border p-3 transition-colors duration-200 ${
                    badge.earned ? "border-volt bg-volt/10" : "border-dashed border-border opacity-55"
                  }`}
                  data-testid={`badge-${badge.id}`}
                >
                  {badge.earned ? (
                    <Award className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                  ) : (
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight">{badge.name}</span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                      {badge.description}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-[#0A0A0A] p-8 text-white">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-volt">Readiness score</p>
          <p className="mt-4 font-mono text-5xl font-bold leading-none" data-testid="progress-score">
            {latest ?? report?.overall_score ?? "--"}
          </p>
          <p className="mt-2 font-mono text-xs text-white/50">/ 100</p>
        </div>
        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Status</p>
          <div className="mt-4">
            <ReadinessBadge value={readiness} testId="progress-readiness-badge" />
          </div>
        </div>
        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Change</p>
          <p
            className={`mt-4 flex items-baseline gap-1.5 font-mono text-3xl font-bold ${
              delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : ""
            }`}
            data-testid="progress-delta"
          >
            {delta > 0 ? "+" : ""}
            {delta}
            {delta > 0 ? <TrendingUp className="h-4 w-4" /> : null}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Across {history.length} analys{history.length === 1 ? "is" : "es"}
          </p>
        </div>
        <div className="bg-card p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Tasks done</p>
          <p className="mt-4 font-mono text-3xl font-bold" data-testid="progress-tasks">
            {progress?.completed ?? 0}
            <span className="text-sm font-normal text-muted-foreground">/{progress?.total ?? 0}</span>
          </p>
          <div className="mt-4 h-1.5 w-full bg-muted">
            <div
              className="h-full bg-volt transition-[width] duration-500"
              style={{ width: `${progress?.percent_complete ?? 0}%` }}
            />
          </div>
        </div>
      </section>

      <section className="border border-border bg-card p-8">
        <h3 className="font-display text-xl font-semibold tracking-tight">Score history</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Every skill-gap analysis is recorded, so you can see whether preparation is moving the number.
        </p>
        {history.length < 2 ? (
          <p className="mt-8 border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
            data-testid="history-empty">
            Run at least two analyses to see a trend. You have {history.length}.
          </p>
        ) : (
          <div className="mt-8 h-72" data-testid="progress-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="attempt" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <Tooltip
                  contentStyle={{ borderRadius: 2, fontFamily: "IBM Plex Sans", fontSize: 12 }}
                  labelFormatter={(value) => `Analysis ${value}`}
                  formatter={(value, _n, entry) => [`${value}/100`, entry?.payload?.role || "Score"]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#0A0A0A"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#C0FF00", stroke: "#0A0A0A", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">Skill tasks</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Click a row to advance it · pending → in progress → completed
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground" data-testid="progress-empty">
            No tracked skills yet. Run a skill-gap analysis to populate your task list.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const level = item.gap_level ?? 0;
              const tone = severity(level);
              const Icon = STATUS_ICON[item.status] || Circle;
              return (
                <li key={item.id || item.skill} data-testid={`progress-row-${item.skill.replace(/\W+/g, "-")}`}>
                  <Button
                    variant="ghost"
                    onClick={() => advance(item)}
                    disabled={busy === item.skill}
                    className="h-auto w-full justify-start rounded-none p-6 text-left hover:bg-muted/50"
                  >
                    <div className="flex w-full flex-wrap items-center gap-4">
                      {busy === item.skill ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Icon
                          className={`h-5 w-5 shrink-0 ${
                            item.status === "completed" ? "text-success" : "text-muted-foreground"
                          }`}
                          strokeWidth={1.75}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            item.status === "completed" ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {item.skill}
                        </p>
                        {item.recommendation ? (
                          <p className="mt-1 truncate text-xs font-normal text-muted-foreground">
                            {item.recommendation}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${tone.chip}`}
                      >
                        {tone.priority}
                      </span>
                      <div className="w-28 shrink-0">
                        <div className="h-1.5 w-full bg-muted">
                          <div className={`h-full ${tone.bar}`} style={{ width: `${level}%` }} />
                        </div>
                        <p className="mt-1.5 text-right font-mono text-[10px] text-muted-foreground">
                          gap {level}%
                        </p>
                      </div>
                      <span className="w-24 shrink-0 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {PROGRESS_LABELS[item.status] || item.status}
                      </span>
                    </div>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ProgressTab;
