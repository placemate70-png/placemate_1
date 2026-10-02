/**
 * Shared gap severity logic.
 *
 * The backend stores `skill_gaps.gap_level` as 0-100 and reports carry raw 0-5
 * gaps, so both are normalised here to keep the Skill Gap and Progress tabs from
 * drifting apart on thresholds or colour.
 */

/** Normalise a report gap ({ skill, current, required, gap }) to 0-100. */
export function gapLevel(gap) {
  const required = gap?.required || 1;
  return Math.round(100 * Math.min(Math.max(gap?.gap ?? 0, 0) / required, 1));
}

/**
 * Red = critical, amber = moderate, green = on track.
 * Every level ships with a text label too, so severity is never colour-alone.
 */
export function severity(level) {
  if (level >= 50) {
    return {
      key: "critical",
      priority: "High",
      label: "Critical gap",
      bar: "bg-destructive",
      text: "text-destructive",
      chip: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  }
  if (level >= 20) {
    return {
      key: "moderate",
      priority: "Medium",
      label: "Moderate gap",
      bar: "bg-amber-500",
      text: "text-amber-600",
      chip: "border-amber-500/40 bg-amber-500/10 text-amber-700",
    };
  }
  return {
    key: "good",
    priority: "Low",
    label: "On track",
    bar: "bg-success",
    text: "text-success",
    chip: "border-success/40 bg-success/10 text-success",
  };
}

export const PROGRESS_STATUSES = ["pending", "in_progress", "completed"];

export const PROGRESS_LABELS = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};
