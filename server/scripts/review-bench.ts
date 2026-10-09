/**
 * Re-run the review + self-check pass on a stored session and time it — for tuning the review model.
 *   npx tsx --env-file-if-exists=.env scripts/review-bench.ts <sessionId>
 *   LLM_MODEL_REVIEW=gemini-3.5-flash LLM_REASONING_REVIEW=medium npx tsx --env-file-if-exists=.env scripts/review-bench.ts <sessionId>
 * Does not write anything back.
 */
import { env, llmRoles } from "../src/config/env";
import { connectDb, disconnectDb } from "../src/config/db";
import { loadContent } from "../src/services/content.service";
import { SessionModel } from "../src/models/session.model";
import { generateScorecard } from "../src/agent/review";

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("usage: review-bench <sessionId>");
  loadContent();
  await connectDb();
  const session = await SessionModel.findById(id);
  if (!session) throw new Error("session not found");
  console.log(`→ provider=${env.LLM_PROVIDER} review=${llmRoles.review.model} thinking=${llmRoles.review.reasoningEffort ?? "-"} turns=${session.turns.length}`);
  const t0 = performance.now();
  const { scorecard, log } = await generateScorecard(session);
  console.log(`took ${((performance.now() - t0) / 1000).toFixed(1)}s · score=${scorecard.score} · corrections=${log.length}`);
  for (const s of scorecard.signals) console.log(` - ${s.label}: ${s.status}${s.evidenceTurn !== null ? ` (#${s.evidenceTurn})` : ""}`);
  console.log(` feedback: ${scorecard.feedback.map((f) => `#${f.turnIndex}:${f.type}`).join(", ") || "-"}`);
  console.log(` focus: ${scorecard.focus.map((f) => f.skill).join(" | ")}`);
  await disconnectDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
