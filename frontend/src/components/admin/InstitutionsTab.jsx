import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";

const EMPTY = { name: "", code: "", domains: "", is_active: true };

export const InstitutionsTab = ({ onChanged }) => {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/institutions");
      setRows(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setEditing(null);
    }
  }, [open]);

  const save = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.domains.trim()) {
      toast.error("Name, code and at least one domain are required");
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      domains: form.domains.split(",").map((d) => d.trim().replace(/^@/, "")).filter(Boolean),
      is_active: form.is_active,
    };
    try {
      if (editing) await api.put(`/admin/institutions/${editing}`, payload);
      else await api.post("/admin/institutions", payload);
      toast.success(editing ? "Institution updated" : "Institution approved");
      setOpen(false);
      await load();
      onChanged();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row) => {
    setEditing(row.id);
    setForm({ name: row.name, code: row.code, domains: row.domains.join(", "), is_active: row.is_active });
    setOpen(true);
  };

  return (
    <section className="border border-border bg-card" data-testid="admin-institutions-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">Approved institutions</h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Signup requires a matching verified domain
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
              data-testid="add-institution-button">
              <Plus className="mr-2 h-4 w-4" /> Add institution
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="institution-dialog">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl tracking-tight">
                {editing ? "Edit institution" : "Approve an institution"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest">Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-2 h-10 rounded-sm" data-testid="institution-name" />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest">Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="mt-2 h-10 rounded-sm" data-testid="institution-code" />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest">Verified domains (comma separated)</Label>
                <Input value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })}
                  placeholder="nit.edu, alumni.nit.edu" className="mt-2 h-10 rounded-sm" data-testid="institution-domains" />
              </div>
              <div className="flex items-center justify-between border border-border p-4">
                <Label className="font-mono text-[10px] uppercase tracking-widest">Active for new signups</Label>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: Boolean(v) })}
                  data-testid="institution-active" />
              </div>
              <Button onClick={save} disabled={busy} className="w-full rounded-full bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]"
                data-testid="institution-save-button">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save institution
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table data-testid="institutions-table">
        <TableHeader>
          <TableRow className="border-border">
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Institution</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Code</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Verified domains</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Status</TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Coordinators</TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Students</TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="border-border" data-testid={`institution-row-${row.code}`}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="font-mono text-xs">{row.code}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">@{row.domains.join(", @")}</TableCell>
              <TableCell>
                <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${row.is_active ? "text-success" : "text-destructive"}`}>
                  {row.is_active ? "Active" : "Inactive"}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{row.coordinators}</TableCell>
              <TableCell className="text-right font-mono text-sm">{row.students}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => startEdit(row)}
                  data-testid={`institution-edit-${row.code}`}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
};

export default InstitutionsTab;
