import type { QuestionType, SessionSummary } from "@/types/api";

/**
 * Pure data for the /history progress chart. Only type-only imports, so `node --test` can run
 * this file with native TypeScript stripping (see progress.test.ts).
 */

export type MistakeType = Exclude<QuestionType, "good">;

/** Fixed order (server QUESTION_TYPES minus `good`) so a type keeps its colour across sessions. */
export const MISTAKE_TYPES: readonly MistakeType[] = ["leading", "closed", "vague", "double", "future", "bare_why", "over_talking"];

export const MAX_SESSIONS = 20;
/** The trend compares the last TREND_RECENT sessions with every earlier one in the window. */
export const TREND_RECENT = 3;
export const TREND_MIN_SESSIONS = TREND_RECENT + 1;
/** At most this many x labels per breakpoint; the rest are thinned (always keeping the latest). */
export const X_LABELS_DESKTOP = 10;
export const X_LABELS_MOBILE = 5;

export const EMPTY_TEXT = "Luyện xong một buổi là bạn sẽ thấy điểm ở đây.";
export const ONE_SESSION_TEXT = "Luyện thêm một buổi nữa để so với lần này.";

/** Why a session has no score, in plain words — shown instead of a bare "—". */
export function unscoredReason(s: Pick<SessionSummary, "status" | "score" | "counts">): string | null {
  if (s.score !== null) return null;
  switch (s.status) {
    case "active":
      return "Buổi này chưa xong";
    case "insufficient":
      return "Buổi ngắn quá, chưa chấm điểm";
    case "incomplete":
      return "Dừng sớm nên chưa chấm điểm";
    default:
      return s.counts ? "Buổi này chưa chấm được điểm" : "Chưa có bảng đánh giá. Mở buổi này để thử lại";
  }
}

export interface ProgressSlot {
  id: string;
  href: string;
  startedAt: string;
  guideTitle: string;
  /** Score in whole percent, or null when the session wasn't scored. */
  pct: number | null;
  /** Plain reason when pct is null. */
  reason: string | null;
  segments: { type: MistakeType; count: number }[];
  total: number;
  /** Show the x label at desktop / mobile widths. */
  labelDesktop: boolean;
  labelMobile: boolean;
}

export interface TrendRow {
  type: MistakeType;
  /** Mistakes of this type per question, 0..n. */
  recentRate: number;
  earlierRate: number;
  dir: "down" | "up" | "same";
}

export interface Progress {
  /** Window: latest MAX_SESSIONS ended sessions, oldest first. Slot index = x position for both charts. */
  slots: ProgressSlot[];
  /** Scored slots only, for the line (unscored slots are bridged). */
  points: { slot: number; pct: number }[];
  caption: string;
  /** Message under / instead of the chart, or null. */
  hint: string | null;
  /** Largest bar total in the window (≥ 1, for scaling). */
  maxMistakes: number;
  /** Mistake types present anywhere in the window, in MISTAKE_TYPES order (legend). */
  usedTypes: MistakeType[];
  /** Over all ended sessions; null when there are fewer than TREND_MIN_SESSIONS. */
  trend: TrendRow[] | null;
}

const toPct = (score: number | null) => (score === null ? null : Math.round(score * 100));

/** Thin labels to at most `max`, counting back from the latest slot so it is always labelled. */
const showLabel = (i: number, n: number, max: number) => (n - 1 - i) % Math.ceil(n / max) === 0;

function rate(sessions: SessionSummary[], type: MistakeType): { mistakes: number; rate: number } {
  let mistakes = 0;
  let questions = 0;
  for (const s of sessions) {
    mistakes += s.mistakes?.[type] ?? 0;
    questions += s.questionCount;
  }
  return { mistakes, rate: questions > 0 ? mistakes / questions : 0 };
}

export function buildProgress(sessions: SessionSummary[]): Progress {
  const ended = sessions
    .filter((s) => s.status !== "active")
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const window = ended.slice(-MAX_SESSIONS);
  const n = window.length;

  const slots: ProgressSlot[] = window.map((s, i) => {
    const segments = MISTAKE_TYPES.map((type) => ({ type, count: s.mistakes?.[type] ?? 0 })).filter((x) => x.count > 0);
    return {
      id: s.id,
      href: `/session/${s.id}/scorecard`,
      startedAt: s.startedAt,
      guideTitle: s.guideTitle,
      pct: toPct(s.score),
      reason: unscoredReason(s),
      segments,
      total: segments.reduce((a, x) => a + x.count, 0),
      labelDesktop: showLabel(i, n, X_LABELS_DESKTOP),
      labelMobile: showLabel(i, n, X_LABELS_MOBILE),
    };
  });

  const points = slots.flatMap((s, slot) => (s.pct === null ? [] : [{ slot, pct: s.pct }]));
  const usedTypes = MISTAKE_TYPES.filter((t) => slots.some((s) => s.segments.some((x) => x.type === t)));

  let trend: TrendRow[] | null = null;
  // Over ALL ended sessions (not just the chart window): last TREND_RECENT vs every earlier one.
  if (ended.length >= TREND_MIN_SESSIONS) {
    const cut = ended.length - TREND_RECENT;
    trend = MISTAKE_TYPES.flatMap((type) => {
      const recent = rate(ended.slice(cut), type);
      const earlier = rate(ended.slice(0, cut), type);
      if (recent.mistakes === 0 && earlier.mistakes === 0) return [];
      // Compare at the displayed precision (whole percent) so the arrow never contradicts the numbers.
      const r = Math.round(recent.rate * 100);
      const e = Math.round(earlier.rate * 100);
      return [{ type, recentRate: recent.rate, earlierRate: earlier.rate, dir: r < e ? "down" : r > e ? "up" : "same" } satisfies TrendRow];
    });
  }

  return {
    slots,
    points,
    caption: ended.length > MAX_SESSIONS ? `${MAX_SESSIONS} buổi gần nhất` : n === 1 ? "1 buổi" : `${n} buổi`,
    hint: n === 0 ? EMPTY_TEXT : n === 1 ? ONE_SESSION_TEXT : null,
    maxMistakes: Math.max(1, ...slots.map((s) => s.total)),
    usedTypes,
    trend,
  };
}
