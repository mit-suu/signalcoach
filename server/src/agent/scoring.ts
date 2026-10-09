import type { Scorecard } from "../types/scorecard";

/**
 * Signal Detection Score (PRD §3): (caught + ½·partial) / (total − unsure).
 * Denominator is always the full guide, so ending early can never inflate the score.
 */
export function countStatuses(statuses: string[]): Scorecard["counts"] {
  const counts = { caught: 0, partial: 0, missed: 0, unsure: 0, not_surfaced: 0, total: statuses.length };
  for (const s of statuses) if (s in counts && s !== "total") counts[s as keyof Omit<Scorecard["counts"], "total">] += 1;
  return counts;
}

export function computeScore(counts: Scorecard["counts"]): number | null {
  const denominator = counts.total - counts.unsure;
  if (denominator <= 0) return null;
  return Math.round(((counts.caught + 0.5 * counts.partial) / denominator) * 1000) / 1000;
}
