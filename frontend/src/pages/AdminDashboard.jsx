import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import DashShell from "@/components/DashShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InstitutionsTab from "@/components/admin/InstitutionsTab";
import UsersTab from "@/components/admin/UsersTab";
import AuditTab from "@/components/admin/AuditTab";
import { api, formatApiError } from "@/lib/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/stats");
      setStats(data);
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
        <p className="text-sm text-destructive" data-testid="admin-dashboard-error">{error}</p>
      </DashShell>
    );
  }

  if (!stats) {
    return (
      <DashShell>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </DashShell>
    );
  }

  const cards = [
    ["Institutions", stats.institutions],
    ["Students", stats.students],
    ["Coordinators", stats.coordinators],
    ["Unverified", stats.unverified],
    ["Disabled", stats.disabled],
    ["Audit events", stats.audit_events],
  ];

  return (
    <DashShell scopeLabel="Access scope · Platform-wide administration · every action you take is audited">
      <div className="mb-10 rise">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Administration</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tighter sm:text-5xl">
          Ecosystem controls
        </h1>
      </div>

      <section className="mb-10 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3 lg:grid-cols-6"
        data-testid="admin-stat-cards">
        {cards.map(([label, value]) => (
          <div key={label} className="bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-3 font-mono text-3xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <Tabs defaultValue="institutions">
        <TabsList className="mb-8 h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
          {[
            ["institutions", "Institutions"],
            ["users", "Users"],
            ["audit", "Audit log"],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} data-testid={`admin-tab-${value}`}
              className="rounded-none border-b-2 border-transparent px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="institutions">
          <InstitutionsTab onChanged={load} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab onChanged={load} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </DashShell>
  );
}
