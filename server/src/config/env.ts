import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const effort = z.enum(["", "none", "minimal", "low", "medium", "high"]);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).default("signalcoach"),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    ANON_TOKEN_EXPIRES_IN: z.string().default("180d"),
    COOKIE_NAME: z.string().default("sc_token"),
    COOKIE_SECURE: bool.optional(),
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),

    CORS_ORIGINS: csv,
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    // ── LLM ──
    // mock → canned offline replies · gemini → Google Gemini API · openai_compatible → any /v1 endpoint
    LLM_PROVIDER: z.enum(["mock", "gemini", "openai_compatible"]).default("mock"),
    // One or more Gemini keys, comma-separated. The next key is used when the current one is
    // rejected or out of quota (401/403/429), so a backup key keeps the demo alive.
    GEMINI_API_KEYS: csv,
    // openai_compatible only
    LLM_BASE_URL: z.string().default(""),
    LLM_API_KEY: z.string().default(""),
    // Model per agent role. JUDGE/REVIEW fall back to PERSONA when empty.
    LLM_MODEL_PERSONA: z.string().default(""),
    LLM_MODEL_JUDGE: z.string().default(""),
    LLM_MODEL_REVIEW: z.string().default(""),
    // Models tried in order when the primary one is overloaded (503) or unavailable (404).
    LLM_MODEL_FALLBACKS: csv,
    // Thinking effort per role; empty = provider default. Persona/judge sit on the 3s first-token budget (NFR-1).
    LLM_REASONING_PERSONA: effort.default("minimal"),
    LLM_REASONING_JUDGE: effort.default("minimal"),
    LLM_REASONING_REVIEW: effort.default("high"),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  })
  .transform((e) => {
    // Measured 2026-10-09: 3.5-flash/minimal ≈ 1s to first token (NFR-1); 3.8-flash was 30–80s under load.
    const geminiDefaults = { persona: "gemini-3.5-flash", judge: "gemini-3.5-flash-lite", review: "gemini-3.5-flash" };
    const isGemini = e.LLM_PROVIDER === "gemini";
    const persona = e.LLM_MODEL_PERSONA || (isGemini ? geminiDefaults.persona : "");
    return {
      ...e,
      COOKIE_SECURE: e.COOKIE_SECURE ?? e.NODE_ENV === "production",
      isProd: e.NODE_ENV === "production",
      models: {
        persona,
        judge: e.LLM_MODEL_JUDGE || (isGemini ? geminiDefaults.judge : persona),
        review: e.LLM_MODEL_REVIEW || (isGemini ? geminiDefaults.review : persona),
        fallbacks: e.LLM_MODEL_FALLBACKS.length ? e.LLM_MODEL_FALLBACKS : isGemini ? ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] : [],
      },
    };
  })
  .superRefine((e, ctx) => {
    if (e.COOKIE_SAMESITE === "none" && !e.COOKIE_SECURE) {
      ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "SameSite=None requires COOKIE_SECURE=true" });
    }
    if (e.LLM_PROVIDER === "gemini" && e.GEMINI_API_KEYS.length === 0) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEYS"], message: "GEMINI_API_KEYS is required when LLM_PROVIDER=gemini" });
    }
    if (e.LLM_PROVIDER === "openai_compatible") {
      for (const key of ["LLM_BASE_URL", "LLM_MODEL_PERSONA"] as const) {
        if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when LLM_PROVIDER=openai_compatible` });
      }
    }
    if (e.isProd && e.LLM_PROVIDER === "mock") {
      ctx.addIssue({ code: "custom", path: ["LLM_PROVIDER"], message: "LLM_PROVIDER=mock is not allowed in production" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    // Logger depends on env, so fail loudly on stderr before anything else boots.
    console.error(`Invalid environment configuration:\n${lines.join("\n")}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";

/** Model + thinking effort per agent role. */
const role = (model: string, effort: string) => ({ model, reasoningEffort: (effort || undefined) as ReasoningEffort | undefined });
export const llmRoles = {
  persona: role(env.models.persona, env.LLM_REASONING_PERSONA),
  judge: role(env.models.judge, env.LLM_REASONING_JUDGE),
  review: role(env.models.review, env.LLM_REASONING_REVIEW),
};
