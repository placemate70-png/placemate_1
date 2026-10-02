import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";

const ROLES = ["ALL", "student", "coordinator", "admin"];

export const UsersTab = ({ onChanged }) => {
  const [rows, setRows] = useState([]);
  const [role, setRole] = useState("coordinator");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const params = { role };
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/admin/users", { params });
      setRows(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [role, search]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDisabled = async (row) => {
    try {
      await api.put(`/admin/users/${row.id}/disable`, { is_disabled: !row.is_disabled });
      toast.success(row.is_disabled ? "Account re-enabled" : "Account disabled — sessions revoked");
      await load();
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const verify = async (row) => {
    try {
      await api.put(`/admin/users/${row.id}/verify`);
      toast.success("Account manually verified");
      await load();
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <section className="border border-border bg-card" data-testid="admin-users-tab">
      <div className="flex flex-wrap items-end gap-4 border-b border-border p-6">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email"
            className="h-10 rounded-sm pl-9" data-testid="users-search" />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-10 w-[170px] rounded-sm" data-testid="users-role-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} data-testid={`users-role-option-${r}`}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table data-testid="users-table">
        <TableHeader>
          <TableRow className="border-border">
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">User</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Role</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Institution</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Department</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">State</TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No users found.</TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.id} className="border-border" data-testid={`user-row-${row.id}`}>
              <TableCell>
                <p className="font-medium">{row.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{row.email}</p>
              </TableCell>
              <TableCell className="font-mono text-[10px] uppercase tracking-widest">{row.role}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{row.institution_name || "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{row.department || "—"}</TableCell>
              <TableCell className="space-x-2 font-mono text-[10px] font-bold uppercase tracking-widest">
                <span className={row.is_verified ? "text-success" : "text-amber-600"}>
                  {row.is_verified ? "verified" : "unverified"}
                </span>
                {row.is_disabled ? <span className="text-destructive">disabled</span> : null}
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {!row.is_verified ? (
                  <Button variant="ghost" size="sm" onClick={() => verify(row)} data-testid={`verify-user-${row.id}`}>
                    Verify
                  </Button>
                ) : null}
                {row.role !== "admin" ? (
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => toggleDisabled(row)}
                    data-testid={`toggle-disable-${row.id}`}>
                    {row.is_disabled ? "Enable" : "Disable"}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
};

export default UsersTab;
