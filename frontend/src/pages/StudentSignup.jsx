import SignupForm from "@/components/SignupForm";

export default function StudentSignup() {
  return (
    <SignupForm
      role="student"
      label="Student registration"
      title="Create your placement profile"
      subtitle="Your institution and department are required so the right coordinator can support you."
      loginPath="/student/login"
      consentText="I accept the terms of use and privacy notice. I understand my resume, assessment scores and readiness status become visible to the verified placement coordinator of my department only after I explicitly enable sharing in my profile, and that every access is recorded."
    />
  );
}
