import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";

export const AssessmentsTab = ({ onGraded }) => {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/student/assessments");
      setList(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = async (id) => {
    setResult(null);
    setAnswers({});
    try {
      const { data } = await api.get(`/student/assessments/${id}`);
      setActive(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const submit = async () => {
    if (Object.keys(answers).length < active.questions.length) {
      toast.error("Answer every question before submitting");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/student/assessments/${active.id}/submit`, { answers });
      setResult(data);
      toast.success(`Scored ${data.correct}/${data.total}`);
      await load();
      onGraded();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <section className="border border-border bg-card" data-testid="assessment-runner">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {active.question_count} questions · {active.duration_minutes} min
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">{active.title}</h3>
          </div>
          <Button variant="outline" className="rounded-full" onClick={() => setActive(null)}
            data-testid="assessment-close-button">
            Back to assessments
          </Button>
        </header>

        {result ? (
          <div className="p-8" data-testid="assessment-result">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <p className="font-mono text-3xl font-bold" data-testid="assessment-result-score">
                {result.correct}/{result.total}
              </p>
              <span className="font-mono text-sm text-muted-foreground">({result.percentage}%)</span>
            </div>
            <div className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(result.skill_scores).map(([skill, score]) => (
                <div key={skill} className="bg-card p-5">
                  <p className="text-sm font-medium">{skill}</p>
                  <p className="mt-2 font-mono text-xl font-bold">{score}/5</p>
                </div>
              ))}
            </div>

            {/* The backend re-runs the analysis on submit and returns the new score,
                so the improvement is shown here rather than making the student go
                and press "analyse" themselves. */}
            {result.refreshed_report ? (
              <div
                className="mt-8 flex flex-wrap items-center gap-6 border border-border bg-[#0A0A0A] p-6 text-white"
                data-testid="assessment-score-update"
              >
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-volt">Readiness updated</p>
                  <p className="mt-3 font-mono text-4xl font-bold leading-none">
                    {result.refreshed_report.overall_score}
                    <span className="text-base font-normal text-white/40">/100</span>
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Change</p>
                  <p
                    className={`mt-2 font-mono text-2xl font-bold ${
                      result.refreshed_report.delta > 0
                        ? "text-volt"
                        : result.refreshed_report.delta < 0
                          ? "text-red-400"
                          : "text-white/60"
                    }`}
                  >
                    {result.refreshed_report.delta > 0 ? "+" : ""}
                    {result.refreshed_report.delta}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Was</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-white/60">
                    {result.refreshed_report.previous_score}
                  </p>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                  {result.refreshed_report.readiness.replace(/_/g, " ")}
                </p>
              </div>
            ) : (
              <p className="mt-8 text-sm text-muted-foreground">
                Run the skill-gap analysis to convert these levels into a readiness score.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {active.questions.map((q, index) => (
              <div key={q.id} className="p-8" data-testid={`question-${q.id}`}>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-xs font-bold text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{q.skill}</p>
                    <p className="mt-2 text-base font-medium">{q.question}</p>
                    <RadioGroup
                      className="mt-5 space-y-3"
                      value={answers[q.id] !== undefined ? String(answers[q.id]) : ""}
                      onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: Number(v) }))}
                    >
                      {q.options.map((option, optionIndex) => (
                        <div key={option} className="flex items-center gap-3">
                          <RadioGroupItem value={String(optionIndex)} id={`${q.id}-${optionIndex}`}
                            data-testid={`option-${q.id}-${optionIndex}`} />
                          <Label htmlFor={`${q.id}-${optionIndex}`} className="text-sm font-normal">
                            {option}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
              </div>
            ))}
            <div className="p-8">
              <Button onClick={submit} disabled={busy}
                className="rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
                data-testid="assessment-submit-button">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit assessment
              </Button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2"
      data-testid="student-assessments-tab">
      {list.map((assessment) => (
        <article key={assessment.id} className="flex flex-col bg-card p-8" data-testid={`assessment-card-${assessment.id}`}>
          <div className="flex items-start justify-between gap-4">
            <ClipboardList className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            {assessment.attempt ? (
              <span className="font-mono text-xs font-bold" data-testid={`assessment-best-${assessment.id}`}>
                {assessment.attempt.correct}/{assessment.attempt.total}
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Not attempted</span>
            )}
          </div>
          <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">{assessment.title}</h3>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">{assessment.description}</p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {assessment.skills.join(" · ")}
          </p>
          <Button onClick={() => open(assessment.id)}
            className="mt-6 self-start rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
            data-testid={`assessment-start-${assessment.id}`}>
            {assessment.attempt ? "Retake" : "Start"} assessment
          </Button>
        </article>
      ))}
    </div>
  );
};

export default AssessmentsTab;
