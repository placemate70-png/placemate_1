import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.password.length < 8) return setError("Use at least 8 characters");
    if (form.password !== form.confirm) return setError("Passwords do not match");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", { token, new_password: form.password });
      setDone(true);
      toast.success(data.message);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      label="Password recovery"
      title={done ? "Password updated" : "Choose a new password"}
      subtitle={done ? "Your reset link has now been consumed and cannot be reused." : "This link is single-use and expires 60 minutes after it was issued."}
    >
      {done ? (
        <div className="flex flex-wrap gap-4 text-sm" data-testid="reset-success">
          <Link to="/student/login" className="underline decoration-volt decoration-2 underline-offset-4">Student sign in</Link>
          <Link to="/coordinator/login" className="underline decoration-volt decoration-2 underline-offset-4">Coordinator sign in</Link>
          <Link to="/admin/login" className="underline decoration-volt decoration-2 underline-offset-4">Admin sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" data-testid="reset-password-form">
          {!token ? (
            <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" data-testid="reset-missing-token">
              This reset link is missing its token. Request a new link.
            </div>
          ) : null}
          <div>
            <Label className="font-mono text-[11px] uppercase tracking-widest">New password</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-2 h-11 rounded-sm" data-testid="reset-password-input" />
          </div>
          <div>
            <Label className="font-mono text-[11px] uppercase tracking-widest">Confirm new password</Label>
            <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className="mt-2 h-11 rounded-sm" data-testid="reset-password-confirm" />
          </div>
          {error ? (
            <div role="alert" className="flex gap-2 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              data-testid="reset-password-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
            </div>
          ) : null}
          <Button type="submit" disabled={loading || !token}
            className="h-11 w-full rounded-full bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]"
            data-testid="reset-password-submit">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
