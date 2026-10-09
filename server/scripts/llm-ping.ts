/**
 * Check the LLM endpoint from server/.env and measure latency against NFR-1 (first token < 3s).
 *   npm run llm:ping            (needs LLM_PROVIDER=gemini + GEMINI_API_KEYS in .env)
 * Run it twice: the first call may include a cold start.
 */
import { env, llmRoles } from "../src/config/env";
import { llm } from "../src/lib/llm";

async function main() {
  if (env.LLM_PROVIDER === "mock") {
    console.error("Set LLM_PROVIDER=gemini (or openai_compatible) in server/.env first.");
    process.exit(1);
  }
  const { model, reasoningEffort } = llmRoles.persona;
  console.log(`→ provider=${env.LLM_PROVIDER}  model=${model}  reasoning=${reasoningEffort ?? "(not sent)"}  fallbacks=${env.models.fallbacks.join(",") || "-"}`);

  const t0 = performance.now();
  let ttft = 0;
  let text = "";
  for await (const delta of llm.streamChat(
    [
      { role: "system", content: "Bạn là Mai, 38 tuổi. Trả lời 1–2 câu, tiếng Việt, thân mật." },
      { role: "user", content: "Kể mình nghe hiện giờ chị theo dõi chi tiêu thế nào?" },
    ],
    { model, reasoningEffort, temperature: 0.8, maxTokens: 1024 },
  )) {
    if (!ttft) ttft = performance.now() - t0;
    text += delta;
  }
  const total = performance.now() - t0;

  console.log(`\n${text.trim() || "(empty reply — reasoning may have used all max_tokens)"}\n`);
  console.log(`first token: ${(ttft / 1000).toFixed(2)}s ${ttft && ttft < 3000 ? "✓" : "✗"} (NFR-1 < 3s)`);
  console.log(`total:       ${(total / 1000).toFixed(2)}s`);
}

main().catch((err) => {
  console.error("LLM call failed:", err?.status ?? "", err?.message ?? err);
  process.exit(1);
});
