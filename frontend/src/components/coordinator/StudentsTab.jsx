import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EyeOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ReadinessBadge from "@/components/ReadinessBadge";
import StudentDrawer from "@/components/coordinator/StudentDrawer";
import { api, formatApiError } from "@/lib/api";

const FILTERS = ["ALL", "READY", "ALMOST_READY", "DEVELOPING", "NOT_READY", "NOT_STARTED"];

export const StudentsTab = ({ jobs, onChanged }) => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [readiness, setReadiness] = useState("ALL");
  const [minScore, setMinScore] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (readiness !== "ALL") params.readiness = readiness;
      if (minScore !== "") params.min_score = Number(minScore);
      const { data } = await api.get("/coordinator/students", { params });
      setRows(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [search, readiness, minScore]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="border border-border bg-card" data-testid="coordinator-students-tab">
      <div className="flex flex-wrap items-end gap-4 border-b border-border p-6">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or roll number"
            className="h-10 rounded-sm pl-9" data-testid="students-search" />
        </div>
        <Select value={readiness} onValueChange={setReadiness}>
          <SelectTrigger className="h-10 w-[190px] rounded-sm" data-testid="students-readiness-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f} value={f} data-testid={`filter-option-${f}`}>
                {f.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="Min score"
          className="h-10 w-[130px] rounded-sm" data-testid="students-min-score" />
      </div>

      <Table data-testid="students-table">
        <TableHeader>
          <TableRow className="border-border">
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Student</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Roll</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Target role</TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-widest">Readiness</TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">CGPA</TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Score</TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                No students match this filter within your department scope.
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.student_id} className="border-border" data-testid={`student-row-${row.student_id}`}>
              <TableCell className="font-medium">
                {row.name}
                <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {row.department}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs">{row.roll_number || <Hidden />}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{row.target_role || "—"}</TableCell>
              <TableCell>
                <ReadinessBadge value={row.readiness} testId={`readiness-${row.student_id}`} />
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{row.cgpa ?? <Hidden />}</TableCell>
              <TableCell className="text-right font-mono text-sm font-bold">{row.score ?? <Hidden />}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" className="rounded-full"
                  onClick={() => setSelected(row.student_id)}
                  data-testid={`review-student-${row.student_id}`}>
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <StudentDrawer
        studentId={selected}
        jobs={jobs}
        onClose={() => setSelected(null)}
        onChanged={() => {
          load();
          onChanged();
        }}
      />
    </section>
  );
};

const Hidden = () => (
  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
    <EyeOff className="h-3 w-3" /> hidden
  </span>
);

export default StudentsTab;
