import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { api, formatApiError } from "@/lib/api";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState({ status: "loading", message: "", role: null });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Verification token missing from the link." });
      return;
    }
    api
      .post("/auth/verify-email", { token })
      .then(({ data }) => setState({ status: "ok", message: data.message, role: data.role }))
      .catch((err) => setState({ status: "error", message: formatApiError(err) }));
  }, [token]);

  return (
    <AuthShell
      label="Email verification"
      title={state.status === "ok" ? "Account activated" : "Verifying your email"}
      subtitle={state.message}
    >
      <div data-testid={`verify-${state.status}`}>
        {state.status === "loading" ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : null}
        {state.status === "ok" ? (
          <div className="space-y-6">
            <div className="flex gap-3 border border-border bg-muted p-4 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <p>Your email is verified. You can now sign in to your dashboard.</p>
            </div>
            <Link
              to={`/${state.role || "student"}/login`}
              data-testid="verify-goto-login"
              className="inline-flex rounded-full bg-[#0A0A0A] px-6 py-3 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-0.5"
            >
              Continue to sign in
            </Link>
          </div>
        ) : null}
        {state.status === "error" ? (
          <div className="space-y-6">
            <div className="flex gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{state.message}</p>
            </div>
            <Link to="/student/login" className="underline decoration-volt decoration-2 underline-offset-4"
              data-testid="verify-error-login-link">
              Back to sign in — request a new link there
            </Link>
          </div>
        ) : null}
      </div>
    </AuthShell>
  );
}
