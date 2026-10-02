import { Link } from "react-router-dom";
import { ArrowLeft, Hexagon } from "lucide-react";

// Tailwind's rounded-sm/md/lg are all derived from --radius, so raising it here
// curves every control on every auth page (login, signup, forgot/reset, verify)
// in one place — no edits to the shared shadcn primitives, and the dashboards
// keep the global 0.25rem.
export const AuthShell = ({ label, title, subtitle, children, footer }) => (
  <div
    style={{ "--radius": "0.875rem" }}
    className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12"
  >
    <div className="w-full max-w-md rise">
      <div className="mb-10 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="auth-home-link">
          <Hexagon className="h-5 w-5 text-volt" strokeWidth={2.5} />
          <span className="font-display text-lg font-semibold tracking-tight">PlaceMate</span>
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors duration-200 hover:text-foreground"
          data-testid="back-to-entry-points"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All entry points
        </Link>
      </div>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <h1 className="font-display text-4xl font-semibold tracking-tighter sm:text-5xl">{title}</h1>
      {subtitle ? <p className="mt-4 text-sm text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-10">{children}</div>
      {footer ? <div className="mt-8 border-t border-border pt-6 text-sm">{footer}</div> : null}
    </div>
  </div>
);

export default AuthShell;
