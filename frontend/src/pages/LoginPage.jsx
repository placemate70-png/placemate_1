import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";

const COPY = {
  student: {
    label: "Student portal",
    title: "Sign in to your profile",
    subtitle: "Use the registered email address issued by your institution.",
    signup: "/student/signup",
  },
  coordinator: {
    label: "Placement coordinator portal",
    title: "Coordinator sign in",
    subtitle: "Use your official college email. Access is limited to your institution and department.",
    signup: "/coordinator/signup",
  },
  admin: {
    label: "Administrator portal",
    title: "Administrator sign in",
    subtitle: "Restricted access. Administrator accounts are provisioned, not self-registered.",
    signup: null,
  },
};

export default function LoginPage({ role }) {
  const copy = COPY[role];
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [mockToken, setMockToken] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && user.role === role) return <Navigate to={`/${role}/dashboard`} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNeedsVerification(false);
    setMockToken("");
    if (!form.email.trim() || !form.password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const account = await login(role, form.email.trim(), form.password);
      toast.success(`Welcome back, ${account.name}`);
      navigate(`/${role}/dashboard`);
    } catch (err) {
      const message = formatApiError(err);
      setError(message);
      if (/not verified/i.test(message)) setNeedsVerification(true);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const { data } = await api.post("/auth/resend-verification", { email: form.email.trim() });
      toast.success(data.message);
      if (data.verification_token) setMockToken(data.verification_token);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <AuthShell label={copy.label} title={copy.title} subtitle={copy.subtitle}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {copy.signup ? (
            <Link to={copy.signup} className="font-medium underline decoration-volt decoration-2 underline-offset-4"
              data-testid={`${role}-signup-link`}>
              Create a {role} account
            </Link>
          ) : (
            <span className="text-muted-foreground">Contact the platform owner for access.</span>
          )}
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground"
            data-testid={`${role}-forgot-password-link`}>
            Forgot password?
          </Link>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-5" data-testid={`${role}-login-form`}>
        <div>
          <Label htmlFor="email" className="font-mono text-[11px] uppercase tracking-widest">
            Official / registered email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@institution.edu"
            className="mt-2 h-11 rounded-sm"
            data-testid={`${role}-login-email`}
          />
        </div>
        <div>
          <Label htmlFor="password" className="font-mono text-[11px] uppercase tracking-widest">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="mt-2 h-11 rounded-sm"
            data-testid={`${role}-login-password`}
          />
        </div>

        {error ? (
          <div role="alert" className="flex gap-2 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            data-testid={`${role}-login-error`}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {needsVerification ? (
          <div className="border border-border bg-muted p-4 text-sm" data-testid="verification-needed-panel">
            <p className="font-medium">Your account is not activated yet.</p>
            <p className="mt-1 text-muted-foreground">
              Email verification is required before any dashboard access.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={resend} className="mt-3 rounded-full"
              data-testid="resend-verification-button">
              Resend verification link
            </Button>
            {mockToken ? (
              <Link to={`/verify-email?token=${mockToken}`} className="mt-3 block font-mono text-xs underline"
                data-testid="mock-verification-link">
                MOCKED EMAIL — open verification link
              </Link>
            ) : null}
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
          data-testid={`${role}-login-submit`}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign in as {role}
        </Button>
      </form>
    </AuthShell>
  );
}
