import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, MailCheck, MailWarning, UserCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";

const FILTERS = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["ALL", "All"],
];

const STATUS_STYLE = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  approved: "border-success/40 bg-success/10 text-success",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

export const ApprovalsTab = ({ onChanged }) => {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/coordinator/pending-students", { params: { status } });
      setRows(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (student, nextStatus, why) => {
    setBusy(student.id);
    try {
      await api.put(`/coordinator/students/${student.id}/approval`, {
        status: nextStatus,
        reason: why || null,
      });
      toast.success(
        nextStatus === "approved" ? `${student.name} can now sign in` : `${student.name} was rejected`
      );
      setRejecting(null);
      setReason("");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6" data-testid="coordinator-approvals-tab">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">Student registrations</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Students cannot sign in until you approve them
            </p>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 w-[180px] rounded-sm" data-testid="approvals-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map(([value, label]) => (
                <SelectItem key={value} value={value} data-testid={`approvals-filter-${value}`}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table data-testid="approvals-table">
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="font-mono text-[10px] uppercase tracking-widest">Student</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-widest">Email verified</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-widest">Status</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-widest">Registered</TableHead>
                <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    {status === "pending"
                      ? "No registrations waiting for approval."
                      : `No ${status.toLowerCase()} registrations.`}
                  </TableCell>
                </TableRow>
              ) : null}

              {rows.map((row) => (
                <TableRow key={row.id} className="border-border" data-testid={`approval-row-${row.id}`}>
                  <TableCell>
                    <p className="font-medium">{row.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{row.email}</p>
                  </TableCell>
                  <TableCell>
                    {row.is_verified ? (
                      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-success">
                        <MailCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <MailWarning className="h-3.5 w-3.5" /> Not yet
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
                        STATUS_STYLE[row.approval_status] || ""
                      }`}
                      data-testid={`approval-status-${row.id}`}
                    >
                      {row.approval_status}
                    </span>
                    {row.rejection_reason ? (
                      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{row.rejection_reason}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {rejecting === row.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          autoFocus
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className="h-8 w-44 rounded-sm text-xs"
                          data-testid="reject-reason-input"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
                          disabled={busy === row.id}
                          onClick={() => decide(row, "rejected", reason)}
                          data-testid={`confirm-reject-${row.id}`}
                        >
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {row.approval_status !== "approved" ? (
                          <Button
                            size="sm"
                            disabled={busy === row.id}
                            onClick={() => decide(row, "approved")}
                            className="rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
                            data-testid={`approve-${row.id}`}
                          >
                            {busy === row.id ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                            )}
                            Approve
                          </Button>
                        ) : null}
                        {row.approval_status !== "rejected" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === row.id}
                            onClick={() => setRejecting(row.id)}
                            className="rounded-full"
                            data-testid={`reject-${row.id}`}
                          >
                            <XCircle className="mr-2 h-3.5 w-3.5" /> Reject
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="border border-border bg-card p-6">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <UserCheck className="h-3.5 w-3.5" /> How approval works
        </p>
        <ul className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <li className="border-l-2 border-volt pl-4">
            <Clock className="mb-1 h-3.5 w-3.5" />
            New students land in <span className="font-medium text-foreground">pending</span> and cannot sign in.
          </li>
          <li className="border-l-2 border-volt pl-4">
            You only see students in your own institution and department.
          </li>
          <li className="border-l-2 border-volt pl-4">
            Every decision is written to the audit log with your name and a timestamp.
          </li>
        </ul>
      </section>
    </div>
  );
};

export default ApprovalsTab;
