import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, FileText, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ReadinessBadge from "@/components/ReadinessBadge";
import { api, fileUrl, formatApiError } from "@/lib/api";

const LABELS = ["READY", "ALMOST_READY", "DEVELOPING", "NOT_READY"];

export const StudentDrawer = ({ studentId, jobs, onClose, onChanged }) => {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [readiness, setReadiness] = useState("");
  const [note, setNote] = useState("");
  const [jobId, setJobId] = useState("");
  const [recNote, setRecNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setDetail(null);
    setError("");
    api
      .get(`/coordinator/students/${studentId}`)
      .then(({ data }) => {
        setDetail(data);
        setReadiness(data.profile.readiness_override || data.report?.readiness || "");
        setNote(data.profile.coordinator_note || "");
      })
      .catch((err) => setError(formatApiError(err)));
  }, [studentId]);

  const openResume = async () => {
    try {
      const { data } = await api.get(`/coordinator/students/${studentId}/resume-link`);
      window.open(fileUrl(data.download_token), "_blank", "noopener");
      toast.success("Resume view recorded in the audit log");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const saveReadiness = async () => {
    setBusy(true);
    try {
      await api.put(`/coordinator/students/${studentId}/readiness`, { readiness, note });
      toast.success("Readiness updated");
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const recommend = async () => {
    if (!jobId) return toast.error("Select an opening first");
    setBusy(true);
    try {
      await api.post(`/coordinator/students/${studentId}/recommend`, { job_id: jobId, note: recNote });
      toast.success("Student recommended");
      setRecNote("");
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(studentId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" data-testid="student-review-panel">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl tracking-tight">
            {detail?.name || "Student record"}
          </SheetTitle>
        </SheetHeader>

        {error ? (
          <div className="mt-8 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            data-testid="student-detail-error">
            {error}
          </div>
        ) : null}

        {!detail && !error ? <Loader2 className="mt-8 h-5 w-5 animate-spin text-muted-foreground" /> : null}

        {detail ? (
          <div className="mt-8 space-y-8">
            <div className="grid grid-cols-2 gap-px border border-border bg-border">
              {[
                ["Score", detail.report?.overall_score ?? "--"],
                ["CGPA", detail.profile.cgpa ?? "--"],
                ["Projects", detail.profile.projects_count],
                ["Internships", detail.profile.internships_count],
              ].map(([label, value]) => (
                <div key={label} className="bg-card p-5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
                  <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Contact & target</p>
              <p className="mt-3 text-sm">{detail.email}</p>
              <p className="text-sm text-muted-foreground">{detail.phone || "—"}</p>
              <p className="mt-2 text-sm">
                {detail.profile.roll_number || "—"} · {detail.profile.degree || "—"} · Target:{" "}
                {detail.profile.target_role || "not set"}
              </p>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Resume review</p>
              {detail.profile.resume_file_id ? (
                <Button variant="outline" onClick={openResume} className="mt-3 rounded-full"
                  data-testid="open-resume-button">
                  <Eye className="mr-2 h-4 w-4" /> Open {detail.profile.resume_filename}
                </Button>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" /> No resume uploaded
                </p>
              )}
            </div>

            {detail.report ? (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Top gaps · {detail.report.target_role}
                </p>
                <ul className="mt-3 space-y-2">
                  {detail.report.gaps.slice(0, 5).map((gap) => (
                    <li key={gap.skill} className="flex items-baseline justify-between border-b border-border pb-2 text-sm">
                      <span>{gap.skill}</span>
                      <span className="font-mono text-xs font-bold">
                        {gap.current}/{gap.required}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{detail.report.summary}</p>
              </div>
            ) : null}

            <div className="border border-border bg-muted/40 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mark readiness</p>
              <div className="mt-4 flex items-center gap-3">
                <Select value={readiness} onValueChange={setReadiness}>
                  <SelectTrigger className="h-10 rounded-sm" data-testid="readiness-select">
                    <SelectValue placeholder="Select label" />
                  </SelectTrigger>
                  <SelectContent>
                    {LABELS.map((label) => (
                      <SelectItem key={label} value={label} data-testid={`readiness-option-${label}`}>
                        {label.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ReadinessBadge value={readiness} testId="drawer-readiness-badge" />
              </div>
              <Label className="mt-4 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Note
              </Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-2 rounded-sm"
                data-testid="readiness-note" />
              <Button onClick={saveReadiness} disabled={busy || !readiness}
                className="mt-4 rounded-full bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]"
                data-testid="save-readiness-button">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save readiness
              </Button>
            </div>

            <div className="border border-border bg-muted/40 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Recommend for an opening
              </p>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger className="mt-4 h-10 rounded-sm" data-testid="recommend-job-select">
                  <SelectValue placeholder="Select opening" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id} data-testid={`recommend-job-option-${job.id}`}>
                      {job.title} — {job.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={recNote} onChange={(e) => setRecNote(e.target.value)} rows={2} placeholder="Why this student?"
                className="mt-3 rounded-sm" data-testid="recommend-note" />
              <Button onClick={recommend} disabled={busy} variant="outline" className="mt-4 rounded-full"
                data-testid="recommend-button">
                <Star className="mr-2 h-4 w-4" /> Recommend student
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

export default StudentDrawer;
