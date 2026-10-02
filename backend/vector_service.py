"""ChromaDB vector store for semantic role matching.

Used for the brief's "suitable-role recommendation": a student's skill profile is
embedded and compared against embedded role requirement documents, so a resume
mentioning "Postgres" matches a role needing "Databases" even though the strings
differ — something the exact-match dictionary lookup cannot do.

Deterministic skill-match remains the dominant term in the final ranking; the
vector score only refines it. If ChromaDB is unavailable the whole module
degrades to deterministic ranking rather than failing the request.
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

from assessments import ROLE_REQUIREMENTS

logger = logging.getLogger(__name__)

CHROMA_DIR = os.environ.get("CHROMA_DIR", str(Path(__file__).parent / ".chroma"))
ROLE_COLLECTION = "role_requirements"
STUDENT_COLLECTION = "student_profiles"

# Deterministic skill-match dominates; the embedding only breaks ties and
# rewards adjacent experience the requirement table doesn't encode.
DETERMINISTIC_WEIGHT = 0.65
SEMANTIC_WEIGHT = 0.35

_client = None
_ready = False


def role_document(role: str) -> str:
    requirements = ROLE_REQUIREMENTS.get(role, {})
    skills = ", ".join(f"{skill} (level {level})" for skill, level in requirements.items())
    return f"{role}. Required skills: {skills}."


def get_client():
    global _client
    if _client is None:
        try:
            import chromadb

            Path(CHROMA_DIR).mkdir(parents=True, exist_ok=True)
            _client = chromadb.PersistentClient(path=CHROMA_DIR)
        except Exception as exc:
            logger.warning("ChromaDB unavailable (%s); semantic matching disabled", exc)
            _client = False
    return _client or None


def init_vector_store() -> bool:
    """Embed the role catalogue. Safe to call repeatedly (upsert)."""
    global _ready
    client = get_client()
    if client is None:
        return False
    try:
        collection = client.get_or_create_collection(ROLE_COLLECTION)
        roles = list(ROLE_REQUIREMENTS)
        collection.upsert(
            ids=roles,
            documents=[role_document(r) for r in roles],
            metadatas=[{"role": r} for r in roles],
        )
        _ready = True
        logger.info("Vector store ready: %d roles embedded", len(roles))
        return True
    except Exception as exc:
        logger.warning("Vector store init failed (%s); semantic matching disabled", exc)
        return False


def profile_document(skills: List[str], levels: Dict[str, float], headline: str = "") -> str:
    measured = ", ".join(f"{s} (level {round(v, 1)})" for s, v in sorted(levels.items()))
    declared = ", ".join(skills or [])
    return f"{headline}. Declared skills: {declared}. Assessed levels: {measured}."


def upsert_student(user_id: str, document: str, department: str = "") -> None:
    client = get_client()
    if client is None:
        return
    try:
        collection = client.get_or_create_collection(STUDENT_COLLECTION)
        collection.upsert(ids=[user_id], documents=[document], metadatas=[{"department": department}])
    except Exception as exc:
        logger.warning("Student embedding upsert failed: %s", exc)


def semantic_role_scores(document: str) -> Dict[str, float]:
    """Map role -> similarity in 0..1. Empty dict when unavailable."""
    client = get_client()
    if client is None or not document.strip():
        return {}
    try:
        collection = client.get_or_create_collection(ROLE_COLLECTION)
        if collection.count() == 0:
            init_vector_store()
        result = collection.query(query_texts=[document], n_results=len(ROLE_REQUIREMENTS))
        ids = result.get("ids", [[]])[0]
        distances = result.get("distances", [[]])[0]
        if not ids:
            return {}
        # Chroma returns squared L2 distance; invert into a bounded similarity.
        return {role: 1.0 / (1.0 + float(dist)) for role, dist in zip(ids, distances)}
    except Exception as exc:
        logger.warning("Semantic role query failed: %s", exc)
        return {}


def recommend_roles(
    skills: List[str],
    levels: Dict[str, float],
    headline: str = "",
    top_k: Optional[int] = None,
) -> List[dict]:
    """Rank every known role by fit. Always returns a full ranking."""
    from ai_service import compute_gaps  # local import avoids a circular import

    document = profile_document(skills, levels, headline)
    semantic = semantic_role_scores(document)

    ranked = []
    for role in ROLE_REQUIREMENTS:
        computed = compute_gaps(role, levels)
        deterministic = computed["skill_match"]
        sem = semantic.get(role)
        if sem is None:
            fit = deterministic
            method = "deterministic"
        else:
            fit = DETERMINISTIC_WEIGHT * deterministic + SEMANTIC_WEIGHT * sem
            method = "hybrid"
        top_gaps = [g for g in computed["gaps"] if g["gap"] > 0][:3]
        ranked.append(
            {
                "role": role,
                "fit_score": int(round(fit * 100)),
                "skill_match": int(round(deterministic * 100)),
                "semantic_score": int(round(sem * 100)) if sem is not None else None,
                "method": method,
                "strengths": computed["strengths"][:3],
                "top_gaps": [g["skill"] for g in top_gaps],
            }
        )

    ranked.sort(key=lambda r: r["fit_score"], reverse=True)

    # Confidence. The deterministic half is driven by ASSESSED levels, so a
    # profile whose declared/resume skills sit outside the catalogue can still be
    # handed a confident-looking technical match. Flag that rather than presenting
    # a weak match as a firm recommendation.
    # Declared skills are raw resume terms ("React", "Docker"); the catalogue uses
    # canonical names ("Web Development"). Map through the parser's vocabulary
    # first, otherwise the overlap is spuriously zero for everyone.
    from resume_parser import SKILL_VOCABULARY

    catalogue_skills = {s.lower() for req in ROLE_REQUIREMENTS.values() for s in req}
    raw_declared = [str(s).strip() for s in (skills or []) if str(s).strip()]
    declared = set()
    for raw in raw_declared:
        term = raw.lower()
        if term in catalogue_skills:
            declared.add(term)
            continue
        for canonical, terms in SKILL_VOCABULARY.items():
            if term in terms and canonical.lower() in catalogue_skills:
                declared.add(canonical.lower())
                break
    overlap = len(declared)
    best_match = ranked[0]["skill_match"] if ranked else 0
    spread = (ranked[0]["fit_score"] - ranked[-1]["fit_score"]) if len(ranked) > 1 else 0

    reasons = []
    if best_match < 50:
        reasons.append("your assessed skill levels are below every role's requirements")
    # Compare the RAW declared count against the MAPPED overlap: using the mapped
    # set for both meant "nothing mapped" short-circuited to "no warning".
    if raw_declared and overlap == 0:
        reasons.append("none of your declared skills map to the skills this catalogue tracks")
    if spread < 8:
        reasons.append("all roles score within a few points, so the ranking is not meaningful")

    for row in ranked:
        row["low_confidence"] = bool(reasons)
        row["confidence_note"] = (
            "Treat this as indicative only — " + "; ".join(reasons) + "." if reasons else ""
        )

    return ranked[:top_k] if top_k else ranked
