"use client";

import { LoadingState } from "@/components/LoadingState";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, api, sendTurn } from "@/lib/api";
import type { PublicGuide, SessionView, Turn } from "@/types/api";
import { ArrowRight, Avatar, BulbIcon } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { HINT_TEXT, ROOM_TIP, fmtTime, plain, shortName } from "@/lib/labels";
import { readHintsPref, writeHintsPref } from "@/lib/hints";

interface Pending {
  text: string;
  clientMessageId: string;
}

/** Hint shown under the persona reply it belongs to. */
interface ActiveHint {
  index: number;
  kind: "dig" | "open";
}

/**
 * The live interview. Streams the reply token by token, keeps the typed question on failure,
 * resumes where the user left off, coaches with optional hints (on by default, remembered per
 * browser), confirms early ends and shows the "reading the interview again" state while the
 * scorecard is built.
 */
export function SessionRoom({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [guide, setGuide] = useState<PublicGuide | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null); // reply in progress
  const [failed, setFailed] = useState<Pending | null>(null); // keep the question for retry
  const [error, setError] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [endProposed, setEndProposed] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [hint, setHint] = useState<ActiveHint | null>(null);
  const [hintsOn, setHintsOn] = useHintsPreference();
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
  }, [guide, session?.turns.length, streaming, failed, endProposed, hint]);

  const ask = useCallback(
    async (pending: Pending) => {
      if (!session) return;
      setError(null);
      setFailed(null);
      setStreaming("");
      setEndProposed(false);
      setHint(null);
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
              return { ...s, turns, questionCount: e.data.questionCount, signalsSurfaced: e.data.signalsSurfaced, endProposed: e.data.endProposed, personaLeft: e.data.personaLeft };
            });
            setEndProposed(e.data.endProposed);
            setHint(e.data.hint ? { index: e.data.turn.index, kind: e.data.hint.kind } : null);
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
    // Session not found (old link / deleted / other browser)
    return (
      <div className="wrap state-msg">
        <h2>Không tìm thấy buổi luyện này trên trình duyệt này</h2>
        <p className="muted">Có thể bạn đã xoá nó, hoặc đang mở ở trình duyệt khác với lúc luyện.</p>
        <div className="cta">
          <Link href="/" className="btn btn-primary">Luyện buổi mới</Link>
          <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
        </div>
      </div>
    );
  }
  if (!session || !guide) return <LoadingState label="Đang mở buổi luyện của bạn…" />;

  const name = shortName(guide.persona.name);
  const remaining = session.signalCount - session.signalsSurfaced;
  const lastSaved = session.turns.at(-1);
  const left = session.personaLeft;
  const busy = streaming !== null;
  const showHint = hintsOn && hint && !busy && !failed && !left && session.turns.at(-1)?.index === hint.index;
  const clueText = `${name} đã nhắc ${session.signalsSurfaced}/${session.signalCount} manh mối`;

  if (ending) {
    // The coach re-reads the whole interview before the scorecard
    return (
      <div className="wrap state-msg" aria-live="polite">
        <h2>Đang đọc lại buổi phỏng vấn của bạn</h2>
        <div className="turn-ticks" aria-hidden>
          {session.turns.map((t) => (
            <span key={t.index} className={t.role === "user" ? "tick user" : "tick"} />
          ))}
        </div>
        <p className="muted">{session.questionCount} câu hỏi · {session.signalCount} manh mối · thường chưa tới 30 giây</p>
      </div>
    );
  }

  return (
    <div className="wrap room">
      <aside className="room-side" aria-label="Thông tin buổi luyện">
        <div className="who-card">
          <Avatar initial={guide.persona.initial} size="lg" />
          <div>
            <span className="who-scenario">{guide.title}</span>
            <b>{name}, {guide.persona.age}</b>
            <span>{guide.persona.tagline}</span>
          </div>
        </div>
        <div className="side-goal">
          <span className="label">Mục tiêu buổi này</span>
          <p>{plain(guide.goal, name)}</p>
        </div>
        <div className="side-progress">
          <span className="label">Tiến độ</span>
          <p className="side-count"><b>{session.questionCount}</b> câu hỏi · khoảng {guide.estimatedMinutes} phút</p>
          <div className="pips" role="img" aria-label={clueText}>
            {Array.from({ length: session.signalCount }, (_, i) => (
              <i key={i} className={i < session.signalsSurfaced ? "on" : undefined} />
            ))}
          </div>
          <p className="small">{clueText}</p>
        </div>
        <div className="side-tip">
          <span className="label">Mẹo</span>
          <p>{ROOM_TIP}</p>
        </div>
        {guide.suggestedQuestions.length > 0 && (
          <div className="side-suggest">
            <span className="label">Câu mở đầu gợi ý</span>
            {guide.suggestedQuestions.map((q) => (
              <button key={q} type="button" className="suggested-q" onClick={() => { setDraft(q); inputRef.current?.focus(); }} disabled={busy || left}>
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="side-actions">
          <label className="switch">
            <input type="checkbox" checked={hintsOn} onChange={(e) => setHintsOn(e.target.checked)} />
            <span className="switch-track"><span className="switch-thumb" /></span>
            Gợi ý trong buổi
          </label>
          <button className="btn btn-secondary btn-end" onClick={() => (remaining > 0 && !left ? setConfirmEnd(true) : void end())} disabled={busy}>
            Kết thúc buổi
          </button>
        </div>
      </aside>

      <section className="chat" aria-label={`Trò chuyện với ${name}`}>
        {!online && (
          <div className="chat-banner offline">
            <span>Mất kết nối. Cuộc trò chuyện đã được lưu. Đang nối lại…</span>
          </div>
        )}
        {resumed && online && (
          <div className="chat-banner">
            <span>Tiếp tục từ chỗ bạn dừng{lastSaved?.createdAt ? ` lúc ${fmtTime(lastSaved.createdAt)}` : ""}.</span>
            <button className="btn-link" onClick={() => setResumed(false)}>Đóng</button>
          </div>
        )}

        <div className="msgs">
          {session.turns.map((t) => (
            <div key={t.index} className={`msg ${t.role}`}>
              <span className="who">{t.role === "user" ? "Bạn" : name}</span>
              <p>{t.text}</p>
            </div>
          ))}
          {busy && (
            <div className="msg persona">
              <span className="who">{name}</span>
              {streaming ? (
                <p>
                  {streaming}
                  <span className="caret" aria-hidden />
                </p>
              ) : (
                <div className="typing bubble" aria-label={`${name} đang trả lời`}><span /><span /><span /></div>
              )}
            </div>
          )}
          {showHint && (
            <div className="hint" role="note" aria-live="polite">
              <span className="hint-icon"><BulbIcon /></span>
              <div>
                <b>Gợi ý</b>
                <p>{hint.kind === "dig" ? HINT_TEXT.dig(name) : HINT_TEXT.open()}</p>
              </div>
              <button className="btn-link" type="button" onClick={() => setHintsOn(false)}>Tắt gợi ý</button>
            </div>
          )}
          {failed && (
            <div className="notice notice-error" role="alert">
              <span>{error ?? `${name} chưa trả lời được. Câu hỏi của bạn vẫn được giữ.`}</span>
              <button className="btn btn-primary btn-sm" onClick={() => ask(failed)} disabled={!online}>Gửi lại</button>
            </div>
          )}
          {(endProposed || left) && !busy && !failed && (
            // The persona proposed ending. After a goodbye, seeing the scorecard is the only way on.
            <div className="notice">
              <span>{left ? `${name} đã chào tạm biệt. Buổi phỏng vấn kết thúc rồi, xem bạn tìm được gì nhé.` : `${name} sắp phải đi. Kết thúc và xem bảng đánh giá nhé?`}</span>
              <div className="row">
                {!left && <button className="btn btn-secondary btn-sm" onClick={() => { setEndProposed(false); inputRef.current?.focus(); }}>Hỏi thêm một câu</button>}
                <button className="btn btn-primary btn-sm" onClick={end}>Xem bảng đánh giá <ArrowRight size={16} /></button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {session.questionCount === 0 && guide.suggestedQuestions.length > 0 && (
          <div className="suggest-chips" aria-label="Câu mở đầu gợi ý">
            {guide.suggestedQuestions.slice(0, 3).map((q) => (
              <button key={q} type="button" className="chip-btn" onClick={() => { setDraft(q); inputRef.current?.focus(); }} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
        )}

        <form className="composer" onSubmit={submit}>
          <input
            ref={inputRef}
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={left ? `${name} đã rời buổi phỏng vấn` : online ? `Hỏi ${name} điều gì đó…` : "Đang chờ kết nối…"}
            aria-label="Câu hỏi của bạn"
            maxLength={2000}
            disabled={busy || !online || left}
            autoFocus
            autoComplete="off"
          />
          <button className="btn btn-primary" disabled={!draft.trim() || busy || !online || left}>
            Gửi <ArrowRight size={16} />
          </button>
        </form>
      </section>

      {confirmEnd && (
        // Early end: some clues have not come up yet
        <Dialog title="Kết thúc ngay?" confirmLabel="Kết thúc" cancelLabel="Hỏi tiếp" onConfirm={end} onCancel={() => setConfirmEnd(false)}>
          <p>
            {name} vẫn còn chuyện muốn kể. Nếu dừng bây giờ, buổi này sẽ <strong>không có điểm</strong>, nhưng bạn vẫn nhận góp ý cho các câu hỏi.
          </p>
          <div className="pips" aria-hidden>
            {Array.from({ length: session.signalCount }, (_, i) => (
              <i key={i} className={i < session.signalsSurfaced ? "on" : undefined} />
            ))}
          </div>
          <p className="small">{clueText}</p>
          {session.questionCount < session.minQuestionsToScore && (
            <p className="small">Bạn mới hỏi {session.questionCount} câu. Cần ít nhất {session.minQuestionsToScore} câu để có góp ý.</p>
          )}
        </Dialog>
      )}
    </div>
  );
}

const hintsListeners = new Set<() => void>();
/** Set while storage is unavailable, so the switch still works for this page view; cleared on the next successful save. */
let hintsFallback: boolean | null = null;

/** window.localStorage itself can throw (blocked site data), so reach it inside a try. */
function hintsStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readHints(): boolean {
  return hintsFallback ?? readHintsPref(hintsStore());
}

/** Hints on/off, remembered in this browser. Defaults to on; storage errors never break the room. */
function useHintsPreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      hintsListeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        hintsListeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    readHints,
    () => true,
  );
  const set = useCallback((value: boolean) => {
    const ok = writeHintsPref(hintsStore(), value);
    hintsFallback = ok ? null : value;
    hintsListeners.forEach((cb) => cb());
  }, []);
  return [on, set];
}

/** Offline / online awareness: lock the composer, reconnect automatically. */
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
