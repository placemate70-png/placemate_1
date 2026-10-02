import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email: email.trim() });
      setResult(data);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      label="Password recovery"
      title="Reset your password"
      subtitle="Enter your account email. For privacy we never reveal whether an account exists."
      footer={
        <div className="flex flex-wrap gap-4">
          <Link to="/student/login" className="text-muted-foreground hover:text-foreground">Student sign in</Link>
          <Link to="/coordinator/login" className="text-muted-foreground hover:text-foreground">Coordinator sign in</Link>
          <Link to="/admin/login" className="text-muted-foreground hover:text-foreground">Admin sign in</Link>
        </div>
      }
    >
      {result ? (
        <div className="space-y-6" data-testid="forgot-password-result">
          <div className="flex gap-3 border border-border bg-muted p-4 text-sm">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{result.message}</p>
          </div>
          {result.reset_token ? (
            <Link
              to={`/reset-password?token=${result.reset_token}`}
              data-testid="mock-reset-link"
              className="block border border-dashed border-foreground/30 bg-volt/10 p-4 font-mono text-xs uppercase tracking-widest underline"
            >
              MOCKED EMAIL → open reset link (expires in 60 min, single use)
            </Link>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" data-testid="forgot-password-form">
          <div>
            <Label className="font-mono text-[11px] uppercase tracking-widest">Account email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-11 rounded-sm" data-testid="forgot-password-email" />
            {error ? (
              <p className="mt-1.5 text-xs text-destructive" data-testid="forgot-password-error">{error}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={loading}
            className="h-11 w-full rounded-full bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]"
            data-testid="forgot-password-submit">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
