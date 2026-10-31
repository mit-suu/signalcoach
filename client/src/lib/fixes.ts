import type { QuestionType, Scorecard, Turn } from "@/types/api";
import { FIX_TITLE, QUESTION_WHY, plain, shortName } from "./labels.ts";

/**
 * "3 điều cần sửa ở buổi sau" — the first section of the scorecard. Each item is
 * asked → why it fell short → a better question, tied to a turn.
 * Source order: question feedback by impact (highest first), then missed clues that carry a
 * suggested question — skipped when the question right after the clue already has its own feedback
 * item, so one #NN is never cited twice. Pure, so `node --test` covers it (fixes.test.ts).
 */
export const MAX_FIXES = 3;

export interface Fix {
  key: string;
  /** "feedback" = a question the review flagged; "clue" = a missed clue with a suggested question. */
  source: "feedback" | "clue";
  title: string;
  /** Turn of the question the learner asked, or null when they never followed up. */
  turnIndex: number | null;
  asked: string | null;
  why: string;
  better: string;
  /** Principle anchor on /principles, when the fix comes from one. */
  principleId: string | null;
  principleName: string | null;
}

export function buildFixes(sc: Pick<Scorecard, "feedback" | "signals">, turns: Pick<Turn, "index" | "role" | "text">[], personaName: string, max = MAX_FIXES): Fix[] {
  const name = shortName(personaName);
  const fromFeedback: Fix[] = [...sc.feedback]
    .sort((a, b) => b.impact - a.impact || a.turnIndex - b.turnIndex)
    .map((f) => ({
      key: `q${f.turnIndex}`,
      source: "feedback" as const,
      title: FIX_TITLE[f.type as QuestionType] ?? plain(f.principleName, name),
      turnIndex: f.turnIndex,
      asked: f.original,
      why: QUESTION_WHY[f.type as QuestionType] ?? "",
      better: f.rewrite,
      principleId: f.principleId,
      principleName: plain(f.principleName, name),
    }));

  const feedbackTurns = new Set(sc.feedback.map((f) => f.turnIndex));
  const fromMissed: Fix[] = sc.signals
    .filter((s) => s.status === "missed" && s.suggestedQuestion)
    .sort((a, b) => (a.surfacedTurn ?? 0) - (b.surfacedTurn ?? 0))
    .flatMap((s) => {
      const next = s.surfacedTurn === null ? undefined : turns.find((t) => t.role === "user" && t.index > s.surfacedTurn!);
      if (next && feedbackTurns.has(next.index)) return [];
      const quote = s.personaQuote ? `“${s.personaQuote}”` : "một chi tiết đáng hỏi";
      const fix: Fix = {
        key: `s${s.signalId}`,
        source: "clue",
        title: `Hỏi sâu ngay khi ${name} nhắc thoáng qua`,
        turnIndex: next?.index ?? null,
        asked: next?.text ?? null,
        why: next
          ? `${name} vừa nói ${quote}. Câu tiếp theo của bạn chuyển sang chuyện khác, nên chi tiết đó trôi mất.`
          : `${name} vừa nói ${quote} nhưng bạn chưa hỏi lại.`,
        better: s.suggestedQuestion!,
        principleId: null,
        principleName: null,
      };
      return [fix];
    });

  return [...fromFeedback, ...fromMissed].slice(0, max);
}
