import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";

const EMPTY = {
  title: "",
  company: "",
  description: "",
  location: "",
  ctc: "",
  departments: "",
  required_skills: "",
  min_cgpa: 0,
  deadline: "",
  is_open: true,
};

export const JobsTab = ({ jobs, department, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [applications, setApplications] = useState({ jobId: null, rows: [] });

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setEditing(null);
    }
  }, [open]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const startEdit = (job) => {
    setEditing(job.id);
    setForm({
      title: job.title,
      company: job.company,
      description: job.description,
      location: job.location,
      ctc: job.ctc,
      departments: job.departments.join(", "),
      required_skills: job.required_skills.join(", "),
      min_cgpa: job.min_cgpa,
      deadline: job.deadline || "",
      is_open: job.is_open,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.company.trim()) {
      toast.error("Title and company are required");
      return;
    }
    setBusy(true);
    const payload = {
      ...form,
      min_cgpa: Number(form.min_cgpa) || 0,
      deadline: form.deadline || null,
      departments: form.departments.split(",").map((d) => d.trim()).filter(Boolean),
      required_skills: form.required_skills.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editing) await api.put(`/coordinator/jobs/${editing}`, payload);
      else await api.post("/coordinator/jobs", payload);
      toast.success(editing ? "Opening updated" : "Opening published");
      setOpen(false);
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const viewApplications = async (jobId) => {
    try {
      const { data } = await api.get(`/coordinator/jobs/${jobId}/applications`);
      setApplications({ jobId, rows: data });
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="space-y-6" data-testid="coordinator-jobs-tab">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">Published openings</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Scoped to your institution
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
                data-testid="publish-job-button">
                <Plus className="mr-2 h-4 w-4" /> Publish opening
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="job-dialog">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl tracking-tight">
                  {editing ? "Edit opening" : "Publish an opening"}
                </DialogTitle>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                {[
                  ["title", "Role title", "Backend Engineer"],
                  ["company", "Company", "Northwind Systems"],
                  ["location", "Location", "Bengaluru"],
                  ["ctc", "CTC / stipend", "INR 12 LPA"],
                ].map(([key, label, placeholder]) => (
                  <div key={key}>
                    <Label className="font-mono text-[10px] uppercase tracking-widest">{label}</Label>
                    <Input value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder}
                      className="mt-2 h-10 rounded-sm" data-testid={`job-${key}`} />
                  </div>
                ))}
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest">Description</Label>
                  <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3}
                    className="mt-2 rounded-sm" data-testid="job-description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="font-mono text-[10px] uppercase tracking-widest">Min CGPA</Label>
                    <Input type="number" step="0.1" value={form.min_cgpa} onChange={(e) => set("min_cgpa", e.target.value)}
                      className="mt-2 h-10 rounded-sm" data-testid="job-min-cgpa" />
                  </div>
                  <div>
                    <Label className="font-mono text-[10px] uppercase tracking-widest">Deadline</Label>
                    <Input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)}
                      className="mt-2 h-10 rounded-sm" data-testid="job-deadline" />
                  </div>
                </div>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest">
                    Departments (blank = {department})
                  </Label>
                  <Input value={form.departments} onChange={(e) => set("departments", e.target.value)}
                    placeholder={department} className="mt-2 h-10 rounded-sm" data-testid="job-departments" />
                </div>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest">Required skills (comma separated)</Label>
                  <Input value={form.required_skills} onChange={(e) => set("required_skills", e.target.value)}
                    placeholder="Data Structures, Databases" className="mt-2 h-10 rounded-sm" data-testid="job-skills" />
                </div>
                <div className="flex items-center justify-between border border-border p-4">
                  <Label className="font-mono text-[10px] uppercase tracking-widest">Open for applications</Label>
                  <Switch checked={form.is_open} onCheckedChange={(v) => set("is_open", Boolean(v))}
                    data-testid="job-is-open" />
                </div>
                <Button onClick={save} disabled={busy}
                  className="w-full rounded-full bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]" data-testid="job-save-button">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editing ? "Save changes" : "Publish opening"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Table data-testid="jobs-table">
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">Role</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">Company</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">Departments</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">Status</TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">CTC</TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Applicants</TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  No openings published yet.
                </TableCell>
              </TableRow>
            ) : null}
            {jobs.map((job) => (
              <TableRow key={job.id} className="border-border" data-testid={`job-row-${job.id}`}>
                <TableCell className="font-medium">{job.title}</TableCell>
                <TableCell className="text-muted-foreground">{job.company}</TableCell>
                <TableCell className="font-mono text-[10px] uppercase tracking-widest">
                  {job.departments.join(", ")}
                </TableCell>
                <TableCell>
                  <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${job.is_open ? "text-success" : "text-muted-foreground"}`}>
                    {job.is_open ? "Open" : "Closed"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{job.ctc}</TableCell>
                <TableCell className="text-right font-mono text-sm font-bold">{job.applications}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => viewApplications(job.id)}
                    data-testid={`job-applicants-${job.id}`}>
                    <Users className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => startEdit(job)}
                    data-testid={`job-edit-${job.id}`}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {applications.jobId ? (
        <section className="border border-border bg-card" data-testid="job-applications-panel">
          <h3 className="border-b border-border p-6 font-display text-lg font-semibold tracking-tight">
            Applicants from {department}
          </h3>
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="font-mono text-[10px] uppercase tracking-widest">Student</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-widest">Status</TableHead>
                <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Score</TableHead>
                <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No applicants from your department yet.
                  </TableCell>
                </TableRow>
              ) : null}
              {applications.rows.map((row) => (
                <TableRow key={row.application_id} className="border-border">
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="font-mono text-xs uppercase tracking-widest">{row.status}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{row.score ?? "--"}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {new Date(row.applied_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
};

export default JobsTab;
