import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import DashShell from "@/components/DashShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StudentsTab from "@/components/coordinator/StudentsTab";
import JobsTab from "@/components/coordinator/JobsTab";
import ApprovalsTab from "@/components/coordinator/ApprovalsTab";
import ReadinessBadge from "@/components/ReadinessBadge";
import { api, formatApiError } from "@/lib/api";

export default function CoordinatorDashboard() {
  const [scope, setScope] = useState(null);
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, o, j, p] = await Promise.all([
        api.get("/coordinator/scope"),
        api.get("/coordinator/overview"),
        api.get("/coordinator/jobs"),
        api.get("/coordinator/pending-students", { params: { status: "pending" } }),
      ]);
      setScope(s.data);
      setOverview(o.data);
      setJobs(j.data);
      setPendingCount(p.data.length);
    } catch (err) {
      setError(formatApiError(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <DashShell>
        <p className="text-sm text-destructive" data-testid="coordinator-dashboard-error">{error}</p>
      </DashShell>
    );
  }

  if (!scope || !overview) {
    return (
      <DashShell>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </DashShell>
    );
  }

  const cards = [
    ["Students in scope", overview.students],
    ["Avg readiness score", overview.average_score],
    ["Resumes uploaded", overview.resumes_uploaded],
    ["Open positions", overview.open_jobs],
    ["Applications", overview.applications],
    ["Resumes on file", scope.students_with_resume],
  ];

  return (
    <DashShell
      scopeLabel={`Access scope · ${scope.institution_name} · Department: ${scope.department} · ${scope.students_total} students · every access audited`}
    >
      <div className="mb-10 rise">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Placement coordinator console
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tighter sm:text-5xl">
          {scope.department} readiness
        </h1>
      </div>

      <section className="mb-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3 lg:grid-cols-6"
        data-testid="coordinator-score-cards">
        {cards.map(([label, value]) => (
          <div key={label} className="bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-3 font-mono text-3xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <section className="mb-10 flex flex-wrap items-center gap-3 border border-border bg-card p-6"
        data-testid="readiness-breakdown">
        <p className="mr-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Readiness distribution
        </p>
        {Object.entries(overview.readiness_breakdown).map(([label, count]) => (
          <div key={label} className="flex items-center gap-2">
            <ReadinessBadge value={label} testId={`breakdown-${label}`} />
            <span className="font-mono text-sm font-bold">{count}</span>
          </div>
        ))}
      </section>

      <Tabs defaultValue="students">
        <TabsList className="mb-8 h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
          {[
            ["students", "Students", 0],
            ["approvals", "Approvals", pendingCount],
            ["jobs", "Openings", 0],
          ].map(([value, label, badge]) => (
            <TabsTrigger key={value} value={value} data-testid={`coordinator-tab-${value}`}
              className="rounded-none border-b-2 border-transparent px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              {label}
              {badge > 0 ? (
                <span
                  className="ml-2 inline-flex h-4 min-w-4 items-center justify-center bg-volt px-1 font-mono text-[9px] font-bold text-[#0A0A0A]"
                  data-testid="pending-approvals-badge"
                >
                  {badge}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="students">
          <StudentsTab jobs={jobs} onChanged={load} />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsTab onChanged={load} />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsTab jobs={jobs} department={scope.department} onChanged={load} />
        </TabsContent>
      </Tabs>
    </DashShell>
  );
}
