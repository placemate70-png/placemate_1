"""Resume parsing: PDF text extraction (pypdf) + NLP entity/skill extraction (spaCy).

Skills are matched with a PhraseMatcher against a curated vocabulary rather than
relying on spaCy's NER — the small English model classifies "Python" as a GPE
(a place), so NER alone is useless for technical skills. The vocabulary maps raw
resume terms onto the 12 tracked skills the readiness engine scores against.
"""

import io
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s-]?)?(?:\d{10}|\d{5}[\s-]\d{5}|\d{3}[\s-]\d{3}[\s-]\d{4})")
DEGREE_RE = re.compile(
    r"\b(B\.?\s?Tech|B\.?E\.?|B\.?Sc|B\.?C\.?A|M\.?\s?Tech|M\.?Sc|M\.?C\.?A|MBA|Ph\.?D|Bachelor|Master)\b",
    re.I,
)
CGPA_RE = re.compile(r"\b(?:CGPA|GPA|Percentage)\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)\b", re.I)
GRAD_YEAR_RE = re.compile(r"\b(20[1-3]\d)\b")

# raw resume term -> canonical tracked skill
SKILL_VOCABULARY = {
    "Programming Fundamentals": [
        "python", "java", "c++", "c programming", "golang", "go lang", "ruby",
        "javascript", "typescript", "kotlin", "object oriented programming", "oops",
    ],
    "Data Structures": ["data structures", "linked list", "binary tree", "hash map", "heap", "graph theory"],
    "Algorithms": ["algorithms", "dynamic programming", "sorting", "searching", "greedy", "recursion",
                   "time complexity", "leetcode", "competitive programming"],
    "Databases": ["sql", "postgresql", "postgres", "mysql", "sqlite", "mongodb", "oracle",
                  "database", "dbms", "redis", "supabase", "firebase"],
    "Operating Systems": ["operating systems", "linux", "unix", "shell scripting", "multithreading",
                          "concurrency", "process scheduling"],
    "Computer Networks": ["computer networks", "tcp/ip", "http", "networking", "dns", "rest api", "socket"],
    "Aptitude": ["quantitative aptitude", "logical reasoning", "verbal ability", "aptitude"],
    "Communication": ["communication", "presentation", "public speaking", "teamwork", "leadership",
                      "collaboration", "stakeholder"],
    "Statistics": ["statistics", "probability", "pandas", "numpy", "excel", "tableau", "power bi",
                   "data analysis", "hypothesis testing", "regression"],
    "Machine Learning": ["machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn",
                         "sklearn", "nlp", "natural language processing", "computer vision", "neural network"],
    "Web Development": ["react", "reactjs", "angular", "vue", "node.js", "nodejs", "express",
                        "django", "flask", "fastapi", "html", "css", "tailwind", "next.js", "frontend",
                        "backend", "full stack"],
    "Cloud & DevOps": ["aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform",
                       "jenkins", "ci/cd", "devops", "github actions", "cloud"],
}

_nlp = None


def get_nlp():
    """Load the spaCy pipeline once; return None if the model is unavailable."""
    global _nlp
    if _nlp is None:
        try:
            import spacy

            # Only the tokenizer + NER are needed; skip the rest for speed.
            _nlp = spacy.load("en_core_web_sm", disable=["lemmatizer", "textcat"])
        except Exception as exc:
            logger.warning("spaCy model unavailable (%s); falling back to regex-only parsing", exc)
            _nlp = False
    return _nlp or None


def extract_text(pdf_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        logger.warning("PDF text extraction failed: %s", exc)
        return ""


def match_skills(text: str) -> tuple[list, list]:
    """Return (tracked canonical skills, raw matched terms)."""
    lowered = text.lower()
    tracked, raw = [], []
    nlp = get_nlp()

    if nlp is not None:
        from spacy.matcher import PhraseMatcher

        matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
        for canonical, terms in SKILL_VOCABULARY.items():
            matcher.add(canonical, [nlp.make_doc(t) for t in terms])
        doc = nlp.make_doc(text)
        for match_id, start, end in matcher(doc):
            canonical = nlp.vocab.strings[match_id]
            if canonical not in tracked:
                tracked.append(canonical)
            term = doc[start:end].text
            if term not in raw:
                raw.append(term)
    else:
        # Regex fallback keeps parsing usable without the spaCy model installed.
        for canonical, terms in SKILL_VOCABULARY.items():
            for term in terms:
                if re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", lowered):
                    if canonical not in tracked:
                        tracked.append(canonical)
                    if term not in raw:
                        raw.append(term)
    return tracked, raw


def heading_name(text: str) -> Optional[str]:
    """Positional heuristic: the name is the first short, title-case, digit-free line.

    Needed because en_core_web_sm frequently fails to tag Indian names as PERSON,
    and a resume's name is almost always the first heading line.
    """
    for line in text.strip().splitlines()[:6]:
        candidate = line.strip()
        if not (2 <= len(candidate.split()) <= 4):
            continue
        if any(ch.isdigit() for ch in candidate) or "@" in candidate:
            continue
        if any(word in candidate.lower() for word in ("resume", "curriculum", "vitae", "profile")):
            continue
        words = candidate.split()
        if all(w[:1].isupper() and w.replace(".", "").isalpha() for w in words):
            return candidate
    return None


def extract_person(text: str) -> Optional[str]:
    # Names live at the top of a resume; parsing the first lines is enough.
    head = "\n".join(text.strip().splitlines()[:8])
    nlp = get_nlp()
    if nlp is not None:
        for ent in nlp(head).ents:
            if ent.label_ == "PERSON" and 2 <= len(ent.text.split()) <= 4:
                return ent.text.strip()
    return heading_name(text)


def parse_resume(pdf_bytes: bytes) -> dict:
    """Extract structured fields from a PDF resume. Never raises."""
    text = extract_text(pdf_bytes)
    if not text.strip():
        return {
            "parsed": False, "reason": "No extractable text (likely a scanned image PDF)",
            "skills": [], "raw_skills": [], "name": None, "email": None,
            "phone": None, "degree": None, "cgpa": None, "graduation_year": None,
        }

    tracked, raw = match_skills(text)
    email = EMAIL_RE.search(text)
    phone = PHONE_RE.search(text)
    degree = DEGREE_RE.search(text)
    cgpa_match = CGPA_RE.search(text)

    cgpa = None
    if cgpa_match:
        try:
            value = float(cgpa_match.group(1))
            cgpa = value if 0 <= value <= 10 else None  # ignore percentages
        except ValueError:
            cgpa = None

    years = [int(y) for y in GRAD_YEAR_RE.findall(text)]
    return {
        "parsed": True,
        "skills": tracked,
        "raw_skills": raw[:40],
        "name": extract_person(text),
        "email": email.group(0) if email else None,
        "phone": phone.group(0).strip() if phone else None,
        "degree": degree.group(0) if degree else None,
        "cgpa": cgpa,
        "graduation_year": max(years) if years else None,
        "characters": len(text),
    }
