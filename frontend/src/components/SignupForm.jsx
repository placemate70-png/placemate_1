import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";

const DEPARTMENTS = [
  "Computer Science",
  "Information Technology",
  "Electronics",
  "Electrical",
  "Mechanical",
  "Civil",
  "Business Administration",
];

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  institution_id: "",
  department: "",
  password: "",
  confirm_password: "",
  consent_accepted: false,
};

export const SignupForm = ({ role, label, title, subtitle, image, loginPath, consentText }) => {
  const [institutions, setInstitutions] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    api
      .get("/auth/institutions")
      .then(({ data }) => setInstitutions(data))
      .catch((err) => toast.error(formatApiError(err)));
  }, []);

  const selected = useMemo(
    () => institutions.find((i) => i.id === form.institution_id),
    [institutions, form.institution_id]
  );

  const domainOk = useMemo(() => {
    if (!selected || !form.email.includes("@")) return null;
    return selected.domains.includes(form.email.split("@")[1].toLowerCase());
  }, [selected, form.email]);

  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = "Enter your full name";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = "Enter a valid email address";
    if (form.phone.trim().length < 8) next.phone = "Enter a valid phone number";
    if (!form.institution_id) next.institution_id = "Select your institution from the approved list";
    if (!form.department) next.department = "Select your department";
    if (form.password.length < 8) next.password = "Use at least 8 characters";
    if (form.password !== form.confirm_password) next.confirm_password = "Passwords do not match";
    if (!form.consent_accepted) next.consent_accepted = "Consent is required to create an account";
    if (domainOk === false) next.email = `Use your ${selected.domains.join(" / ")} institutional address`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    setServerError("");
    if (!validate()) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/auth/register/${role}`, form);
      setCreated(data);
      toast.success("Account created. Verify your email to activate it.");
    } catch (err) {
      setServerError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <AuthShell label={label} title="Check your inbox" image={image}
        subtitle={`We sent a verification link to ${created.email}. Dashboards stay locked until the account is verified.`}>
        <div className="space-y-6" data-testid="signup-success-panel">
          <div className="flex gap-3 border border-border bg-muted p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div className="text-sm">
              <p className="font-medium">Verification pending</p>
              <p className="mt-1 text-muted-foreground">
                The link expires in 24 hours and can be used once.
              </p>
              {created.requires_coordinator_approval ? (
                <p className="mt-3 border-t border-border pt-3 text-muted-foreground"
                  data-testid="signup-approval-notice">
                  After verifying, your <span className="font-medium text-foreground">placement coordinator</span>{" "}
                  must approve your registration before you can sign in.
                </p>
              ) : null}
            </div>
          </div>
          {created.verification_token ? (
            <Link
              to={`/verify-email?token=${created.verification_token}`}
              data-testid="signup-mock-verify-link"
              className="block border border-dashed border-foreground/30 bg-volt/10 p-4 font-mono text-xs uppercase tracking-widest underline"
            >
              MOCKED EMAIL → open verification link
            </Link>
          ) : null}
          <Link to={loginPath} className="inline-block font-medium underline decoration-volt decoration-2 underline-offset-4"
            data-testid="signup-goto-login">
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  const fieldError = (key) =>
    errors[key] ? (
      <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive" data-testid={`error-${key}`}>
        <AlertCircle className="h-3 w-3" /> {errors[key]}
      </p>
    ) : null;

  return (
    <AuthShell label={label} title={title} subtitle={subtitle} image={image}
      footer={
        <Link to={loginPath} className="font-medium underline decoration-volt decoration-2 underline-offset-4"
          data-testid="signup-login-link">
          Already registered? Sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-5" data-testid={`${role}-signup-form`}>
        <div>
          <Label className="font-mono text-[11px] uppercase tracking-widest">Full name</Label>
          <Input value={form.name} onChange={(e) => set("name")(e.target.value)} className="mt-2 h-11 rounded-sm"
            data-testid="signup-name" />
          {fieldError("name")}
        </div>

        <div>
          <Label className="font-mono text-[11px] uppercase tracking-widest">
            {role === "coordinator" ? "Official college email" : "Registered institutional email"}
          </Label>
          <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)}
            placeholder="you@institution.edu" className="mt-2 h-11 rounded-sm" data-testid="signup-email" />
          {domainOk === true ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-success" data-testid="domain-match-ok">
              <CheckCircle2 className="h-3 w-3" /> Domain matches {selected.name}
            </p>
          ) : null}
          {fieldError("email")}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label className="font-mono text-[11px] uppercase tracking-widest">Phone number</Label>
            <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} className="mt-2 h-11 rounded-sm"
              data-testid="signup-phone" />
            {fieldError("phone")}
          </div>
          <div>
            <Label className="font-mono text-[11px] uppercase tracking-widest">Department</Label>
            <Select value={form.department} onValueChange={set("department")}>
              <SelectTrigger className="mt-2 h-11 rounded-sm" data-testid="signup-department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              {/* Radix portals the dropdown outside AuthShell, so it cannot inherit
                  the shell's --radius — matched to the trigger explicitly. */}
              <SelectContent className="rounded-xl">
                {DEPARTMENTS.map((d) => (
                  <SelectItem
                    key={d}
                    value={d}
                    className="rounded-[8px]"
                    data-testid={`department-option-${d.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("department")}
          </div>
        </div>

        <div>
          <Label className="font-mono text-[11px] uppercase tracking-widest">Institution (approved list)</Label>
          <Select value={form.institution_id} onValueChange={set("institution_id")}>
            <SelectTrigger className="mt-2 h-11 rounded-sm" data-testid="signup-institution">
              <SelectValue placeholder="Select your institution" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id} className="rounded-[8px]" data-testid={`institution-option-${i.code}`}>
                  {i.name} — @{i.domains.join(", @")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("institution_id")}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label className="font-mono text-[11px] uppercase tracking-widest">Password</Label>
            <Input type="password" value={form.password} onChange={(e) => set("password")(e.target.value)}
              className="mt-2 h-11 rounded-sm" data-testid="signup-password" />
            {fieldError("password")}
          </div>
          <div>
            <Label className="font-mono text-[11px] uppercase tracking-widest">Confirm password</Label>
            <Input type="password" value={form.confirm_password}
              onChange={(e) => set("confirm_password")(e.target.value)} className="mt-2 h-11 rounded-sm"
              data-testid="signup-confirm-password" />
            {fieldError("confirm_password")}
          </div>
        </div>

        <div className="flex items-start gap-3 border border-border bg-muted/60 p-4">
          <Checkbox id="consent" checked={form.consent_accepted}
            onCheckedChange={(v) => set("consent_accepted")(Boolean(v))} data-testid="signup-consent" />
          <Label htmlFor="consent" className="text-xs font-normal leading-relaxed text-muted-foreground">
            {consentText}
          </Label>
        </div>
        {fieldError("consent_accepted")}

        {serverError ? (
          <div role="alert" className="flex gap-2 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            data-testid="signup-server-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <Button type="submit" disabled={loading}
          className="h-11 w-full rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
          data-testid="signup-submit">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create account
        </Button>
      </form>
    </AuthShell>
  );
};

export default SignupForm;
