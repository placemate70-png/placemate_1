"""Skill-gap analysis and roadmap generation.

Deterministic scoring is the source of truth. Google Gemini only adds the
narrative summary, recommendations and roadmap prose — and everything it returns
is validated before use, with a deterministic fallback on any failure. That keeps
readiness scores explainable ("transparent AI") and keeps the platform working
when the free-tier quota is exhausted.
"""

import asyncio
import json
import logging
import os
import re
from typing import Dict, List, Optional

from assessments import ROLE_REQUIREMENTS

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
# `gemini-flash-latest` tracks the current stable Flash model. Pinned versions
# (gemini-2.0-flash, gemini-2.5-flash) return 404 "no longer available to new
# users" on recently-created API keys, so an alias is the safer default.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")

READINESS_BANDS = [(80, "READY"), (60, "ALMOST_READY"), (40, "DEVELOPING"), (0, "NOT_READY")]

# Curated fallbacks so a roadmap still cites real resources when the LLM is
# unavailable — the brief requires resource recommendations, not just prose.
SKILL_RESOURCES = {
    "Programming Fundamentals": [("Python for Everybody", "https://www.py4e.com/", "course")],
    "Data Structures": [("NeetCode 150", "https://neetcode.io/practice", "practice")],
    "Algorithms": [("MIT 6.006 Intro to Algorithms", "https://ocw.mit.edu/6-006", "course")],
    "Databases": [("SQLBolt interactive SQL", "https://sqlbolt.com/", "practice")],
    "Operating Systems": [("OSTEP (free textbook)", "https://pages.cs.wisc.edu/~remzi/OSTEP/", "docs")],
    "Computer Networks": [("Computer Networking: A Top-Down Approach", "https://gaia.cs.umass.edu/kurose_ross/", "docs")],
    "Aptitude": [("IndiaBix Aptitude", "https://www.indiabix.com/aptitude/questions-and-answers/", "practice")],
    "Communication": [("Toastmasters Pathways", "https://www.toastmasters.org/", "course")],
    "Statistics": [("Khan Academy Statistics", "https://www.khanacademy.org/math/statistics-probability", "course")],
    "Machine Learning": [("Google ML Crash Course", "https://developers.google.com/machine-learning/crash-course", "course")],
    "Web Development": [("The Odin Project", "https://www.theodinproject.com/", "course")],
    "Cloud & DevOps": [("Docker Getting Started", "https://docs.docker.com/get-started/", "docs")],
}


def readiness_from_score(score: int) -> str:
    for threshold, label in READINESS_BANDS:
        if score >= threshold:
            return label
    return "NOT_READY"


def compute_gaps(target_role: str, skill_levels: Dict[str, float]) -> dict:
    requirements = ROLE_REQUIREMENTS.get(target_role) or next(iter(ROLE_REQUIREMENTS.values()))
    gaps: List[dict] = []
    for skill, required in requirements.items():
        current = round(float(skill_levels.get(skill, 0)), 2)
        gaps.append(
            {
                "skill": skill,
                "current": current,
                "required": required,
                "gap": round(max(0.0, required - current), 2),
            }
        )
    gaps.sort(key=lambda g: g["gap"], reverse=True)
    total_required = sum(g["required"] for g in gaps) or 1
    matched = sum(min(g["current"], g["required"]) for g in gaps)
    skill_match = matched / total_required
    strengths = [g["skill"] for g in gaps if g["gap"] <= 0.5][:5]
    return {"gaps": gaps, "skill_match": round(skill_match, 4), "strengths": strengths}


def profile_completeness(profile: dict) -> float:
    checks = [
        bool(profile.get("roll_number")),
        bool(profile.get("degree")),
        bool(profile.get("graduation_year")),
        profile.get("cgpa") is not None,
        bool(profile.get("target_role")),
        bool(profile.get("headline")),
        len(profile.get("skills") or []) >= 3,
        (profile.get("projects_count") or 0) > 0,
    ]
    return sum(1 for c in checks if c) / len(checks)


def compute_overall(skill_match: float, profile: dict, attempts_count: int) -> int:
    resume_score = 1.0 if profile.get("resume_file_id") else 0.0
    cgpa = profile.get("cgpa")
    cgpa_score = min(max((float(cgpa) - 5) / 5, 0), 1) if cgpa else 0.0
    experience = min((profile.get("projects_count") or 0) * 0.15 + (profile.get("internships_count") or 0) * 0.25, 1.0)
    coverage = min(attempts_count / 2, 1.0)
    score = (
        skill_match * 55
        + profile_completeness(profile) * 12
        + resume_score * 10
        + cgpa_score * 8
        + experience * 8
        + coverage * 7
    )
    return int(round(min(max(score, 0), 100)))


def gap_level(gap: dict) -> int:
    """Normalise a raw 0-5 gap into the brief's 0-100 `skill_gaps.gap_level`."""
    required = gap.get("required") or 1
    return int(round(100 * min(gap.get("gap", 0) / required, 1.0)))


# ---------- deterministic fallbacks ----------
def fallback_narrative(target_role: str, gaps: List[dict], score: int) -> dict:
    weak = [g for g in gaps if g["gap"] > 0][:4]
    recommendations = [
        f"Close the {g['skill']} gap ({g['current']}/{g['required']}) with 2 weeks of focused practice and one project artefact."
        for g in weak
    ] or [f"Maintain momentum with mock interviews for {target_role} and one portfolio project."]
    summary = (
        f"Readiness score {score}/100 for {target_role}. "
        + (f"Highest-impact gaps: {', '.join(g['skill'] for g in weak)}." if weak else "All core requirements are met.")
    )
    return {"summary": summary, "recommendations": recommendations[:5], "provider": "deterministic"}


def fallback_roadmap(target_role: str, gaps: List[dict], score: int) -> dict:
    weak = [g for g in gaps if g["gap"] > 0][:6] or gaps[:3]
    steps = []
    for index, gap in enumerate(weak, start=1):
        resources = [
            {"title": t, "url": u, "type": k} for t, u, k in SKILL_RESOURCES.get(gap["skill"], [])
        ]
        steps.append(
            {
                "order": index,
                "skill": gap["skill"],
                "action": f"Raise {gap['skill']} from level {gap['current']} to {gap['required']}.",
                "duration": "2 weeks" if gap["gap"] > 1.5 else "1 week",
                "resources": resources,
            }
        )
    return {
        "summary": f"A {len(steps)}-step plan to reach {target_role} readiness from {score}/100.",
        "steps": steps,
        "provider": "deterministic",
    }


def _extract_json(text: str) -> Optional[dict]:
    match = re.search(r"\{.*\}", text or "", re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


async def _gemini_json(system_prompt: str, payload: dict) -> Optional[dict]:
    """Call Gemini and return parsed JSON, or None on any failure."""
    if not GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            GEMINI_MODEL,
            system_instruction=system_prompt,
            generation_config={"response_mime_type": "application/json", "temperature": 0.4},
        )
        # The SDK is synchronous; keep it off the event loop.
        response = await asyncio.to_thread(model.generate_content, json.dumps(payload))
        return _extract_json(response.text)
    except Exception as exc:  # provider outage/quota must never block scoring
        logger.warning("Gemini call failed (%s); using deterministic fallback", exc)
        return None


async def ai_narrative(target_role: str, gaps: List[dict], score: int, profile: dict) -> dict:
    parsed = await _gemini_json(
        "You are a placement readiness analyst for Indian engineering students. "
        'Respond with STRICT JSON: {"summary": string (max 45 words), '
        '"recommendations": [3-5 concise actionable strings]}. '
        "Never invent numeric scores; use only the numbers provided.",
        {
            "target_role": target_role,
            "readiness_score": score,
            "skill_gaps": gaps,
            "cgpa": profile.get("cgpa"),
            "projects": profile.get("projects_count"),
            "internships": profile.get("internships_count"),
            "declared_skills": profile.get("skills"),
        },
    )
    if not parsed:
        return fallback_narrative(target_role, gaps, score)

    summary, recs = parsed.get("summary"), parsed.get("recommendations")
    if not isinstance(summary, str) or not isinstance(recs, list) or not recs:
        return fallback_narrative(target_role, gaps, score)
    recs = [str(r).strip() for r in recs if str(r).strip()][:5]
    if not recs:
        return fallback_narrative(target_role, gaps, score)
    return {"summary": summary.strip()[:400], "recommendations": recs, "provider": f"gemini/{GEMINI_MODEL}"}


async def ai_roadmap(target_role: str, gaps: List[dict], score: int, profile: dict) -> dict:
    """Personalized step-by-step preparation roadmap with learning resources."""
    parsed = await _gemini_json(
        "You are a placement mentor for Indian engineering students. Build a preparation "
        'roadmap as STRICT JSON: {"summary": string (max 40 words), "steps": [{"order": int, '
        '"skill": string, "action": string, "duration": string, "resources": '
        '[{"title": string, "url": string, "type": "course"|"docs"|"practice"}]}]}. '
        "Order steps by impact, 3-6 steps. Only cite well-known, free, real resources. "
        "Use only the skill names and numbers provided.",
        {
            "target_role": target_role,
            "readiness_score": score,
            "skill_gaps": gaps,
            "declared_skills": profile.get("skills"),
            "known_good_resources": {k: [t for t, _, _ in v] for k, v in SKILL_RESOURCES.items()},
        },
    )
    if not parsed:
        return fallback_roadmap(target_role, gaps, score)

    steps = parsed.get("steps")
    if not isinstance(steps, list) or not steps:
        return fallback_roadmap(target_role, gaps, score)

    valid_skills = {g["skill"] for g in gaps}
    clean: List[dict] = []
    for index, step in enumerate(steps[:6], start=1):
        if not isinstance(step, dict) or not step.get("skill"):
            continue
        # Reject hallucinated skills that aren't part of this role's requirements.
        if step["skill"] not in valid_skills:
            continue
        resources = []
        for res in step.get("resources") or []:
            if isinstance(res, dict) and res.get("title") and str(res.get("url", "")).startswith("http"):
                resources.append(
                    {
                        "title": str(res["title"])[:120],
                        "url": str(res["url"])[:300],
                        "type": res.get("type") if res.get("type") in {"course", "docs", "practice"} else "docs",
                    }
                )
        if not resources:
            resources = [{"title": t, "url": u, "type": k} for t, u, k in SKILL_RESOURCES.get(step["skill"], [])]
        clean.append(
            {
                "order": index,
                "skill": step["skill"],
                "action": str(step.get("action", ""))[:300],
                "duration": str(step.get("duration", "2 weeks"))[:40],
                "resources": resources[:4],
            }
        )

    if not clean:
        return fallback_roadmap(target_role, gaps, score)
    summary = parsed.get("summary")
    return {
        "summary": (summary if isinstance(summary, str) else "")[:400]
        or f"A {len(clean)}-step plan to reach {target_role} readiness.",
        "steps": clean,
        "provider": f"gemini/{GEMINI_MODEL}",
    }
