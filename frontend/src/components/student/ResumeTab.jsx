import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, fileUrl, formatApiError } from "@/lib/api";

const STAGE_COPY = {
  uploading: "Uploading your resume…",
  parsing: "Analyzing your resume…",
  analyzing: "Detecting skill gaps…",
};

export const ResumeTab = ({ profile, onSaved, onAnalyzed }) => {
  const inputRef = useRef(null);
  const [stage, setStage] = useState("");        // uploading | parsing | analyzing | ""
  const [parsed, setParsed] = useState(null);
  const [gapNotice, setGapNotice] = useState("");

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);

    setParsed(null);
    setGapNotice("");
    setStage("uploading");
    try {
      setStage("parsing");
      const { data } = await api.post("/student/resume", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setParsed(data.parsed || null);

      if (data.parsed?.parsed) {
        const added = data.parsed.skills_added?.length || 0;
        toast.success(added ? `Resume analyzed — ${added} new skill(s) added` : "Resume analyzed");
      } else {
        toast.warning(data.parsed?.reason || "Resume stored, but no text could be extracted");
      }
      await onSaved();

      // Chain straight into skill-gap detection so the student never has to
      // remember a second button. Needs at least one assessment, so a 400 here
      // is a normal state, not an error.
      setStage("analyzing");
      try {
        await api.post("/student/analyze", { target_role: null });
        toast.success("Skill gaps updated");
        await onAnalyzed?.();
      } catch (gapErr) {
        setGapNotice(formatApiError(gapErr));
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setStage("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const view = async () => {
    try {
      const { data } = await api.get("/student/resume/link");
      window.open(fileUrl(data.download_token), "_blank", "noopener");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const busy = Boolean(stage);
  const facts = parsed
    ? [
        ["Name", parsed.name, User],
        ["Email", parsed.email, Mail],
        ["Phone", parsed.phone, Phone],
        [
          "Education",
          [parsed.degree, parsed.cgpa ? `CGPA ${parsed.cgpa}` : null, parsed.graduation_year]
            .filter(Boolean)
            .join(" · "),
          GraduationCap,
        ],
      ].filter(([, value]) => value)
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" data-testid="student-resume-tab">
      <div className="space-y-6">
        <section className="border border-border bg-card p-8">
          <h3 className="font-display text-xl font-semibold tracking-tight">Resume</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            PDF only, max 5 MB. Parsed on upload to prefill your skills — your own entries are never overwritten.
          </p>

          <div className="mt-8 border border-dashed border-foreground/25 bg-muted/40 p-10 text-center">
            {busy ? (
              <>
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-foreground" strokeWidth={1.5} />
                <p className="mt-4 font-mono text-sm font-bold" data-testid="resume-analyzing">
                  {STAGE_COPY[stage]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Extracting text, then matching skills against your target role.
                </p>
              </>
            ) : (
              <>
                <FileText className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                {profile.resume_file_id ? (
                  <>
                    <p className="mt-4 font-mono text-sm font-bold" data-testid="resume-filename">
                      {profile.resume_filename}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Uploaded and linked to your profile</p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">No resume uploaded yet</p>
                )}
              </>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={upload}
              className="hidden"
              data-testid="resume-file-input"
            />
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0A0A0A]"
                data-testid="resume-upload-button"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {profile.resume_file_id ? "Replace resume" : "Upload resume"}
              </Button>
              {profile.resume_file_id && !busy ? (
                <Button variant="outline" onClick={view} className="rounded-full" data-testid="resume-view-button">
                  <Eye className="mr-2 h-4 w-4" /> View via signed link
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        {parsed ? (
          <section className="border border-border bg-card p-8" data-testid="resume-parsed-panel">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Extracted from your resume
              </p>
            </div>

            {parsed.parsed ? (
              <>
                {facts.length ? (
                  <dl className="mt-6 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
                    {facts.map(([label, value, Icon]) => (
                      <div key={label} className="bg-card p-5">
                        <dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          <Icon className="h-3 w-3" /> {label}
                        </dt>
                        <dd className="mt-2 break-words text-sm font-medium" data-testid={`parsed-${label.toLowerCase()}`}>
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Skills detected ({parsed.skills?.length || 0})
                </p>
                <div className="mt-3 flex flex-wrap gap-2" data-testid="parsed-skills">
                  {(parsed.skills || []).map((skill) => (
                    <span
                      key={skill}
                      className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
                        parsed.skills_added?.includes(skill)
                          ? "border-volt bg-volt/20"
                          : "border-border"
                      }`}
                    >
                      {skill}
                    </span>
                  ))}
                  {!parsed.skills?.length ? (
                    <span className="text-sm text-muted-foreground">No tracked skills matched.</span>
                  ) : null}
                </div>

                {parsed.raw_skills?.length ? (
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Matched terms:</span>{" "}
                    {parsed.raw_skills.slice(0, 14).join(", ")}
                  </p>
                ) : null}

                {gapNotice ? (
                  <p
                    className="mt-6 flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700"
                    data-testid="resume-gap-notice"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {gapNotice}
                  </p>
                ) : (
                  <p className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Skill-gap analysis refreshed
                  </p>
                )}
              </>
            ) : (
              <p
                className="mt-6 flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700"
                data-testid="resume-parse-failed"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {parsed.reason || "No text could be extracted."} Add your skills manually on the Profile tab.
              </p>
            )}
          </section>
        ) : null}
      </div>

      <aside className="border border-border bg-card p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">How access works</p>
        <ul className="mt-5 space-y-4 text-sm text-muted-foreground">
          <li className="border-l-2 border-volt pl-4">Downloads use a signed link that expires in 5 minutes.</li>
          <li className="border-l-2 border-volt pl-4">
            Only the verified coordinator who owns your institution and department can request a link.
          </li>
          <li className="border-l-2 border-volt pl-4">
            Every coordinator resume view is written to the audit log with a timestamp.
          </li>
          <li className="border-l-2 border-volt pl-4">
            Parsing runs server-side with spaCy; the file itself never leaves object storage.
          </li>
        </ul>
      </aside>
    </div>
  );
};

export default ResumeTab;
