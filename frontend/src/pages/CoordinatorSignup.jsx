import SignupForm from "@/components/SignupForm";

export default function CoordinatorSignup() {
  return (
    <SignupForm
      role="coordinator"
      label="Placement coordinator registration"
      title="Register coordinator access"
      subtitle="Your email domain must match the approved institution you select. Free-text institution names are not accepted."
      loginPath="/coordinator/login"
      consentText="I accept the terms of use and privacy notice. I confirm I am an authorised placement coordinator for the selected institution and department, and I understand that my resume views, score views, readiness changes and job edits are recorded in the audit log."
    />
  );
}
