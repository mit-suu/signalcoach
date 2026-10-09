import type {
  ApiErrorBody,
  MeResponse,
  Principle,
  PublicGuide,
  PublicUser,
  SessionSummary,
  SessionView,
  TurnEvent,
} from "@/types/api";

/** All calls go to same-origin /api (rewritten to Express), so the auth cookie rides along. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Mất kết nối. Kiểm tra mạng rồi thử lại.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Lỗi ${res.status}`);
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  guides: () => request<{ guides: PublicGuide[] }>("/guides").then((r) => r.guides),
  guide: (id: string) => request<{ guide: PublicGuide }>(`/guides/${encodeURIComponent(id)}`).then((r) => r.guide),
  principles: () => request<{ principles: Principle[] }>("/principles").then((r) => r.principles),

  me: () => request<MeResponse>("/auth/me"),
  register: (body: { email: string; password: string; displayName?: string }) =>
    request<{ user: PublicUser }>("/auth/register", json(body)).then((r) => r.user),
  login: (body: { email: string; password: string }) =>
    request<{ user: PublicUser }>("/auth/login", json(body)).then((r) => r.user),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  sessions: () => request<{ sessions: SessionSummary[] }>("/sessions").then((r) => r.sessions),
  session: (id: string) => request<{ session: SessionView }>(`/sessions/${id}`).then((r) => r.session),
  createSession: (guideId: string) =>
    request<{ session: SessionView }>("/sessions", json({ guideId })).then((r) => r.session),
  endSession: (id: string) => request<{ session: SessionView }>(`/sessions/${id}/end`, { method: "POST" }).then((r) => r.session),
  deleteSession: (id: string) => request<void>(`/sessions/${id}`, { method: "DELETE" }),
  deleteAllSessions: () => request<{ deleted: number }>("/sessions", { method: "DELETE" }),
};

/**
 * POST a question and consume the Server-Sent Events reply stream.
 * (EventSource can't POST, so the stream is parsed by hand.)
 */
export async function sendTurn(
  sessionId: string,
  body: { text: string; clientMessageId: string },
  onEvent: (e: TurnEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/sessions/${sessionId}/turns`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Mất kết nối. Kiểm tra mạng rồi thử lại.");
  }
  if (!res.ok || !res.body) {
    const err = ((await res.json().catch(() => null)) as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Lỗi ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) onEvent({ event, data: JSON.parse(data) } as TurnEvent);
    }
  }
}
