"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { ApiError, api, sendTurn } from "@/lib/api";
import type { PublicGuide, SessionView, Turn } from "@/types/api";
import { ArrowRight, Avatar } from "@/components/BrandMark";

interface Pending {
  text: string;
  clientMessageId: string;
}

export function SessionRoom({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [guide, setGuide] = useState<PublicGuide | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null); // persona reply in progress
  const [failed, setFailed] = useState<Pending | null>(null); // NFR-3: keep the question for retry
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .session(sessionId)
      .then(async (s) => {
        setSession(s);
        setGuide(await api.guide(s.guideId));
      })
      .catch((e: ApiError) => setLoadError(e));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [session?.turns.length, streaming]);

  async function ask(pending: Pending) {
    if (!session) return;
    setError(null);
    setFailed(null);
    setStreaming("");
    const optimistic: Turn = { index: session.turns.length, role: "user", text: pending.text };
    setSession((s) => (s && !s.turns.some((t) => t.index === optimistic.index) ? { ...s, turns: [...s.turns, optimistic] } : s));

    let finished = false;
    try {
      await sendTurn(sessionId, pending, (e) => {
        if (e.event === "delta") setStreaming((prev) => (prev ?? "") + e.data.text);
        if (e.event === "done") {
          finished = true;
          setSession((s) => {
            if (!s) return s;
            const turns = [...s.turns.filter((t) => t.index !== e.data.turn.index), e.data.turn];
            return { ...s, turns, questionCount: turns.filter((t) => t.role === "user").length };
          });
        }
        if (e.event === "error") setError(e.data.message);
      });
    } catch (e) {
      setError((e as Error).message);
    }
    setStreaming(null);
    if (!finished) setFailed(pending);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || streaming !== null) return;
    setDraft("");
    void ask({ text, clientMessageId: crypto.randomUUID() });
  }

  async function end() {
    // TODO(S05): confirm dialog when signals remain + route to scorecard (S06/S07).
    const s = await api.endSession(sessionId);
    setSession(s);
    router.push("/history");
  }

  if (loadError) {
    // S14 — session not found (old link / deleted / other browser)
    return (
      <div className="state-msg">
        <h2>Buổi luyện này không còn trên trình duyệt này</h2>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
          <Link href="/" className="btn btn-primary">Luyện buổi mới</Link>
        </div>
      </div>
    );
  }
  if (!session || !guide) return <div className="state-msg muted">Đang mở buổi luyện…</div>;

  const personaShort = guide.persona.name.split(" ").at(-1)!;
  const active = session.status === "active";

  return (
    <div className="session">
      <aside className="session-aside">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Avatar initial={guide.persona.initial} size={64} />
          <div>
            <h4 style={{ margin: 0 }}>{guide.persona.name}, {guide.persona.age}</h4>
            <div className="muted" style={{ fontSize: 13 }}>{guide.persona.tagline}</div>
          </div>
        </div>
        <div>
          <h6 className="muted">Mục tiêu</h6>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{guide.goal}</p>
        </div>
        <div className="suggested" style={{ flex: 1, borderBottom: 0 }}>
          <h6 className="muted">Câu hỏi gợi ý</h6>
          {guide.suggestedQuestions.map((q) => (
            <div key={q}>{q}</div>
          ))}
        </div>
      </aside>

      <section className="session-main">
        <header className="session-header">
          <div style={{ marginRight: "auto" }}>
            <div className="card-kicker">{guide.context}</div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{guide.title}</div>
          </div>
          <div style={{ fontSize: 14 }}>{session.questionCount} câu hỏi</div>
          {active && (
            <button className="btn btn-secondary" onClick={end} disabled={streaming !== null}>
              Kết thúc
            </button>
          )}
        </header>

        <div className="transcript">
          {session.turns.map((t) => (
            <div key={t.index} className={`turn ${t.role}`}>
              <div className="turn-who">
                <b>{t.role === "user" ? "Bạn" : personaShort}</b>
                <span className="muted">#{String(t.index).padStart(2, "0")}</span>
              </div>
              <p>{t.text}</p>
            </div>
          ))}
          {streaming !== null && (
            <div className="turn persona">
              <div className="turn-who"><b>{personaShort}</b></div>
              {streaming ? <p>{streaming}</p> : <div className="typing"><span /><span /><span /></div>}
            </div>
          )}
          {failed && (
            <div className="turn" style={{ background: "var(--color-accent-100)" }}>
              <div className="turn-who"><b>Lỗi</b></div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span>{error ?? `${personaShort} chưa trả lời được.`}</span>
                <button className="btn btn-secondary" onClick={() => ask(failed)}>Thử lại</button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {active ? (
          <form className="composer" onSubmit={submit}>
            <input
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Hỏi ${personaShort} điều gì đó…`}
              maxLength={2000}
              disabled={streaming !== null}
              autoFocus
            />
            <button className="btn btn-primary" disabled={!draft.trim() || streaming !== null}>
              Gửi
              <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <div className="composer muted">Buổi luyện đã kết thúc.</div>
        )}
      </section>
    </div>
  );
}
