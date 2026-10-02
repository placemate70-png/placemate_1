import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase, CheckCircle2, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";

export const JobsTab = () => {
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [busy, setBusy] = useState("");

  const load = async () => {
    try {
      const [j, a, r] = await Promise.all([
        api.get("/student/jobs"),
        api.get("/student/applications"),
        api.get("/student/recommendations"),
      ]);
      setJobs(j.data);
      setApplications(a.data);
      setRecommendations(r.data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const apply = async (jobId) => {
    setBusy(jobId);
    try {
      await api.post(`/student/jobs/${jobId}/apply`);
      toast.success("Application submitted");
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6" data-testid="student-jobs-tab">
      {recommendations.length ? (
        <section className="border border-border bg-volt/15 p-6" data-testid="student-recommendations">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
            <Star className="h-3.5 w-3.5" /> Coordinator recommendations
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {recommendations.map((rec) => (
              <li key={rec.id}>
                <span className="font-medium">{rec.job?.title || "Opening"}</span>
                {rec.job?.company ? <span className="text-muted-foreground"> · {rec.job.company}</span> : null}
                {rec.note ? <span className="text-muted-foreground"> — “{rec.note}”</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-2">
        {jobs.length === 0 ? (
          <div className="bg-card p-12 text-center lg:col-span-2" data-testid="no-jobs-state">
            <p className="text-sm text-muted-foreground">No openings published for your department yet.</p>
          </div>
        ) : null}
        {jobs.map((job) => (
          <article key={job.id} className="flex flex-col bg-card p-8" data-testid={`job-card-${job.id}`}>
            <div className="flex items-start justify-between gap-4">
              <Briefcase className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-mono text-xs font-bold">{job.ctc}</span>
            </div>
            <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">{job.title}</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {job.company} · {job.location}
            </p>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">{job.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {job.required_skills.map((skill) => (
                <span key={skill} className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
                  {skill}
                </span>
              ))}
            </div>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Min CGPA {job.min_cgpa} · Closes {job.deadline || "—"}
            </p>
            {job.has_applied ? (
              <p className="mt-6 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-success"
                data-testid={`job-applied-${job.id}`}>
                <CheckCircle2 className="h-4 w-4" /> Applied
              </p>
            ) : (
              <Button onClick={() => apply(job.id)} disabled={busy === job.id}
                className="mt-6 self-start rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
                data-testid={`job-apply-${job.id}`}>
                {busy === job.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply now
              </Button>
            )}
          </article>
        ))}
      </section>

      <section className="border border-border bg-card">
        <h3 className="border-b border-border p-6 font-display text-lg font-semibold tracking-tight">
          My applications
        </h3>
        <Table data-testid="applications-table">
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">Role</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">Company</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">Status</TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Applied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No applications yet
                </TableCell>
              </TableRow>
            ) : null}
            {applications.map((app) => (
              <TableRow key={app.id} className="border-border" data-testid={`application-row-${app.id}`}>
                <TableCell className="font-medium">{app.job?.title || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{app.job?.company || "—"}</TableCell>
                <TableCell className="font-mono text-xs uppercase tracking-widest">{app.status}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {new Date(app.applied_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
};

export default JobsTab;
