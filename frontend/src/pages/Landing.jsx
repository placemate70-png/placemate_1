import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BarChart3, FileCheck2, Hexagon, ShieldCheck } from "lucide-react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

import SpecularButton from "@/components/ui/SpecularButton";
import SkillEngineDiagram from "@/components/SkillEngineDiagram";

// Monochrome specular rim, Swiss/high-contrast per design_guidelines.colors:
// obsidian black + stark white. Volt is deliberately NOT used here — it is
// reserved for AI skill-gap highlights, not general CTAs.
const SPECULAR_BASE = {
  as: Link,
  size: "sm",
  radius: 999, // clamps to a pill against the button's own height
  intensity: 1.2,
  thickness: 2,
  shineSize: 34, // travelling streak rather than a pinpoint glint
  shineFade: 46,
  // rad/s. The streak is symmetric (two 180° apart), so a visual cycle is half a
  // revolution: 0.22 => ~28s per turn, ~14s per cycle — a slow drift, not a spin.
  speed: 0.22,
  autoAnimate: true, // always-on rim, not gated behind cursor proximity
  proximity: 420,
};

// Dark pill: white rim on obsidian, the reference treatment.
const SPECULAR_SOLID = {
  ...SPECULAR_BASE,
  tint: "#0A0A0A",
  tintOpacity: 1,
  textColor: "#FFFFFF",
  lineColor: "#FFFFFF",
  baseColor: "#525252",
};

// Swiss/high-contrast hover per design_guidelines.visual_enhancers.hover_states:
// lift + a strict crisp shadow, replacing the component's soft ambient default.
const CTA_MOTION = "!shadow-none hover:-translate-y-1 hover:!shadow-md";

const ROLES = [
  {
    key: "student",
    label: "01 / Student",
    title: "Build a placement profile",
    copy: "Upload your resume, take skill assessments and see exactly which gaps stand between you and your target role.",
    login: "/student/login",
    signup: "/student/signup",
    icon: BarChart3,
  },
  {
    key: "coordinator",
    label: "02 / Placement Coordinator",
    title: "Monitor your department",
    copy: "Verified access to your own institution and department only. Review resumes, mark readiness, publish openings.",
    login: "/coordinator/login",
    signup: "/coordinator/signup",
    icon: FileCheck2,
  },
  {
    key: "admin",
    label: "03 / Administrator",
    title: "Govern the ecosystem",
    copy: "Manage approved institutions and verified domains, disable accounts and review the full audit trail.",
    login: "/admin/login",
    signup: null,
    icon: ShieldCheck,
  },
];

// Every `to` here is a real route in App.jsx — the footer links to nothing that
// does not exist, so none of these can rot into a redirect back to "/".
const FOOTER_COLUMNS = [
  {
    title: "Portals",
    links: [
      { label: "Student", to: "/student/login", testId: "footer-student-login" },
      { label: "Coordinator", to: "/coordinator/login", testId: "footer-coordinator-login" },
      { label: "Admin", to: "/admin/login", testId: "footer-admin-login" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Create student account", to: "/student/signup", testId: "footer-student-signup" },
      { label: "Register as coordinator", to: "/coordinator/signup", testId: "footer-coordinator-signup" },
      { label: "Reset password", to: "/forgot-password", testId: "footer-forgot-password" },
    ],
  },
];

export default function Landing() {
  // Inertial smooth scrolling, scoped to this page: the instance is destroyed on
  // unmount so the dashboards keep native scrolling.
  //
  // The prefers-reduced-motion check is deliberate belt-and-braces — Lenis already
  // forces isSmooth=false under `reduce`, but bailing here also avoids constructing
  // the instance and running a permanent rAF loop that could never do anything.
  // Under `reduce`, native scroll is the correct behaviour, not a degraded one.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let frame = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Floating pill bar: the header itself is the sticky spacer, the inner
          rounded container is the visible surface. Glass per design_guidelines
          (backdrop-blur-xl + bg-white/70, never fully transparent) and a 1px
          border instead of an outer shadow. */}
      <header className="sticky top-4 z-40 mt-4 px-6">
        {/* Below sm the logo + 3 nav items exceed the bar's inner width, so the row
            wraps and centres instead of overflowing the viewport (a pill can't be
            rounded-full once it is two rows tall). */}
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-6 gap-y-1 rounded-3xl border border-border bg-white/75 px-6 py-3 backdrop-blur-xl sm:flex-nowrap sm:justify-between sm:rounded-full">
          <div className="flex items-center gap-2">
            <Hexagon className="h-5 w-5" strokeWidth={2.5} />
            <span className="font-display text-lg font-semibold tracking-tight">PlaceMate</span>
          </div>
          <nav className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em]">
            <Link
              to="/student/login"
              data-testid="nav-student-login"
              className="px-3 py-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Student
            </Link>
            <Link
              to="/coordinator/login"
              data-testid="nav-coordinator-login"
              className="px-3 py-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Coordinator
            </Link>
            <Link
              to="/admin/login"
              data-testid="nav-admin-login"
              className="ml-2 rounded-full bg-[#0A0A0A] px-4 py-2 text-white transition-transform duration-200 ease-out hover:-translate-y-0.5"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-6 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:py-28">
          <div className="rise">
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Skill-gap intelligence for campus placement
            </p>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[0.95] tracking-tighter sm:text-5xl lg:text-6xl">
              Know the gap.
              <br />
              <span className="relative inline-block">
                Close the gap.
                <span className="absolute -bottom-1 left-0 h-3 w-full bg-volt/70" aria-hidden="true" />
              </span>
              <br />
              Get placed.
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground">
              Students measure readiness against real role requirements. Coordinators see only their own department,
              with every resume view and score access recorded.
            </p>
          </div>

          <SkillEngineDiagram />
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 py-20">
        <h2 className="font-display text-lg font-semibold tracking-tight md:text-lg">Choose your entry point</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Each role has a dedicated portal. Accounts are activated by email verification, and coordinators must match an
          approved institution domain.
        </p>
        <div className="mt-10 grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-3">
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <article key={role.key} className="group flex flex-col bg-card" data-testid={`entry-${role.key}`}>
                <div className="flex flex-1 flex-col p-8">
                  <Icon className="mb-6 h-6 w-6 text-volt" strokeWidth={2} />
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{role.label}</p>
                  <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">{role.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{role.copy}</p>
                  <div className="mt-8 flex items-center gap-3">
                    <SpecularButton
                      {...SPECULAR_SOLID}
                      to={role.login}
                      data-testid={`entry-${role.key}-login`}
                      className={`gap-1.5 px-5 py-2.5 ${CTA_MOTION}`}
                    >
                      Sign in <ArrowUpRight className="h-3.5 w-3.5" />
                    </SpecularButton>
                    {role.signup ? (
                      <Link
                        to={role.signup}
                        data-testid={`entry-${role.key}-signup`}
                        className="text-sm font-medium underline decoration-volt decoration-2 underline-offset-4 transition-colors duration-200 hover:text-muted-foreground"
                      >
                        Create account
                      </Link>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Invite only
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border bg-[#0A0A0A]">
        <div className="mx-auto max-w-[1400px] px-6 py-16">
          <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2 text-white">
                <Hexagon className="h-5 w-5" strokeWidth={2.5} />
                <span className="font-display text-lg font-semibold tracking-tight">PlaceMate</span>
              </div>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/50">
                Skill-gap analysis and placement readiness for college students and placement coordinators. Readiness
                scores are deterministic and explainable — the model writes the narrative, never the score.
              </p>
              {/* The two compliance lines that previously were the entire footer,
                  kept verbatim and promoted into a callout. */}
              <div className="mt-7 flex max-w-md gap-3 border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="h-4 w-4 shrink-0 text-volt" strokeWidth={2} />
                <p className="font-mono text-[10px] uppercase leading-[1.7] tracking-[0.14em] text-white/45">
                  Sensitive student data hidden by default · Resume access is consent-gated and audited
                </p>
              </div>
            </div>

            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">{column.title}</p>
                <ul className="mt-5 space-y-3.5">
                  {column.links.map(({ label, to, testId }) => (
                    <li key={to}>
                      <Link
                        to={to}
                        data-testid={testId}
                        className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-14 border-t border-white/10 pt-7 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/35">
              © 2026 PlaceMate · Find your gap. Find your career.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
