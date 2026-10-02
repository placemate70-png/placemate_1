import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";

const ACTIONS = [
  "ALL",
  "login",
  "view_student_score",
  "view_resume",
  "readiness_change",
  "recommend_student",
  "job_create",
  "job_edit",
  "account_disable",
  "account_enable",
  "manual_verify",
  "institution_create",
  "institution_update",
  "resume_upload",
];

export const AuditTab = () => {
  const [rows, setRows] = useState([]);
  const [action, setAction] = useState("ALL");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/audit-logs", { params: { action, limit: 200 } });
      setRows(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [action]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="border border-border bg-card" data-testid="admin-audit-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">Audit trail</h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Score views · resume views · readiness changes · job edits
          </p>
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-10 w-[220px] rounded-sm" data-testid="audit-action-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a} data-testid={`audit-option-${a}`}>{a.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table data-testid="audit-table">
        <TableHeader>
          <TableRow className="border-border">
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">When</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Actor</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Action</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Target</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                No audit events for this filter.
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.id} className="border-border" data-testid={`audit-row-${row.id}`}>
              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </TableCell>
              <TableCell>
                <p className="font-mono text-xs">{row.actor_email}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{row.actor_role}</p>
              </TableCell>
              <TableCell className="font-mono text-[10px] font-bold uppercase tracking-widest">
                {row.action.replace(/_/g, " ")}
              </TableCell>
              <TableCell className="font-mono text-[10px] text-muted-foreground">
                {row.target_type ? `${row.target_type}:${(row.target_id || "").slice(0, 8)}` : "—"}
              </TableCell>
              <TableCell className="max-w-[280px] truncate font-mono text-[10px] text-muted-foreground">
                {Object.keys(row.meta || {}).length ? JSON.stringify(row.meta) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
};

export default AuditTab;
