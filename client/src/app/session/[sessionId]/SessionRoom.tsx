"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, api, sendTurn } from "@/lib/api";
import type { PublicGuide, SessionView, Turn } from "@/types/api";
import { ArrowRight, Avatar } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { fmtTime, shortName } from "@/lib/labels";

interface Pending {
  text: string;
  clientMessageId: string;
}

/**
 * S03/S04 — the live interview. Streams the persona reply token by token, keeps the typed question
 * on failure (NFR-3), resumes where the user left off (FR-4), confirms early ends (S05) and shows
 * the "reading the interview again" state while the scorecard is built (S06).
 */
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
  const [resumed, setResumed] = useState(false);
  const [endProposed, setEndProposed] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const online = useOnline();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .session(sessionId)
      .then(async (s) => {
        if (s.status !== "active") {
          router.replace(`/session/${sessionId}/scorecard`);
          return;
        }
        setSession(s);
        setEndProposed(s.endProposed);
        setResumed(s.turns.length > 1); // came back to an interview in progress
        setGuide(await api.guide(s.guideId));
      })
      .catch((e: ApiError) => setLoadError(e));
  }, [sessionId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [session?.turns.length, streaming, failed, endProposed]);

  const ask = useCallback(
    async (pending: Pending) => {
      if (!session) return;
      setError(null);
      setFailed(null);
      setStreaming("");
      setEndProposed(false);
      const optimistic: Turn = { index: session.turns.length, role: "user", text: pending.text };
      setSession((s) => (s && !s.turns.some((t) => t.index === optimistic.index) ? { ...s, turns: [...s.turns, optimistic], questionCount: s.questionCount + 1 } : s));

      let finished = false;
      try {
        await sendTurn(sessionId, pending, (e) => {
          if (e.event === "accepted") {
            setSession((s) => (s ? { ...s, turns: s.turns.map((t) => (t.index === optimistic.index ? { ...t, index: e.data.index } : t)) } : s));
          }
          if (e.event === "delta") setStreaming((prev) => (prev ?? "") + e.data.text);
          if (e.event === "done") {
            finished = true;
            setSession((s) => {
              if (!s) return s;
              const turns = [...s.turns.filter((t) => t.index !== e.data.turn.index), e.data.turn].sort((a, b) => a.index - b.index);
              return { ...s, turns, questionCount: e.data.questionCount, signalsSurfaced: e.data.signalsSurfaced, endProposed: e.data.endProposed };
            });
            setEndProposed(e.data.endProposed);
          }
          if (e.event === "error") setError(e.data.message);
        });
      } catch (e) {
        setError((e as Error).message);
      }
      setStreaming(null);
      if (!finished) setFailed(pending);
      else setTimeout(() => inputRef.current?.focus(), 0);
    },
    [session, sessionId],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || streaming !== null) return;
    setDraft("");
    void ask({ text, clientMessageId: crypto.randomUUID() });
  }

  async function end() {
    setConfirmEnd(false);
    setEnding(true);
    try {
      await api.endSession(sessionId);
      router.push(`/session/${sessionId}/scorecard`);
    } catch (e) {
      setError((e as Error).message);
      setEnding(false);
    }
  }

  if (loadError) {
    // S14 — session not found (old link / deleted / other browser)
    return (
      <div className="state-msg">
        <h2>Buổi luyện này không còn trên trình duyệt này</h2>
        <p className="muted">Có thể bạn đã xoá nó, hoặc đang mở ở một trình duyệt khác với lúc luyện.</p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
          <Link href="/" className="btn btn-primary">Luyện buổi mới</Link>
        </div>
      </div>
    );
  }
  if (!session || !guide) return <div className="state-msg muted">Đang mở buổi luyện…</div>;

  const personaShort = shortName(guide.persona.name);
  const remaining = session.signalCount - session.signalsSurfaced;
  const lastSaved = session.turns.at(-1);

  if (ending) {
    // S06 — the agent re-reads the whole interview before the scorecard
    return (
      <div className="state-msg ending" aria-live="polite">
        <h2>Đang đọc lại buổi phỏng vấn</h2>
        <div className="turn-ticks">
          {session.turns.map((t) => (
            <span key={t.index} className={t.role === "user" ? "tick user" : "tick"} />
          ))}
        </div>
        <div className="muted" style={{ display: "flex", gap: 24, fontSize: 13 }}>
          <span>{session.questionCount} câu hỏi · {session.signalCount} tín hiệu</span>
          <span>Thường dưới 30 giây</span>
        </div>
      </div>
    );
  }

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
            <button key={q} type="button" className="suggested-q" onClick={() => setDraft(q)} disabled={streaming !== null}>
              {q}
            </button>
          ))}
        </div>
      </aside>

      <section className="session-main">
        <header className="session-header">
          <div style={{ marginRight: "auto", minWidth: 0 }}>
            <div className="card-kicker">{guide.context}</div>
            <div className="session-title">{guide.title}</div>
          </div>
          <div style={{ fontSize: 14 }} title="Số câu hỏi đã đặt">{session.questionCount} câu hỏi</div>
          <button className="btn btn-secondary" onClick={() => (remaining > 0 ? setConfirmEnd(true) : void end())} disabled={streaming !== null}>
            Kết thúc
          </button>
        </header>

        {!online && (
          <div className="session-banner offline">
            <span>Mất kết nối · đã lưu tới lượt #{String(lastSaved?.index ?? 0).padStart(2, "0")}</span>
            <span className="muted">Đang nối lại…</span>
          </div>
        )}
        {resumed && online && (
          <div className="session-banner">
            <span>Tiếp tục từ chỗ bạn dừng{lastSaved?.createdAt ? ` · ${fmtTime(lastSaved.createdAt)}` : ""}</span>
            <button className="btn btn-ghost" onClick={() => setResumed(false)}>Đóng</button>
          </div>
        )}

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
              {streaming ? (
                <p>
                  {streaming}
                  <span className="caret" aria-hidden />
                </p>
              ) : (
                <div className="typing" aria-label={`${personaShort} đang trả lời`}><span /><span /><span /></div>
              )}
            </div>
          )}
          {failed && (
            <div className="turn turn-error">
              <div className="turn-who"><b>Lỗi</b></div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span>{error ?? `${personaShort} chưa trả lời được. Câu hỏi của bạn vẫn được giữ.`}</span>
                <button className="btn btn-primary" onClick={() => ask(failed)} disabled={!online}>Thử lại</button>
              </div>
            </div>
          )}
          {endProposed && streaming === null && !failed && (
            // S04d — persona proposed ending: everything is out, scorecard ready
            <div className="turn turn-propose">
              <div className="turn-who"><b>Gợi ý</b></div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span>Kết thúc nhé? Bảng đánh giá đã sẵn sàng.</span>
                <button className="btn btn-ghost" onClick={() => { setEndProposed(false); inputRef.current?.focus(); }}>Hỏi thêm một câu</button>
                <button className="btn btn-primary" onClick={end}>Xem đánh giá <ArrowRight size={16} /></button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={submit}>
          <input
            ref={inputRef}
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={online ? `Hỏi ${personaShort} điều gì đó…` : "Đang chờ kết nối…"}
            maxLength={2000}
            disabled={streaming !== null || !online}
            autoFocus
            autoComplete="off"
          />
          <button className="btn btn-primary" disabled={!draft.trim() || streaming !== null || !online}>
            Gửi
            <ArrowRight size={16} />
          </button>
        </form>
      </section>

      {confirmEnd && (
        // S05 — early end: signals remain
        <Dialog title="Kết thúc ngay?" confirmLabel="Kết thúc" cancelLabel="Tiếp tục" onConfirm={end} onCancel={() => setConfirmEnd(false)}>
          <p style={{ margin: "0 0 10px" }}>
            {personaShort} vẫn còn điều muốn kể. Buổi này sẽ được lưu là <strong>chưa hoàn thành</strong> — không có điểm, nhưng bạn vẫn nhận góp ý cho các câu hỏi.
          </p>
          <div className="signal-dots" aria-hidden>
            {Array.from({ length: session.signalCount }, (_, i) => (
              <span key={i} className={`dot ${i < session.signalsSurfaced ? "dot-seeded" : "dot-pending"}`} />
            ))}
            <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{session.signalsSurfaced}/{session.signalCount} đã xuất hiện</span>
          </div>
          {session.questionCount < session.minQuestionsToScore && (
            <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              Mới {session.questionCount} câu hỏi — cần ít nhất {session.minQuestionsToScore} câu để có góp ý.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

/** S04e — offline / online awareness: lock the composer, reconnect automatically. */
function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
