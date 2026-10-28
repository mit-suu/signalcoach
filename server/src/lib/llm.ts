import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI, ApiError as GeminiApiError, type Content, type ThinkingLevel } from "@google/genai";
import { env, type ReasoningEffort } from "../config/env";
import { logger } from "../config/logger";
import { mockCompleteJson, mockStreamText } from "./llm.mock";

/**
 * Single port for every LLM call. The agent code never knows which provider is behind it,
 * so swapping Gemini ↔ Claude ↔ an OpenAI-compatible endpoint ↔ the offline mock is an env change.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** Thinking effort. Gemini: thinkingLevel (minimal is fastest); Claude: output_config.effort; OpenAI-compatible: reasoning_effort. */
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
  /** Optional JSON schema the provider may enforce on completeJson output (Gemini responseJsonSchema). */
  jsonSchema?: Record<string, unknown>;
}

export interface LlmClient {
  streamChat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<string>;
  completeJson(messages: ChatMessage[], opts: ChatOptions): Promise<string>;
}

/** Thrown when every key/model/retry failed — the caller turns it into a user-facing, retryable error. */
export class LlmUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini
// ─────────────────────────────────────────────────────────────────────────────

function toGemini(messages: ChatMessage[]): { system: string; contents: Content[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    contents.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] });
  }
  // Gemini expects the first content to come from the user; sessions open with the persona speaking.
  if (contents[0]?.role === "model") contents.unshift({ role: "user", parts: [{ text: "(Buổi phỏng vấn bắt đầu.)" }] });
  return { system, contents };
}

const statusOf = (err: unknown): number | undefined => {
  if (err instanceof GeminiApiError) return err.status;
  const e = err as { status?: number; code?: number };
  return typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : undefined;
};

/** 401/403/429 → key problem (try the backup key). 404/500/503 → model problem (try a fallback model). */
const isKeyError = (s: number | undefined) => s === 401 || s === 403 || s === 429;
const isModelError = (s: number | undefined) => s === 404 || s === 500 || s === 503 || s === 502 || s === 504;

function createGemini(): LlmClient {
  const keys = env.GEMINI_API_KEYS;
  let keyIndex = 0;
  const clients = keys.map((apiKey) => new GoogleGenAI({ apiKey, httpOptions: { timeout: env.LLM_TIMEOUT_MS } }));

  const config = (opts: ChatOptions, json: boolean) => ({
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
    abortSignal: opts.signal,
    ...(opts.reasoningEffort && opts.reasoningEffort !== "none" && { thinkingConfig: { thinkingLevel: opts.reasoningEffort as unknown as ThinkingLevel } }),
    ...(json && { responseMimeType: "application/json", ...(opts.jsonSchema && { responseJsonSchema: opts.jsonSchema }) }),
  });

  /**
   * Attempt plan: [primary model, ...fallbacks] × [current key, next key…], plus one plain retry (NFR-3).
   * Each attempt is a function so streaming can bail out before the first token and move on.
   */
  async function withFailover<T>(model: string, run: (client: GoogleGenAI, model: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const models = [model, ...env.models.fallbacks.filter((m) => m !== model)];
    let lastErr: unknown;
    for (const m of models) {
      for (let k = 0; k < keys.length; k++) {
        const idx = (keyIndex + k) % keys.length;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (signal?.aborted) throw lastErr ?? new Error("aborted");
          try {
            const out = await run(clients[idx]!, m);
            keyIndex = idx; // stick with a key that works
            return out;
          } catch (err) {
            lastErr = err;
            const status = statusOf(err);
            logger.warn({ model: m, key: idx, attempt, status, msg: (err as Error).message?.slice(0, 200) }, "LLM call failed");
            if (isKeyError(status)) break; // next key
            if (isModelError(status)) {
              if (attempt === 0 && status === 503) continue; // one quick retry on overload, then fallback model
              k = keys.length; // skip remaining keys for this model
              break;
            }
            if (status === 400) throw err; // our bug (bad request) — retrying won't help
            // network/timeout/unknown → retry once, then move on
          }
        }
      }
    }
    throw new LlmUnavailableError("LLM unavailable after retries", lastErr);
  }

  return {
    async *streamChat(messages, opts) {
      const { system, contents } = toGemini(messages);
      const stream = await withFailover(
        opts.model,
        (client, model) =>
          client.models.generateContentStream({
            model,
            contents,
            config: { systemInstruction: system || undefined, ...config(opts, false) },
          }),
        opts.signal,
      );
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    },
    async completeJson(messages, opts) {
      const { system, contents } = toGemini(messages);
      const res = await withFailover(
        opts.model,
        (client, model) =>
          client.models.generateContent({
            model,
            contents,
            config: { systemInstruction: system || undefined, ...config({ temperature: 0, ...opts }, true) },
          }),
        opts.signal,
      );
      return res.text ?? "";
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic (Claude)
// ─────────────────────────────────────────────────────────────────────────────

function toClaude(messages: ChatMessage[]): { system: string; messages: Anthropic.MessageParam[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const out: Anthropic.MessageParam[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // Claude also expects the first message to come from the user.
  if (out[0]?.role === "assistant") out.unshift({ role: "user", content: "(Buổi phỏng vấn bắt đầu.)" });
  return { system, messages: out };
}

function createAnthropic(): LlmClient {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: 2, // SDK retries 429/5xx/network with backoff
  });
  const wrap = (err: unknown) =>
    err instanceof Anthropic.BadRequestError ? err : new LlmUnavailableError("LLM unavailable after retries", err);

  /**
   * Haiku 5.5 rejects non-default temperature, so it is never sent.
   * none/minimal → thinking off at low effort (persona/judge sit on the 3s first-token budget, NFR-1);
   * low/medium/high → adaptive thinking at that effort.
   * Thinking tokens count against max_tokens, while callers size maxTokens for the visible answer:
   * measured 2026-10-28, effort high spent all 8192 tokens thinking and returned no text at all.
   */
  const THINKING_HEADROOM = 32_000;
  const params = (opts: ChatOptions, system: string, messages: Anthropic.MessageParam[]) => {
    const off = !opts.reasoningEffort || opts.reasoningEffort === "none" || opts.reasoningEffort === "minimal";
    return {
      model: opts.model,
      max_tokens: (opts.maxTokens ?? 16000) + (off ? 0 : THINKING_HEADROOM),
      ...(system && { system }),
      messages,
      thinking: off ? ({ type: "disabled" } as const) : ({ type: "adaptive" } as const),
      output_config: { effort: off ? ("low" as const) : (opts.reasoningEffort as "low" | "medium" | "high") },
    };
  };

  return {
    async *streamChat(messages, opts) {
      const { system, messages: msgs } = toClaude(messages);
      try {
        const stream = client.messages.stream(params(opts, system, msgs), { signal: opts.signal });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") logger.warn({ model: opts.model, stopDetails: final.stop_details }, "LLM refused");
      } catch (err) {
        if (opts.signal?.aborted) return;
        throw wrap(err);
      }
    },
    async completeJson(messages, opts) {
      // No prefill on current Claude models: ask for JSON in the system prompt; callers run extractJson on the reply.
      const { system, messages: msgs } = toClaude(messages);
      const jsonRule = opts.jsonSchema
        ? `Reply with a single JSON object only, no prose or code fences, matching this JSON schema:\n${JSON.stringify(opts.jsonSchema)}`
        : "Reply with a single JSON object only, no prose or code fences.";
      // Streamed even though we only want the final message: a long thinking phase would otherwise hit the HTTP timeout.
      let res: Anthropic.Message;
      try {
        res = await client.messages.stream(params(opts, [system, jsonRule].filter(Boolean).join("\n\n"), msgs), { signal: opts.signal }).finalMessage();
      } catch (err) {
        throw wrap(err);
      }
      if (res.stop_reason === "refusal") logger.warn({ model: opts.model, stopDetails: res.stop_details }, "LLM refused");
      if (res.stop_reason === "max_tokens") {
        logger.warn({ model: opts.model, usage: res.usage }, "LLM reply cut off at max_tokens");
        throw new LlmUnavailableError("LLM reply cut off at max_tokens");
      }
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible (/v1) — kept for self-hosted models
// ─────────────────────────────────────────────────────────────────────────────

function createOpenAiCompatible(): LlmClient {
  const client = new OpenAI({
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY || "not-needed",
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: 1, // NFR-3: retry once, then surface the error
  });
  const wrap = (err: unknown) => (statusOf(err) === 400 ? err : new LlmUnavailableError("LLM unavailable after retries", err));

  return {
    async *streamChat(messages, opts) {
      let stream;
      try {
        stream = await client.chat.completions.create(
          {
            model: opts.model,
            messages,
            stream: true,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens,
            ...(opts.reasoningEffort && { reasoning_effort: opts.reasoningEffort }),
          },
          { signal: opts.signal },
        );
      } catch (err) {
        throw wrap(err);
      }
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
    async completeJson(messages, opts) {
      try {
        const res = await client.chat.completions.create(
          {
            model: opts.model,
            messages,
            temperature: opts.temperature ?? 0,
            max_tokens: opts.maxTokens,
            response_format: { type: "json_object" },
            ...(opts.reasoningEffort && { reasoning_effort: opts.reasoningEffort }),
          },
          { signal: opts.signal },
        );
        return res.choices[0]?.message?.content ?? "";
      } catch (err) {
        throw wrap(err);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock — offline stand-in for tests and UI work (see llm.mock.ts)
// ─────────────────────────────────────────────────────────────────────────────

function createMock(): LlmClient {
  return {
    async *streamChat(messages, opts) {
      for (const word of mockStreamText(messages).split(/(?<= )/)) {
        if (opts.signal?.aborted) return;
        await new Promise((r) => setTimeout(r, 15));
        yield word;
      }
    },
    async completeJson(messages) {
      return mockCompleteJson(messages);
    },
  };
}

export const llm: LlmClient =
  env.LLM_PROVIDER === "mock"
    ? createMock()
    : env.LLM_PROVIDER === "gemini"
      ? createGemini()
      : env.LLM_PROVIDER === "anthropic"
        ? createAnthropic()
        : createOpenAiCompatible();
