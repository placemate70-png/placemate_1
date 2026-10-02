import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashShell from "@/components/DashShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProfileTab from "@/components/student/ProfileTab";
import ResumeTab from "@/components/student/ResumeTab";
import AssessmentsTab from "@/components/student/AssessmentsTab";
import SkillGapTab from "@/components/student/SkillGapTab";
import CareerTab from "@/components/student/CareerTab";
import RoadmapTab from "@/components/student/RoadmapTab";
import ProgressTab from "@/components/student/ProgressTab";
import JobsTab from "@/components/student/JobsTab";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";

// "profile" is deliberately absent: it is reached from the account dropdown in
// the header, not from the tab bar.
const TABS = [
  ["career", "Career"],
  ["resume", "Resume"],
  ["assessments", "Assessments"],
  ["skillgap", "Skill gap"],
  ["roadmap", "Roadmap"],
  ["progress", "Progress"],
  ["jobs", "Jobs"],
];

export default function StudentDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");
  // Controlled so the header's account menu can switch to the profile panel.
  const [tab, setTab] = useState("resume");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/student/profile");
      setState(data);
    } catch (err) {
      setError(formatApiError(err));
    }
  }, []);

  useEffect(() => {
    load();
    api.get("/student/meta").then(({ data }) => setRoles(data.roles)).catch(() => setRoles([]));
  }, [load]);

  if (error) {
    return (
      <DashShell>
        <p className="text-sm text-destructive" data-testid="student-dashboard-error">{error}</p>
      </DashShell>
    );
  }

  if (!state) {
    return (
      <DashShell>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </DashShell>
    );
  }

  const { profile, latest_report: report, effective_readiness: readiness } = state;

  return (
    <DashShell
      onProfile={() => setTab("profile")}
      scopeLabel={`Your record is visible to ${user.institution_name || "your institution"} · ${profile.department} coordinators — every access is audited`}
    >
      <div className="mb-10 rise">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Student workspace</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tighter sm:text-5xl">
          {user.name.split(" ")[0]}, here is your readiness
        </h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Profile is an account view reached from the header menu, not a tab —
            showing the tab bar there leaves every trigger unhighlighted. */}
        {tab === "profile" ? null : (
          <TabsList className="mb-8 h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
            {TABS.map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                data-testid={`student-tab-${value}`}
                className="rounded-none border-b-2 border-transparent px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="profile">
          {/* Reached from the header account menu, so no tab trigger is lit —
              this row names where you are and offers the way back. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Account</p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight">Your profile</h2>
            </div>
            <Button
              variant="outline"
              onClick={() => setTab("resume")}
              className="rounded-full transition-transform duration-200 hover:-translate-y-0.5"
              data-testid="profile-back-button"
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to dashboard
            </Button>
          </div>
          <ProfileTab profile={profile} roles={roles} user={user} onSaved={load} />
        </TabsContent>
        <TabsContent value="career">
          <CareerTab profile={profile} roles={roles} onTargetChanged={load} />
        </TabsContent>
        <TabsContent value="resume">
          <ResumeTab profile={profile} onSaved={load} onAnalyzed={load} />
        </TabsContent>
        <TabsContent value="assessments">
          <AssessmentsTab onGraded={load} />
        </TabsContent>
        <TabsContent value="skillgap">
          <SkillGapTab profile={profile} report={report} roles={roles} readiness={readiness} onAnalyzed={load} />
        </TabsContent>
        <TabsContent value="roadmap">
          <RoadmapTab profile={profile} roles={roles} onChanged={load} />
        </TabsContent>
        <TabsContent value="progress">
          {/* keyed on the report so the tab refetches after a new analysis */}
          <ProgressTab key={report?.id || "none"} report={report} readiness={readiness} />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsTab />
        </TabsContent>
      </Tabs>
    </DashShell>
  );
}
